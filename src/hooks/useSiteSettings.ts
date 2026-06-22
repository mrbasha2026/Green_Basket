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
  vat_required?: boolean
  currency?: string
  invoice_prefix_sales?: string
  invoice_prefix_purchases?: string
  invoice_prefix_sales_sheet?: string
  invoice_prefix_purchases_sheet?: string
  invoice_prefix_stocktake?: string
  invoice_prefix_returns_sales?: string
  invoice_prefix_returns_purchases?: string
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
      const local = loadLocalSettings()
      if (USE_MOCK) return local
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('data')
          .eq('id', 'default')
          .maybeSingle()
        if (error) throw error
        // localStorage always wins — it reflects the latest save from this client
        const merged = { ...(data?.data ?? {}), ...local } as SiteSettingsData
        // Sync back to localStorage so Sidebar, Login, and SiteMetaSync stay in sync
        if (data?.data) {
          const stored = JSON.stringify(merged)
          if (stored !== localStorage.getItem(FALLBACK_KEY)) {
            localStorage.setItem(FALLBACK_KEY, stored)
            window.dispatchEvent(new Event('storage'))
          }
        }
        return merged
      } catch {
        return local
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

      await supabase
        .from('site_settings')
        .upsert({ id: 'default', data: merged, updated_at: new Date().toISOString() }, { onConflict: 'id' })
        .then()
        .catch(() => {/* localStorage already saved above */})
      return merged
    },
    onSuccess: (merged) => {
      qc.setQueryData(['site_settings'], merged)
      qc.invalidateQueries({ queryKey: ['site_settings'] })
    },
  })
}
