import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockProducts } from '@/lib/mockData'
import type { Product, ProductAlias } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useProducts() {
  return useQuery<Product[]>({
    queryKey: ['products'],
    queryFn: async () => {
      if (USE_MOCK) return mockProducts
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      return data as Product[]
    },
  })
}

export function useAllProducts() {
  return useQuery<Product[]>({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      if (USE_MOCK) return mockProducts
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return data as Product[]
    },
  })
}

export function useProductAliases(productId?: string) {
  return useQuery<ProductAlias[]>({
    queryKey: ['product_aliases', productId],
    queryFn: async () => {
      const q = supabase.from('product_aliases').select('*')
      if (productId) q.eq('product_id', productId)
      const { data, error } = await q
      if (error) throw error
      return data as ProductAlias[]
    },
    enabled: !USE_MOCK,
  })
}

export function useToggleProductActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (USE_MOCK) return
      const { error } = await supabase.from('products').update({ is_active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      if (USE_MOCK) return
      // Deactivate instead of hard delete to preserve history
      const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  })
}

export function useUpsertProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (product: Partial<Product> & { id?: string }) => {
      if (USE_MOCK) return product
      const { data, error } = await supabase
        .from('products')
        .upsert(product)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] })
    },
  })
}
