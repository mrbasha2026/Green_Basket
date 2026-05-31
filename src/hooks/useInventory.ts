import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockInventory } from '@/lib/mockData'
import type { InventoryDaily } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useInventoryDaily(date?: string) {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', date],
    queryFn: async () => {
      if (USE_MOCK) return date ? mockInventory.filter(i => i.date === date) : mockInventory
      const q = supabase
        .from('inventory_daily')
        .select('*, product:products(*)')
        .order('date', { ascending: false })
      if (date) q.eq('date', date)
      const { data, error } = await q
      if (error) throw error
      return data as InventoryDaily[]
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
