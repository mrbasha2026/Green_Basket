import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockMonthlyPL } from '@/lib/mockData'
import type { CostAllocation, MonthlyPL } from '@/types'
import { computeProductAllocation, computeMonthlyPL, computeOverheadShare } from '@/lib/calculations'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useCostAllocation(year: number, month: number) {
  return useQuery<CostAllocation[]>({
    queryKey: ['cost_allocation', year, month],
    queryFn: async () => {
      if (USE_MOCK) return []
      const { data, error } = await supabase
        .from('cost_allocation')
        .select('*, product:products(*)')
        .eq('period_year', year)
        .eq('period_month', month)
      if (error) throw error
      return data as CostAllocation[]
    },
  })
}

export function useMonthlyPL(year: number, month: number) {
  return useQuery<MonthlyPL | null>({
    queryKey: ['monthly_pl', year, month],
    queryFn: async () => {
      if (USE_MOCK) return mockMonthlyPL
      const { data, error } = await supabase
        .from('monthly_pl')
        .select('*')
        .eq('period_year', year)
        .eq('period_month', month)
        .maybeSingle()
      if (error) throw error
      return data as MonthlyPL | null
    },
  })
}

export function useMonthlyPLHistory(months = 12) {
  return useQuery<MonthlyPL[]>({
    queryKey: ['monthly_pl', 'history', months],
    queryFn: async () => {
      if (USE_MOCK) return [mockMonthlyPL]
      const { data, error } = await supabase
        .from('monthly_pl')
        .select('*')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
        .limit(months)
      if (error) throw error
      return (data as MonthlyPL[]).reverse()
    },
  })
}

type DistMethod = 'revenue' | 'qty' | 'equal'

export function useCalculateCostAllocation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month, distMethod = 'revenue' }: { year: number; month: number; distMethod?: DistMethod }) => {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const to = new Date(year, month, 0).toISOString().split('T')[0]

      // 1. Sales by product
      const { data: salesData, error: salesErr } = await supabase
        .from('sales')
        .select('product_id, qty_kg, total_amount, purchase_price_per_kg')
        .gte('date', from).lte('date', to)
      if (salesErr) throw salesErr

      const salesByProduct = new Map<string, { qty: number; revenue: number; purchaseCost: number }>()
      for (const s of salesData ?? []) {
        const existing = salesByProduct.get(s.product_id) ?? { qty: 0, revenue: 0, purchaseCost: 0 }
        salesByProduct.set(s.product_id, {
          qty: existing.qty + Number(s.qty_kg),
          revenue: existing.revenue + Number(s.total_amount),
          purchaseCost: existing.purchaseCost + Number(s.qty_kg) * Number(s.purchase_price_per_kg ?? 0),
        })
      }

      const totalRevenue = Array.from(salesByProduct.values()).reduce((s, r) => s + r.revenue, 0)
      const totalQty = Array.from(salesByProduct.values()).reduce((s, r) => s + r.qty, 0)
      const productCount = salesByProduct.size

      // 2. Overhead
      const { data: ohData, error: ohErr } = await supabase
        .from('overhead_entries')
        .select('amount, category:cost_categories(name_ar)')
        .eq('period_year', year).eq('period_month', month)
      if (ohErr) throw ohErr

      const totalOverhead = (ohData ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const overheadByCategory: Record<string, number> = {}
      for (const e of ohData ?? []) {
        const name = (e.category as unknown as { name_ar: string }).name_ar
        overheadByCategory[name] = (overheadByCategory[name] ?? 0) + Number(e.amount)
      }

      // 3. COGS + waste — try inventory_daily first, fallback to direct
      const { data: invData } = await supabase
        .from('inventory_daily')
        .select('product_id, sales_kg, waste_kg, weighted_avg_cost')
        .gte('date', from).lte('date', to)

      const costByProduct = new Map<string, { direct: number; waste: number }>()

      if ((invData?.length ?? 0) > 0) {
        for (const i of invData!) {
          const existing = costByProduct.get(i.product_id) ?? { direct: 0, waste: 0 }
          costByProduct.set(i.product_id, {
            direct: existing.direct + Number(i.sales_kg) * Number(i.weighted_avg_cost),
            // الهدر مُحمَّل على WAC — لا يُحسب مرة أخرى كمصروف منفصل
            waste: 0,
          })
        }
      } else {
        // Fallback: COGS from sales.purchase_price_per_kg
        for (const [pid, s] of salesByProduct.entries()) {
          costByProduct.set(pid, { direct: s.purchaseCost, waste: 0 })
        }
        // الهدر مُحمَّل على WAC — لا تكلفة هدر منفصلة في هذا المسار أيضاً
      }

      // 4. Compute allocations with selected distribution method
      const allocations = []
      for (const [productId, { qty, revenue }] of salesByProduct.entries()) {
        const costs = costByProduct.get(productId) ?? { direct: 0, waste: 0 }

        const allocatedOverhead = computeOverheadShare(
          distMethod,
          distMethod === 'qty' ? qty : revenue,
          distMethod === 'qty' ? totalQty : totalRevenue,
          productCount,
          totalOverhead,
        )

        const result = computeProductAllocation(
          productId, revenue, totalRevenue, allocatedOverhead,
          costs.direct, costs.waste, qty
        )
        allocations.push({ ...result, period_year: year, period_month: month })
      }

      // 5. Upsert cost_allocation
      if (allocations.length > 0) {
        const { error: upsertErr } = await supabase
          .from('cost_allocation')
          .upsert(allocations, { onConflict: 'product_id,period_year,period_month' })
        if (upsertErr) throw upsertErr
      }

      // 6. Compute + upsert monthly_pl
      const plResult = computeMonthlyPL(
        allocations.map(a => ({ ...a, product_id: a.product_id })),
        overheadByCategory,
        totalRevenue
      )
      const { error: plErr } = await supabase
        .from('monthly_pl')
        .upsert({ ...plResult, period_year: year, period_month: month },
          { onConflict: 'period_year,period_month' })
      if (plErr) throw plErr

      return allocations
    },
    onSuccess: (_d, { year, month }) => {
      qc.invalidateQueries({ queryKey: ['cost_allocation', year, month] })
      qc.invalidateQueries({ queryKey: ['monthly_pl', year, month] })
    },
  })
}

export function useCloseMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { error } = await supabase
        .from('monthly_pl')
        .update({ is_closed: true, closed_at: new Date().toISOString() })
        .eq('period_year', year)
        .eq('period_month', month)
      if (error) throw error
    },
    onSuccess: (_d, { year, month }) => {
      qc.invalidateQueries({ queryKey: ['monthly_pl', year, month] })
    },
  })
}
