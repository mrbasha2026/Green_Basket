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
    mutationFn: async ({
      review,
      existingCustomerId,
      existingProductId,
    }: {
      review: SyncPendingReview
      existingCustomerId?: string
      existingProductId?: string
    }) => {
      if (review.type === 'customer') {
        let customerId: string
        if (existingCustomerId) {
          customerId = existingCustomerId
        } else {
          const name = review.suggested_match || review.raw_name
          let customerType: Customer['type'] = 'مطعم'
          if (name.includes('مستشفى'))     customerType = 'مستشفى'
          else if (name.includes('فندق'))  customerType = 'فندق'
          else if (name.includes('تجزئة')) customerType = 'تجزئة'
          const { data: existing } = await supabase.from('customers').select('id').eq('name_ar', name).maybeSingle()
          if (existing) {
            customerId = existing.id
          } else {
            const { data: created, error: cErr } = await supabase
              .from('customers').insert({ name_ar: name, type: customerType, is_active: true }).select('id').single()
            if (cErr) throw cErr
            customerId = created.id
          }
        }
        await supabase.from('customer_sheet_mapping')
          .upsert({ sheet_name: review.raw_name, customer_id: customerId }, { onConflict: 'sheet_name' })

      } else if (review.type === 'product') {
        if (!existingProductId) throw new Error('يجب اختيار صنف من القائمة')
        // إنشاء alias يربط اسم الـ Sheet بالصنف في النظام
        const { error: aErr } = await supabase.from('product_aliases')
          .upsert({ alias: review.raw_name, product_id: existingProductId }, { onConflict: 'alias' })
        if (aErr) throw aErr
        // أيضاً أضف النسخة بالحروف الكبيرة كـ alias مرجعي
        const upper = review.raw_name.toUpperCase().trim()
        if (upper !== review.raw_name) {
          await supabase.from('product_aliases')
            .upsert({ alias: upper, product_id: existingProductId }, { onConflict: 'alias' })
        }
      }

      const { error } = await supabase.from('sync_pending_review').update({ status: 'approved' }).eq('id', review.id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sync_pending_review'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['products'] })
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

export function useDeleteSheetDataByMonth() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (monthKey: string) => {
      // monthKey format: "YYYY-MM"
      const [yearStr, monthStr] = monthKey.split('-')
      const year = Number(yearStr)
      const month = Number(monthStr)

      // منع الحذف إذا كانت الفترة مغلقة
      const { data: period } = await supabase
        .from('accounting_periods')
        .select('status')
        .eq('period_year', year)
        .eq('period_month', month)
        .maybeSingle()
      if (period?.status === 'closed') {
        throw new Error('لا يمكن تعديل بيانات فترة مغلقة — يجب فتح الفترة أولاً')
      }

      const from = `${monthKey}-01`
      const d = new Date(monthKey + '-01T12:00:00')
      d.setMonth(d.getMonth() + 1)
      d.setDate(0)
      const to = d.toISOString().split('T')[0]

      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from('sales').delete().eq('source', 'google_sheet').gte('date', from).lte('date', to),
        supabase.from('purchases').delete().eq('source', 'google_sheet').gte('date', from).lte('date', to),
      ])
      if (e1) throw e1
      if (e2) throw e2
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['purchases'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
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
      if (!res.ok) {
        let msg = res.statusText
        try { const body = await res.json(); if (body?.message) msg = body.message } catch {}
        throw new Error(msg)
      }
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
