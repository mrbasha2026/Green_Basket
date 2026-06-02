import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockPurchases } from '@/lib/mockData'
import type { Purchase } from '@/types'
import { calcCostPerKg } from '@/lib/calculations'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function usePurchases(date?: string) {
  return useQuery<Purchase[]>({
    queryKey: ['purchases', date],
    queryFn: async () => {
      if (USE_MOCK) return date ? mockPurchases.filter(p => p.date === date) : mockPurchases
      const q = supabase
        .from('purchases')
        .select('*, product:products(*), supplier:suppliers(*)')
        .order('date', { ascending: false }).limit(50000)
      if (date) q.eq('date', date)
      const { data, error } = await q
      if (error) throw error
      return data as Purchase[]
    },
  })
}

export function usePurchasesByRange(from: string, to: string) {
  return useQuery<Purchase[]>({
    queryKey: ['purchases', 'range', from, to],
    queryFn: async () => {
      if (USE_MOCK) return mockPurchases
      const { data, error } = await supabase
        .from('purchases')
        .select('*, product:products(*), supplier:suppliers(*)')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false }).limit(50000)
      if (error) throw error
      return data as Purchase[]
    },
  })
}

export function useLatestPurchaseCosts(upToDate?: string) {
  return useQuery<Record<string, number>>({
    queryKey: ['purchases', 'latest_costs', upToDate],
    queryFn: async () => {
      if (USE_MOCK) {
        const costs: Record<string, number> = {}
        mockPurchases.forEach(p => { if (!costs[p.product_id]) costs[p.product_id] = p.cost_per_kg })
        return costs
      }
      const q = supabase.from('purchases').select('product_id, cost_per_kg, date').order('date', { ascending: false })
      if (upToDate) q.lte('date', upToDate)
      const { data, error } = await q
      if (error) throw error
      const costs: Record<string, number> = {}
      data?.forEach((p: { product_id: string; cost_per_kg: number }) => {
        if (!costs[p.product_id]) costs[p.product_id] = p.cost_per_kg
      })
      return costs
    },
  })
}

export function useDeletePurchase() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('purchases').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useDeletePurchasesByInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceNumber: string) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('purchases').delete().eq('invoice_number', invoiceNumber)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

export function useUpsertPurchases() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: Omit<Purchase, 'id' | 'total_cost' | 'total_weight' | 'created_at' | 'product' | 'supplier'>[]) => {
      if (USE_MOCK) return rows
      const enriched = rows.map(r => ({
        ...r,
        cost_per_kg: calcCostPerKg(r.cartons_qty * r.price_per_carton, r.cartons_qty * r.weight_per_carton, r.waste_kg),
      }))
      const { data, error } = await supabase.from('purchases').insert(enriched).select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}

// ── Invoice number helpers ─────────────────────────────────────────────────────

export async function nextPurchaseInvoiceNumber(prefix: string = 'PIM'): Promise<string> {
  const { data } = await supabase
    .from('purchases')
    .select('invoice_number')
    .not('invoice_number', 'is', null)
    .like('invoice_number', `${prefix}-%`)
    .order('created_at', { ascending: false })
    .limit(1)
  const last = data?.[0]?.invoice_number ?? `${prefix}-00000`
  const num = parseInt(last.replace(`${prefix}-`, '')) + 1
  return `${prefix}-${String(num).padStart(5, '0')}`
}

// Returns existing invoice number for the date OR generates a new one
export async function getOrCreateDailyPurchaseInvoice(date: string, prefix: string): Promise<string> {
  const { data } = await supabase
    .from('purchases')
    .select('invoice_number')
    .like('invoice_number', `${prefix}-%`)
    .eq('date', date)
    .limit(1)
  if (data?.[0]?.invoice_number) return data[0].invoice_number
  return nextPurchaseInvoiceNumber(prefix)
}
