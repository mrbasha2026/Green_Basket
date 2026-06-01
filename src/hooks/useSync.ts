import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { mockSyncLogs } from '@/lib/mockData'
import type { Customer, SyncLog, SyncPendingReview } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useSyncLogs() {
  return useQuery<SyncLog[]>({
    queryKey: ['sync_logs'],
    queryFn: async () => {
      if (USE_MOCK) return mockSyncLogs
      const { data, error } = await supabase
        .from('sync_log')
        .select('*')
        .order('synced_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as SyncLog[]
    },
  })
}

export function useSyncPendingReview() {
  return useQuery<SyncPendingReview[]>({
    queryKey: ['sync_pending_review'],
    queryFn: async () => {
      if (USE_MOCK) return []
      const { data, error } = await supabase
        .from('sync_pending_review')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as SyncPendingReview[]
    },
  })
}

export function useApprovePendingReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (review: SyncPendingReview) => {
      if (review.type === 'customer') {
        const name = review.suggested_match || review.raw_name

        // اكتشاف نوع العميل من الاسم
        let customerType: Customer['type'] = 'مطعم'
        if (name.includes('مستشفى'))     customerType = 'مستشفى'
        else if (name.includes('فندق'))  customerType = 'فندق'
        else if (name.includes('تجزئة')) customerType = 'تجزئة'

        // إنشاء العميل إذا لم يكن موجوداً
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('name_ar', name)
          .maybeSingle()

        let customerId: string
        if (existing) {
          customerId = existing.id
        } else {
          const { data: created, error: cErr } = await supabase
            .from('customers')
            .insert({ name_ar: name, type: customerType, is_active: true })
            .select('id')
            .single()
          if (cErr) throw cErr
          customerId = created.id
        }

        // ربط اسم الـ Sheet بالعميل
        await supabase
          .from('customer_sheet_mapping')
          .upsert({ sheet_name: review.raw_name, customer_id: customerId }, { onConflict: 'sheet_name' })
      }

      const { error } = await supabase
        .from('sync_pending_review')
        .update({ status: 'approved' })
        .eq('id', review.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync_pending_review'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
    },
  })
}

export function useRejectPendingReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sync_pending_review')
        .update({ status: 'rejected' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync_pending_review'] })
    },
  })
}

export function useTriggerSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ spreadsheetId }: { spreadsheetId?: string } = {}) => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ spreadsheetId: spreadsheetId || undefined }),
      })
      if (!res.ok) throw new Error(`Sync failed: ${res.statusText}`)
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync_logs'] })
      qc.invalidateQueries({ queryKey: ['sync_pending_review'] })
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}
