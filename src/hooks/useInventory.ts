import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
      const { data, error } = await supabase
        .from('inventory_daily')
        .select('*, product:products(*)')
        .order('date', { ascending: true })
      if (error) throw error
      const seen = new Set<string>()
      return (data as InventoryDaily[]).filter(i => {
        if (seen.has(i.product_id)) return false
        seen.add(i.product_id)
        return true
      })
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
      const { data, error } = await supabase
        .from('inventory_daily')
        .select('*, product:products(*)')
        .lte('date', date)
        .order('date', { ascending: false })
      if (error) throw error
      const seen = new Set<string>()
      return (data as InventoryDaily[]).filter(i => {
        if (seen.has(i.product_id)) return false
        seen.add(i.product_id)
        return true
      })
    },
  })
}

// All records in a date range (for movement report)
export function useInventoryRange(from: string, to: string) {
  return useQuery<InventoryDaily[]>({
    queryKey: ['inventory', 'range', from, to],
    queryFn: async () => {
      if (USE_MOCK) return mockInventory.filter(i => i.date >= from && i.date <= to)
      const { data, error } = await supabase
        .from('inventory_daily')
        .select('*, product:products(*)')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
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
