import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export interface SiteSettingsData {
  name?: string
  tagline?: string
  phone?: string
  address?: string
  logo?: string
  tax_number?: string
  vat_rate?: number
  currency?: string
  invoice_prefix_sales?: string
  invoice_prefix_purchases?: string
  fiscal_year_start?: string
  date_format?: string
  payment_terms?: string
}

const FALLBACK_KEY = 'gb_site_settings'

function loadLocalSettings(): SiteSettingsData {
  try { return JSON.parse(localStorage.getItem(FALLBACK_KEY) ?? '{}') } catch { return {} }
}

export function useSiteSettings() {
  return useQuery<SiteSettingsData>({
    queryKey: ['site_settings'],
    queryFn: async () => {
      if (USE_MOCK) return loadLocalSettings()
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('data')
          .eq('id', 'default')
          .maybeSingle()
        if (error) throw error
        return (data?.data ?? loadLocalSettings()) as SiteSettingsData
      } catch {
        return loadLocalSettings()
      }
    },
    staleTime: 60_000,
  })
}

export function useUpsertSiteSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (settings: SiteSettingsData) => {
      // Always save to localStorage as fallback (for sidebar logo/name)
      const merged = { ...loadLocalSettings(), ...settings }
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(merged))
      window.dispatchEvent(new Event('storage'))

      if (USE_MOCK) return merged

      const { error } = await supabase
        .from('site_settings')
        .upsert({ id: 'default', data: merged, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      if (error) throw error
      return merged
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site_settings'] }),
  })
}
