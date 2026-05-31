import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockWaste } from '@/lib/mockData'
import type { WasteLog } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useWaste(filters?: { date?: string; month?: number; year?: number }) {
  return useQuery<WasteLog[]>({
    queryKey: ['waste', filters],
    queryFn: async () => {
      if (USE_MOCK) return mockWaste
      const q = supabase
        .from('waste_log')
        .select('*, product:products(*)')
        .order('date', { ascending: false })
      if (filters?.date) q.eq('date', filters.date)
      if (filters?.month && filters?.year) {
        const from = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`
        const to = new Date(filters.year, filters.month, 0).toISOString().split('T')[0]
        q.gte('date', from).lte('date', to)
      }
      const { data, error } = await q
      if (error) throw error
      return data as WasteLog[]
    },
  })
}

export function useInsertWaste() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entry: Omit<WasteLog, 'id' | 'created_at' | 'product'>) => {
      if (USE_MOCK) return entry
      const { data, error } = await supabase
        .from('waste_log')
        .insert(entry)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['waste'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
    },
  })
}
