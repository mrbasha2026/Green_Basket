import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, fetchAllPages } from '@/lib/supabase'
import { mockWaste } from '@/lib/mockData'
import type { WasteLog } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useWaste(filters?: { date?: string; month?: number; year?: number }) {
  return useQuery<WasteLog[]>({
    queryKey: ['waste', filters],
    queryFn: async () => {
      if (USE_MOCK) return mockWaste

      const from = filters?.month && filters?.year
        ? `${filters.year}-${String(filters.month).padStart(2, '0')}-01`
        : undefined
      const to = filters?.month && filters?.year
        ? new Date(filters.year, filters.month, 0).toISOString().split('T')[0]
        : undefined

      return fetchAllPages<WasteLog>((start, end) => {
        let q = supabase
          .from('waste_log')
          .select('*, product:products(*)')
          .order('date', { ascending: false })
          .range(start, end)
        if (filters?.date) q = q.eq('date', filters.date)
        if (from && to) q = q.gte('date', from).lte('date', to)
        return q
      })
    },
  })
}

export function useWasteByRange(from: string, to: string) {
  return useQuery<WasteLog[]>({
    queryKey: ['waste', 'range', from, to],
    queryFn: async () => {
      if (USE_MOCK) return mockWaste.filter(w => w.date >= from && w.date <= to)
      return fetchAllPages<WasteLog>((start, end) =>
        supabase
          .from('waste_log')
          .select('*, product:products(*)')
          .gte('date', from)
          .lte('date', to)
          .order('date', { ascending: false })
          .range(start, end)
      )
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
