import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockCostCategories, mockOverheadEntries } from '@/lib/mockData'
import type { CostCategory, OverheadEntry } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useCostCategories() {
  return useQuery<CostCategory[]>({
    queryKey: ['cost_categories'],
    queryFn: async () => {
      if (USE_MOCK) return mockCostCategories
      const { data, error } = await supabase
        .from('cost_categories')
        .select('*')
        .eq('is_active', true)
        .order('name_ar')
      if (error) throw error
      return data as CostCategory[]
    },
  })
}

export function useOverheadEntries(year: number, month: number) {
  return useQuery<OverheadEntry[]>({
    queryKey: ['overhead_entries', year, month],
    queryFn: async () => {
      if (USE_MOCK) return mockOverheadEntries.filter(e => e.period_year === year && e.period_month === month)
      const { data, error } = await supabase
        .from('overhead_entries')
        .select('*, category:cost_categories(*)')
        .eq('period_year', year)
        .eq('period_month', month)
      if (error) throw error
      return data as OverheadEntry[]
    },
  })
}

export function useUpsertOverheadEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (entry: Omit<OverheadEntry, 'id' | 'created_at' | 'category'> & { id?: string }) => {
      if (USE_MOCK) return entry
      const { data, error } = await supabase
        .from('overhead_entries')
        .upsert(entry, { onConflict: 'category_id,period_year,period_month' })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['overhead_entries', v.period_year, v.period_month] })
    },
  })
}

export function useUpsertCostCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cat: Partial<CostCategory> & { id?: string }) => {
      if (USE_MOCK) return cat
      const { data, error } = await supabase
        .from('cost_categories')
        .upsert(cat)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost_categories'] })
    },
  })
}
