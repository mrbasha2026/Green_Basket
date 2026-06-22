import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockPurchases } from '@/lib/mockData'
import type { Purchase } from '@/types'
import { calcCostPerKg } from '@/lib/calculations'

function invalidatePurchases(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['purchases'] })
  qc.invalidateQueries({ queryKey: ['inventory'] })
}

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

async function fetchAllPurchases(filters?: { date?: string; from?: string; to?: string }): Promise<Purchase[]> {
  const PAGE = 1000
  let all: Purchase[] = []
  let start = 0
  while (true) {
    let q = supabase
      .from('purchases')
      .select('*, product:products(*), supplier:suppliers(*)')
      .eq('is_deleted', false)
      .order('date', { ascending: false })
      .range(start, start + PAGE - 1)
    if (filters?.date) q = q.eq('date', filters.date)
    if (filters?.from) q = q.gte('date', filters.from)
    if (filters?.to)   q = q.lte('date', filters.to)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    all = [...all, ...(data as Purchase[])]
    if (data.length < PAGE) break
    start += PAGE
  }
  return all
}

export function usePurchases(date?: string) {
  return useQuery<Purchase[]>({
    queryKey: ['purchases', date],
    queryFn: async () => {
      if (USE_MOCK) return date ? mockPurchases.filter(p => p.date === date) : mockPurchases
      return fetchAllPurchases(date ? { date } : undefined)
    },
  })
}

export function usePurchasesByRange(from: string, to: string) {
  return useQuery<Purchase[]>({
    queryKey: ['purchases', 'range', from, to],
    queryFn: async () => {
      if (USE_MOCK) return mockPurchases
      return fetchAllPurchases({ from, to })
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
      const { data, error } = await supabase.rpc('get_latest_purchase_costs',
        upToDate ? { up_to_date: upToDate } : {}
      )
      if (error) throw error
      const costs: Record<string, number> = {}
      data?.forEach((row: { product_id: string; cost_per_kg: number }) => {
        costs[row.product_id] = row.cost_per_kg
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
      const { error } = await supabase.from('purchases').update({ is_deleted: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => invalidatePurchases(qc),
  })
}

export function useDeletePurchasesByInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceNumber: string) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('purchases').update({ is_deleted: true }).eq('invoice_number', invoiceNumber)
      if (error) throw error
    },
    onSuccess: () => invalidatePurchases(qc),
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
    onSuccess: () => invalidatePurchases(qc),
  })
}

// ── Invoice number helpers ─────────────────────────────────────────────────────

export async function nextPurchaseInvoiceNumber(prefix: string = 'PIM'): Promise<string> {
  const { data, error } = await supabase.rpc('get_next_invoice_number', { p_prefix: prefix })
  if (error) throw error
  return data as string
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
