import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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

export function useApproveStocktake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ session, items }: { session: StocktakeSession; items: StocktakeItem[] }) => {
      // Update inventory_daily for each item that has actual_qty
      const validItems = items.filter(i => i.actual_qty !== null && i.actual_qty !== undefined)
      for (const item of validItems) {
        const qty = item.actual_qty!
        await supabase.from('inventory_daily').upsert({
          product_id: item.product_id,
          date: session.date,
          opening_stock_kg: qty,
          opening_cost_per_kg: 0,
          purchased_weight: 0,
          purchase_cost: 0,
          waste_kg: 0,
          sales_kg: 0,
          closing_stock_kg: qty,
          weighted_avg_cost: 0,
        }, { onConflict: 'product_id,date' })
      }
      // Mark session as approved
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
