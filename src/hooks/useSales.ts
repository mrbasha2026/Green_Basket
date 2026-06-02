import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockSales } from '@/lib/mockData'
import type { Sale } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useSales(filters?: { customerId?: string; date?: string; productId?: string }) {
  return useQuery<Sale[]>({
    queryKey: ['sales', filters],
    queryFn: async () => {
      if (USE_MOCK) {
        let data = mockSales
        if (filters?.customerId) data = data.filter(s => s.customer_id === filters.customerId)
        if (filters?.date) data = data.filter(s => s.date === filters.date)
        if (filters?.productId) data = data.filter(s => s.product_id === filters.productId)
        return data
      }
      const q = supabase.from('sales').select('*, product:products(*), customer:customers(*)').order('date', { ascending: false })
      if (filters?.customerId) q.eq('customer_id', filters.customerId)
      if (filters?.date) q.eq('date', filters.date)
      if (filters?.productId) q.eq('product_id', filters.productId)
      const { data, error } = await q
      if (error) throw error
      return data as Sale[]
    },
  })
}

export function useSalesByRange(from: string, to: string) {
  return useQuery<Sale[]>({
    queryKey: ['sales', 'range', from, to],
    queryFn: async () => {
      if (USE_MOCK) return mockSales
      const { data, error } = await supabase
        .from('sales').select('*, product:products(*), customer:customers(*)')
        .gte('date', from).lte('date', to).order('date', { ascending: false })
      if (error) throw error
      return data as Sale[]
    },
  })
}

export function useDeleteSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('sales').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['inventory'] }) },
  })
}

export function useDeleteSalesByInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (invoiceNumber: string) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('sales').delete().eq('invoice_number', invoiceNumber)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['inventory'] }) },
  })
}

export function useUpsertSales() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: Omit<Sale, 'id' | 'total_purchase' | 'total_amount' | 'created_at' | 'product' | 'customer'>[]) => {
      if (USE_MOCK) return rows
      const { data, error } = await supabase.from('sales').insert(rows).select()
      if (error) throw error
      return data
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sales'] }); qc.invalidateQueries({ queryKey: ['inventory'] }) },
  })
}

// ── Invoice number helpers ─────────────────────────────────────────────────────

export async function nextSaleInvoiceNumber(prefix: string = 'SIM'): Promise<string> {
  const { data } = await supabase
    .from('sales').select('invoice_number')
    .not('invoice_number', 'is', null)
    .like('invoice_number', `${prefix}-%`)
    .order('created_at', { ascending: false }).limit(1)
  const last = data?.[0]?.invoice_number ?? `${prefix}-00000`
  const num = parseInt(last.replace(`${prefix}-`, '')) + 1
  return `${prefix}-${String(num).padStart(5, '0')}`
}

// Returns existing invoice for (date + customer) OR generates a new one
export async function getOrCreateDailySaleInvoice(date: string, customerId: string, prefix: string): Promise<string> {
  const { data } = await supabase
    .from('sales').select('invoice_number')
    .like('invoice_number', `${prefix}-%`)
    .eq('date', date).eq('customer_id', customerId).limit(1)
  if (data?.[0]?.invoice_number) return data[0].invoice_number
  return nextSaleInvoiceNumber(prefix)
}
