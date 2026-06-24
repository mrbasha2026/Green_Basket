import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAllPages } from '@/lib/supabase'
import { mockInventory } from '@/lib/mockData'
import type { InventoryDaily } from '@/types'

export function useRecalculateInventoryDaily() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // 1. جلب كل المنتجات
      const { data: products, error: pErr } = await supabase
        .from('products').select('id')
      if (pErr) throw pErr

      // 2. جلب كل البيانات على دفعات لتجنب حد PostgREST الافتراضي
      const [allPurchases, allSales, allWaste, allInv] = await Promise.all([
        fetchAllPages((s, e) => supabase.from('purchases').select('product_id, date, total_weight, total_cost, cartons_qty, weight_per_carton, price_per_carton').order('date').range(s, e)),
        fetchAllPages((s, e) => supabase.from('sales').select('product_id, date, qty_kg, transaction_type').order('date').range(s, e)),
        fetchAllPages((s, e) => supabase.from('waste_log').select('product_id, date, waste_kg').order('date').range(s, e)),
        fetchAllPages((s, e) => supabase.from('inventory_daily').select('product_id, date, opening_stock_kg, opening_cost_per_kg, weighted_avg_cost').order('date').range(s, e)),
      ])

      const rowsToUpsert: Omit<InventoryDaily, 'id' | 'product'>[] = []

      // أول تكلفة/كغ لكل منتج من أقدم شراء — تُستخدم لتسعير المخزون الافتتاحي الصفري
      const firstCostMap = new Map<string, number>()
      for (const r of allPurchases) {
        if (!firstCostMap.has(r.product_id)) {
          const w = r.total_weight ?? r.cartons_qty * r.weight_per_carton
          const c = r.total_cost  ?? r.cartons_qty * r.price_per_carton
          if (w > 0) firstCostMap.set(r.product_id, c / w)
        }
      }

      for (const { id: pid } of products ?? []) {
        // أول سجل مخزون = نقطة البداية
        const opening = (allInv).find(i => i.product_id === pid)
        let prevStock = opening?.opening_stock_kg ?? 0
        let prevCost  = opening?.opening_cost_per_kg ?? opening?.weighted_avg_cost ?? 0
        const baseDate = opening?.date ?? '2000-01-01'

        // إذا التكلفة الافتتاحية صفر، نستخدم أول سعر شراء للمنتج كبداية
        if (prevCost === 0 && prevStock > 0) {
          prevCost = firstCostMap.get(pid) ?? 0
        }

        // كل التواريخ التي فيها نشاط بعد نقطة البداية
        const dates = [...new Set([
          ...(allPurchases).filter(r => r.product_id === pid && r.date > baseDate).map(r => r.date),
          ...(allSales).filter(r => r.product_id === pid && r.date > baseDate).map(r => r.date),
          ...(allWaste).filter(r => r.product_id === pid && r.date > baseDate).map(r => r.date),
        ])].sort()

        for (const date of dates) {
          const purch = (allPurchases).filter(r => r.product_id === pid && r.date === date)
          const sales = (allSales).filter(r => r.product_id === pid && r.date === date)
          const waste = (allWaste).filter(r => r.product_id === pid && r.date === date)

          const purchasedWeight = purch.reduce((s, r) => s + (r.total_weight ?? r.cartons_qty * r.weight_per_carton), 0)
          const purchaseCost    = purch.reduce((s, r) => s + (r.total_cost  ?? r.cartons_qty * r.price_per_carton), 0)
          const salesKg         = sales.reduce((s, r) => r.transaction_type === 'مرتجع_بيع' ? s - r.qty_kg : s + r.qty_kg, 0)
          const wasteKg         = waste.reduce((s, r) => s + r.waste_kg, 0)

          // الهالك يُخصم من مقام WAC → تكلفته تُحمَّل على المخزون المتبقي (ترتفع التكلفة/كغ)
          const totalValue     = prevStock * prevCost + purchaseCost
          const availableStock = prevStock + purchasedWeight
          const netForWac      = availableStock - wasteKg
          const wac            = netForWac > 0 ? totalValue / netForWac : prevCost
          const closingStock   = Math.max(0, prevStock + purchasedWeight - salesKg - wasteKg)

          rowsToUpsert.push({
            product_id: pid, date,
            opening_stock_kg:    prevStock,
            opening_cost_per_kg: prevCost,
            purchased_weight:    purchasedWeight,
            purchase_cost:       purchaseCost,
            waste_kg:            wasteKg,
            sales_kg:            salesKg,
            closing_stock_kg:    closingStock,
            weighted_avg_cost:   wac,
          })

          prevStock = closingStock
          prevCost  = wac
        }
      }

      // 3. حفظ inventory_daily دفعة واحدة
      if (rowsToUpsert.length > 0) {
        const BATCH = 500
        for (let i = 0; i < rowsToUpsert.length; i += BATCH) {
          const { error } = await supabase
            .from('inventory_daily')
            .upsert(rowsToUpsert.slice(i, i + BATCH), { onConflict: 'product_id,date' })
          if (error) throw error
        }

        // 4. تحديث purchase_price_per_kg في المبيعات بنفس المتوسط المرجح
        const SALES_BATCH = 20
        for (let i = 0; i < rowsToUpsert.length; i += SALES_BATCH) {
          await Promise.all(
            rowsToUpsert.slice(i, i + SALES_BATCH).map(r =>
              supabase.from('sales')
                .update({ purchase_price_per_kg: r.weighted_avg_cost })
                .eq('product_id', r.product_id)
                .eq('date', r.date)
            )
          )
        }
      }

      return rowsToUpsert.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useInventoryDaily(date?: string) {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', date],
    queryFn: async () => {
      if (USE_MOCK) return date ? mockInventory.filter(i => i.date === date) : mockInventory
      return fetchAllPages<InventoryDaily>((s, e) => {
        const q = supabase
          .from('inventory_daily')
          .select('*, product:products(*)')
          .order('date', { ascending: false })
          .range(s, e)
        if (date) q.eq('date', date)
        return q
      })
    },
  })
}

export function useUpsertInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: Omit<InventoryDaily, 'id' | 'product'>[]) => {
      if (USE_MOCK) return rows
      const { data, error } = await supabase
        .from('inventory_daily')
        .upsert(rows, { onConflict: 'product_id,date' })
        .select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useDeleteInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ product_id, date }: { product_id: string; date: string }) => {
      if (USE_MOCK) return
      const { error } = await supabase
        .from('inventory_daily')
        .delete()
        .eq('product_id', product_id)
        .eq('date', date)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

// Earliest (opening) record per product — used as the base for computing running balance
export function useEarliestInventory() {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', 'earliest'],
    queryFn: async () => {
      if (USE_MOCK) {
        const sorted = [...mockInventory].sort((a, b) => a.date.localeCompare(b.date))
        const seen = new Set<string>()
        return sorted.filter(i => { if (seen.has(i.product_id)) return false; seen.add(i.product_id); return true })
      }
      const { data, error } = await supabase.rpc('get_earliest_inventory')
      if (error) throw error
      return (data ?? []) as InventoryDaily[]
    },
  })
}

// Latest record per product up to (and including) the given date
export function useInventoryUpTo(date: string) {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', 'upto', date],
    queryFn: async () => {
      if (USE_MOCK) {
        const sorted = [...mockInventory]
          .filter(i => i.date <= date)
          .sort((a, b) => b.date.localeCompare(a.date))
        const seen = new Set<string>()
        return sorted.filter(i => { if (seen.has(i.product_id)) return false; seen.add(i.product_id); return true })
      }
      const { data, error } = await supabase.rpc('get_inventory_upto', { p_date: date })
      if (error) throw error
      return (data ?? []) as InventoryDaily[]
    },
  })
}

// All records in a date range (for movement report)
export function useInventoryRange(from: string, to: string) {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', 'range', from, to],
    queryFn: async () => {
      if (USE_MOCK) return mockInventory.filter(i => i.date >= from && i.date <= to)
      return fetchAllPages<InventoryDaily>((s, e) =>
        supabase
          .from('inventory_daily')
          .select('*, product:products(*)')
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false })
          .range(s, e)
      )
    },
  })
}

export function useInventoryByProduct(productId: string) {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', 'product', productId],
    queryFn: async () => {
      if (USE_MOCK) return mockInventory.filter(i => i.product_id === productId)
      const { data, error } = await supabase
        .from('inventory_daily')
        .select('*, product:products(*)')
        .eq('product_id', productId)
        .order('date', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as InventoryDaily[]
    },
  })
}
