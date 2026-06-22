import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockCustomers } from '@/lib/mockData'
import type { Customer, CustomerSheetMapping } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

const TEN_MINUTES = 10 * 60 * 1000

export function useCustomers() {
  return useQuery<Customer[]>({
    queryKey: ['customers'],
    staleTime: TEN_MINUTES,
    queryFn: async () => {
      if (USE_MOCK) return mockCustomers
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name_ar')
      if (error) throw error
      return data as Customer[]
    },
  })
}

export function useAllCustomers() {
  return useQuery<Customer[]>({
    queryKey: ['customers', 'all'],
    staleTime: TEN_MINUTES,
    queryFn: async () => {
      if (USE_MOCK) return mockCustomers
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name_ar')
      if (error) throw error
      return data as Customer[]
    },
  })
}

export function useCustomerSheetMappings() {
  return useQuery<CustomerSheetMapping[]>({
    queryKey: ['customer_sheet_mappings'],
    queryFn: async () => {
      if (USE_MOCK) return []
      const { data, error } = await supabase
        .from('customer_sheet_mapping')
        .select('*')
      if (error) throw error
      return data as CustomerSheetMapping[]
    },
  })
}

export function useUpsertCustomer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (customer: Partial<Customer> & { id?: string }) => {
      if (USE_MOCK) return customer
      const { data, error } = await supabase
        .from('customers')
        .upsert(customer)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}
