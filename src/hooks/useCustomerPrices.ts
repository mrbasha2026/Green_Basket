import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CustomerProductPrice } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useCustomerPrices(customerId?: string) {
  return useQuery<CustomerProductPrice[]>({
    queryKey: ['customer_prices', customerId],
    queryFn: async () => {
      if (USE_MOCK) return []
      try {
        const q = supabase
          .from('customer_product_prices')
          .select('*, customer:customers(*), product:products(*)')
          .order('product_id')
        if (customerId) q.eq('customer_id', customerId)
        const { data, error } = await q
        if (error) throw error
        return data as CustomerProductPrice[]
      } catch {
        return []
      }
    },
  })
}

export function useAllCustomerPrices() {
  return useQuery<CustomerProductPrice[]>({
    queryKey: ['customer_prices'],
    queryFn: async () => {
      if (USE_MOCK) return []
      try {
        const { data, error } = await supabase
          .from('customer_product_prices')
          .select('*, customer:customers(*), product:products(*)')
          .order('customer_id, product_id')
        if (error) throw error
        return data as CustomerProductPrice[]
      } catch {
        return []
      }
    },
  })
}

export function useUpsertCustomerPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: { customer_id: string; product_id: string; price_per_kg: number }[]) => {
      if (USE_MOCK) return rows
      const now = new Date().toISOString()
      const { data, error } = await supabase
        .from('customer_product_prices')
        .upsert(
          rows.map(r => ({ ...r, updated_at: now })),
          { onConflict: 'customer_id,product_id' }
        )
        .select()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer_prices'] })
    },
  })
}

export function useDeleteCustomerPrice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('customer_product_prices').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer_prices'] })
    },
  })
}
