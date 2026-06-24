import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SiteSettingsData } from '@/hooks/useSiteSettings'

export interface StocktakeSession {
  id: string
  session_number: string
  date: string
  responsible: string | null
  status: 'draft' | 'completed' | 'approved'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface StocktakeItem {
  id: string
  session_id: string
  product_id: string
  system_qty: number
  actual_qty: number | null
  notes: string | null
  created_at: string
  product?: { name_ar: string; category: string }
}

// ── Sessions ───────────────────────────────────────────────────────────────────
export function useStocktakeSessions() {
  return useQuery<StocktakeSession[]>({
    queryKey: ['stocktake_sessions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stocktake_sessions')
        .select('*')
        .order('date', { ascending: false })
      if (error) throw error
      return data as StocktakeSession[]
    },
  })
}

export function useStocktakeItems(sessionId: string | null) {
  return useQuery<StocktakeItem[]>({
    queryKey: ['stocktake_items', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stocktake_items')
        .select('*, product:products(name_ar, category)')
        .eq('session_id', sessionId!)
        .order('created_at')
      if (error) throw error
      return data as StocktakeItem[]
    },
  })
}

export async function nextStocktakeNumber(): Promise<string> {
  const { data } = await supabase
    .from('stocktake_sessions')
    .select('session_number')
    .order('created_at', { ascending: false })
    .limit(1)
  const last = data?.[0]?.session_number
  if (last?.startsWith('STK-')) {
    const n = parseInt(last.split('-')[1] ?? '0') + 1
    return `STK-${String(n).padStart(4, '0')}`
  }
  return 'STK-0001'
}

export function useCreateStocktakeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { date: string; responsible?: string; notes?: string }) => {
      const session_number = await nextStocktakeNumber()
      const { data, error } = await supabase
        .from('stocktake_sessions')
        .insert({ ...payload, session_number, status: 'draft' })
        .select()
        .single()
      if (error) throw error
      return data as StocktakeSession
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocktake_sessions'] }),
  })
}

export function useUpdateStocktakeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<StocktakeSession> & { id: string }) => {
      const { error } = await supabase
        .from('stocktake_sessions')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocktake_sessions'] }),
  })
}

export function useDeleteStocktakeSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stocktake_sessions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stocktake_sessions'] }),
  })
}

// ── Items ──────────────────────────────────────────────────────────────────────
export function useUpsertStocktakeItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: Omit<StocktakeItem, 'id' | 'created_at' | 'product'>[]) => {
      const { error } = await supabase
        .from('stocktake_items')
        .upsert(items, { onConflict: 'session_id,product_id' })
      if (error) throw error
    },
    onSuccess: (_d, items) => {
      if (items[0]?.session_id) qc.invalidateQueries({ queryKey: ['stocktake_items', items[0].session_id] })
    },
  })
}

export function useDeleteStocktakeItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, session_id }: { id: string; session_id: string }) => {
      const { error } = await supabase.from('stocktake_items').delete().eq('id', id)
      if (error) throw error
      return session_id
    },
    onSuccess: (session_id) => qc.invalidateQueries({ queryKey: ['stocktake_items', session_id] }),
  })
}

export function useApprovedStocktakeItems(from: string, to: string) {
  const DISABLED = '9999-01-01'
  return useQuery<(StocktakeItem & { session_date: string; session_number: string })[]>({
    queryKey: ['stocktake_items', 'approved_range', from, to],
    enabled: from !== DISABLED && to !== DISABLED,
    queryFn: async () => {
      const { data: sessions } = await supabase
        .from('stocktake_sessions')
        .select('id, date, session_number')
        .eq('status', 'approved')
        .gte('date', from)
        .lte('date', to)
      if (!sessions || sessions.length === 0) return []
      const sessionIds = sessions.map(s => s.id)
      const { data: items, error } = await supabase
        .from('stocktake_items')
        .select('*, product:products(name_ar, category)')
        .in('session_id', sessionIds)
      if (error) throw error
      const sessionMap = new Map(sessions.map(s => [s.id, s]))
      return (items ?? []).map(item => ({
        ...item,
        session_date: sessionMap.get(item.session_id)?.date ?? '',
        session_number: sessionMap.get(item.session_id)?.session_number ?? '',
      }))
    },
  })
}

export function useApproveStocktake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ session, items }: { session: StocktakeSession; items: StocktakeItem[] }) => {
      const validItems = items.filter(i => i.actual_qty !== null && i.actual_qty !== undefined)

      // جلب إعدادات الجرد
      const { data: settingsRow } = await supabase
        .from('site_settings').select('data').eq('id', 'default').maybeSingle()
      const settings = (settingsRow?.data ?? {}) as SiteSettingsData
      const method    = settings.stocktake_charge_method ?? 'pct_of_diff'
      const chargePct = (settings.stocktake_charge_pct ?? 0) / 100

      // جلب آخر WAC لكل صنف قبل تاريخ الجلسة
      const wacMap = new Map<string, number>()
      await Promise.all(validItems.map(async item => {
        const { data } = await supabase
          .from('inventory_daily')
          .select('weighted_avg_cost')
          .eq('product_id', item.product_id)
          .lt('date', session.date)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()
        wacMap.set(item.product_id, data?.weighted_avg_cost ?? 0)
      }))

      // حساب إجمالي قيمة المخزون وإجمالي الفوارق (لطريقة pct_of_inventory)
      let totalInvValue   = 0
      let totalDeficit    = 0
      const itemDeficits: { item: StocktakeItem; deficitValue: number; wac: number }[] = []

      for (const item of validItems) {
        const wac        = wacMap.get(item.product_id) ?? 0
        const deficitQty = (item.system_qty ?? 0) - item.actual_qty!
        const deficitVal = Math.max(0, deficitQty) * wac
        totalInvValue   += (item.system_qty ?? 0) * wac
        totalDeficit    += deficitVal
        itemDeficits.push({ item, deficitValue: deficitVal, wac })
      }

      // جلب أو إنشاء فئة "فوارق جرد" في cost_categories
      let stocktakeCategoryId: string | null = null
      const { data: existingCat } = await supabase
        .from('cost_categories').select('id').eq('name_ar', 'فوارق جرد').maybeSingle()
      if (existingCat) {
        stocktakeCategoryId = existingCat.id
      } else {
        const { data: newCat } = await supabase
          .from('cost_categories')
          .insert({ name_ar: 'فوارق جرد', name_en: 'Stocktake Discrepancy', is_active: true })
          .select('id').single()
        stocktakeCategoryId = newCat?.id ?? null
      }

      const sessionYear  = new Date(session.date).getFullYear()
      const sessionMonth = new Date(session.date).getMonth() + 1

      for (const { item, deficitValue, wac } of itemDeficits) {
        const actualQty  = item.actual_qty!
        const systemQty  = item.system_qty ?? actualQty
        const deficitQty = Math.max(0, systemQty - actualQty)

        // حساب المبلغ المُحمَّل على الصنف vs المصروف
        let absorbedValue = 0
        if (deficitValue > 0) {
          if (method === 'pct_of_diff') {
            absorbedValue = deficitValue * chargePct
          } else {
            // pct_of_inventory: الحد الأقصى الكلي = نسبة من إجمالي المخزون
            const maxAbsorb = totalInvValue * chargePct
            absorbedValue = totalDeficit > 0
              ? Math.min(deficitValue, (deficitValue / totalDeficit) * maxAbsorb)
              : 0
          }
        }

        const expensedValue  = deficitValue - absorbedValue
        // القيمة الإجمالية المتبقية بعد خصم ما سيُصرَّف
        const remainingValue = systemQty * wac - expensedValue
        const newWac         = actualQty > 0 ? remainingValue / actualQty : wac

        await supabase.from('inventory_daily').upsert({
          product_id:          item.product_id,
          date:                session.date,
          opening_stock_kg:    systemQty,
          opening_cost_per_kg: wac,
          purchased_weight:    0,
          purchase_cost:       0,
          waste_kg:            deficitQty,
          sales_kg:            0,
          closing_stock_kg:    actualQty,
          weighted_avg_cost:   newWac,
        }, { onConflict: 'product_id,date' })

        // تسجيل الجزء المُصرَّف كمصروف (overhead)
        if (expensedValue > 0 && stocktakeCategoryId) {
          await supabase.from('overhead_entries').insert({
            period_year:  sessionYear,
            period_month: sessionMonth,
            amount:       Math.round(expensedValue * 1000) / 1000,
            category_id:  stocktakeCategoryId,
            notes:        `فوارق جلسة جرد ${session.session_number} — ${item.product_id}`,
          })
        }
      }

      // اعتماد الجلسة
      const { error } = await supabase
        .from('stocktake_sessions')
        .update({ status: 'approved', updated_at: new Date().toISOString() })
        .eq('id', session.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stocktake_sessions'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}
