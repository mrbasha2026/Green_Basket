import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { SyncLog, SyncPendingReview } from '@/types'

const USE_MOCK = import.meta.env.VITE_SUPABASE_URL === undefined || import.meta.env.VITE_SUPABASE_URL === ''

export function useSyncLogs() {
  return useQuery<SyncLog[]>({
    queryKey: ['sync_logs'],
    queryFn: async () => {
      if (USE_MOCK) return []
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
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sync_pending_review')
        .update({ status: 'approved' })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync_pending_review'] })
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
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
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
