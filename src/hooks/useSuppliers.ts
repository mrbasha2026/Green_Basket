import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/types'

const TEN_MINUTES = 10 * 60 * 1000

export function useSuppliers() {
  return useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    staleTime: TEN_MINUTES,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name_ar')
      if (error) {
        console.error('[useSuppliers] error:', error.code, error.message)
        throw error
      }
      return (data ?? []) as Supplier[]
    },
  })
}

export function useUpsertSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (supplier: Partial<Supplier> & { name_ar: string }) => {
      const { id, ...rest } = supplier
      const { data, error } = id
        ? await supabase.from('suppliers').update(rest).eq('id', id).select().single()
        : await supabase.from('suppliers').insert(rest).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('suppliers').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  })
}
