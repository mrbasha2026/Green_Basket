import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { useSyncLogs, useSyncPendingReview, useTriggerSync, useDeleteSheetDataByMonth, useApprovePendingReview, useRejectPendingReview } from '@/hooks/useSync'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import type { SyncLog } from '@/types'
import { RefreshCw, CheckCircle, XCircle, Clock, Settings2, Trash2 } from 'lucide-react'
import { monthName, todayISO } from '@/lib/utils'

// ── Per-month spreadsheet config stored in localStorage ──────────────────────
const CONFIG_KEY = 'gb_monthly_sheets'
type SheetsConfig = Record<string, string> // key: "YYYY-MM", value: spreadsheet ID

function loadConfig(): SheetsConfig {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') } catch { return {} }
}
function saveConfig(cfg: SheetsConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

function currentMonthKey() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Sync() {
  const { data: logs, isLoading: logsLoading } = useSyncLogs()
  const { data: pending } = useSyncPendingReview()
  const { mutateAsync: triggerSync, isPending: syncing } = useTriggerSync()
  const { mutateAsync: deleteSheetData, isPending: isDeleting } = useDeleteSheetDataByMonth()
  const { mutateAsync: approve } = useApprovePendingReview()
  const { mutateAsync: reject } = useRejectPendingReview()
  const [forcingSyncKey, setForcingSyncKey] = useState<string|null>(null)

  // Per-month sheets config
  const [sheetsConfig, setSheetsConfig] = useState<SheetsConfig>({})

  useEffect(() => { setSheetsConfig(loadConfig()) }, [])

  const now = new Date(todayISO() + 'T12:00:00')
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  const monthList = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(currentYear, currentMonth - 1 - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, year: d.getFullYear(), month: d.getMonth() + 1 }
  })

  function updateSheetId(key: string, id: string) {
    const updated = { ...sheetsConfig, [key]: id }
    setSheetsConfig(updated)
    saveConfig(updated)
  }

  const lastSync = logs?.[0]

  const pendingCustomers = pending?.filter(p => p.type === 'customer') ?? []
  const pendingProducts = pending?.filter(p => p.type === 'product') ?? []

  const logColumns: ColumnDef<SyncLog>[] = [
    {
      accessorKey: 'synced_at',
      header: 'وقت المزامنة',
      cell: ({ getValue }) => formatDateTime(getValue() as string),
    },
    {
      accessorKey: 'trigger_type',
      header: 'النوع',
      cell: ({ getValue }) => getValue() === 'scheduled' ? 'مجدول' : 'يدوي',
    },
    {
      accessorKey: 'status',
      header: 'الحالة',
      cell: ({ getValue }) => {
        const s = getValue() as string
        return (
          <Badge variant={s === 'success' ? 'default' : s === 'running' ? 'secondary' : 'destructive'}>
            {s === 'success' ? 'ناجح' : s === 'running' ? 'جاري' : 'خطأ'}
          </Badge>
        )
      },
    },
    { accessorKey: 'records_imported', header: 'سجلات مستوردة' },
    { accessorKey: 'new_customers_found', header: 'عملاء جدد' },
    { accessorKey: 'new_products_found', header: 'أصناف جديدة' },
  ]

  // ── تجميع سجلات الـ Sheet في فواتير ─────────────────────────────────────────
  async function groupSheetDataIntoInvoices(monthKey: string) {
    const from = `${monthKey}-01`
    const d = new Date(monthKey + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0)
    const to = d.toISOString().split('T')[0]

    // مشتريات: تجميع حسب اليوم → فاتورة واحدة لكل يوم
    const { data: pRows } = await supabase.from('purchases')
      .select('id, date, invoice_number').eq('source', 'google_sheet')
      .is('invoice_number', null).gte('date', from).lte('date', to)
    if (pRows && pRows.length > 0) {
      const byDate = new Map<string, string[]>()
      pRows.forEach(r => { const ids = byDate.get(r.date) ?? []; ids.push(r.id); byDate.set(r.date, ids) })
      for (const [date, ids] of byDate) {
        const { data: existing } = await supabase.from('purchases').select('invoice_number').eq('source', 'google_sheet').eq('date', date).not('invoice_number', 'is', null).limit(1)
        let inv = existing?.[0]?.invoice_number
        if (!inv) {
          const { data: last } = await supabase.from('purchases').select('invoice_number').not('invoice_number', 'is', null).like('invoice_number', 'PIG-%').order('created_at', { ascending: false }).limit(1)
          const lastNum = parseInt((last?.[0]?.invoice_number ?? 'PIG-00000').replace('PIG-', '')) + 1
          inv = `PIG-${String(lastNum).padStart(5, '0')}`
        }
        await supabase.from('purchases').update({ invoice_number: inv }).in('id', ids)
      }
    }

    // مبيعات: تجميع حسب اليوم + العميل → فاتورة واحدة لكل (يوم، عميل)
    const { data: sRows } = await supabase.from('sales')
      .select('id, date, customer_id, invoice_number').eq('source', 'google_sheet')
      .is('invoice_number', null).gte('date', from).lte('date', to)
    if (sRows && sRows.length > 0) {
      const byDayCustomer = new Map<string, string[]>()
      sRows.forEach(r => { const k = `${r.date}__${r.customer_id}`; const ids = byDayCustomer.get(k) ?? []; ids.push(r.id); byDayCustomer.set(k, ids) })
      for (const [key, ids] of byDayCustomer) {
        const [date, customerId] = key.split('__')
        const { data: existing } = await supabase.from('sales').select('invoice_number').eq('source', 'google_sheet').eq('date', date).eq('customer_id', customerId).not('invoice_number', 'is', null).limit(1)
        let inv = existing?.[0]?.invoice_number
        if (!inv) {
          const { data: last } = await supabase.from('sales').select('invoice_number').not('invoice_number', 'is', null).like('invoice_number', 'SIG-%').order('created_at', { ascending: false }).limit(1)
          const lastNum = parseInt((last?.[0]?.invoice_number ?? 'SIG-00000').replace('SIG-', '')) + 1
          inv = `SIG-${String(lastNum).padStart(5, '0')}`
        }
        await supabase.from('sales').update({ invoice_number: inv }).in('id', ids)
      }
    }
  }

  async function handleSyncMonth(key: string) {
    const sheetId = sheetsConfig[key]
    if (!sheetId) { toast.error('أدخل Spreadsheet ID أولاً لهذا الشهر'); return }
    try {
      const result = await triggerSync({ spreadsheetId: sheetId })
      toast.loading('جاري تجميع الفواتير...', { id: 'sync-group' })
      await groupSheetDataIntoInvoices(key)
      toast.success(`تمت المزامنة — ${result.imported ?? 0} سجل`, { id: 'sync-group' })
    } catch (err) {
      toast.error(`فشلت المزامنة: ${(err as Error).message}`)
    }
  }

  async function handleForceSync(key: string) {
    const sheetId = sheetsConfig[key]
    if (!sheetId) { toast.error('أدخل Spreadsheet ID أولاً لهذا الشهر'); return }
    setForcingSyncKey(key)
    try {
      toast.loading('جاري حذف البيانات القديمة...', { id: 'force-sync' })
      await deleteSheetData(key)
      toast.loading('جاري إعادة المزامنة...', { id: 'force-sync' })
      const result = await triggerSync({ spreadsheetId: sheetId })
      toast.loading('جاري تجميع الفواتير...', { id: 'force-sync' })
      await groupSheetDataIntoInvoices(key)
      toast.success(`تمت المزامنة الكاملة — ${result.imported ?? 0} سجل`, { id: 'force-sync' })
    } catch (err) {
      toast.error(`فشلت المزامنة: ${(err as Error).message}`, { id: 'force-sync' })
    } finally {
      setForcingSyncKey(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Status card */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-medium text-foreground mb-1">حالة آخر مزامنة</p>
              {lastSync ? (
                <div className="flex items-center gap-2">
                  {lastSync.status === 'success' ? <CheckCircle className="w-4 h-4 text-success" />
                    : lastSync.status === 'running' ? <Clock className="w-4 h-4 text-warning" />
                    : <XCircle className="w-4 h-4 text-danger" />}
                  <span className="text-sm font-medium">{formatDateTime(lastSync.synced_at)}</span>
                  <span className="text-xs text-muted-foreground">— {lastSync.records_imported} سجل</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">لا توجد مزامنات سابقة — استخدم الجدول أدناه للمزامنة</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-month configuration + sync buttons */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            إعداد ومزامنة ملفات Google Sheets الشهرية
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            أدخل Spreadsheet ID لكل شهر (موجود في رابط الـ Sheet بعد <span dir="ltr">/d/</span> وقبل <span dir="ltr">/edit</span>)، ثم اضغط مزامنة
          </p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium w-32">الشهر</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium">Spreadsheet ID</th>
                  <th className="px-3 py-2 text-right text-muted-foreground font-medium w-48">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {monthList.map(({ key, year, month }) => {
                  const isForcing = forcingSyncKey === key
                  const isBusy = syncing || isDeleting || isForcing
                  return (
                  <tr key={key} className="border-b last:border-b-0 border-border/50">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                      {monthName(month)} {year}
                      {key === currentMonthKey() && <span className="text-xs text-primary mr-1.5 font-normal">(الحالي)</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        dir="ltr"
                        placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                        value={sheetsConfig[key] ?? ''}
                        onChange={e => updateSheetId(key, e.target.value)}
                        className="text-xs font-mono h-8"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant={sheetsConfig[key] ? 'default' : 'outline'}
                          disabled={isBusy || !sheetsConfig[key]}
                          onClick={() => handleSyncMonth(key)}
                          className="gap-1.5 h-8 text-xs flex-1"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${syncing && !isForcing ? 'animate-spin' : ''}`} />
                          مزامنة
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isBusy || !sheetsConfig[key]}
                          onClick={() => handleForceSync(key)}
                          className="gap-1.5 h-8 text-xs text-warning border-warning/30 hover:bg-warning/10 flex-1"
                          title="حذف البيانات القديمة من الـ Sheet وإعادة الاستيراد"
                        >
                          <Trash2 className={`w-3.5 h-3.5 ${isForcing ? 'animate-spin' : ''}`} />
                          تحديث كامل
                        </Button>
                      </div>
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">يُحفظ تلقائياً في المتصفح</p>
        </CardContent>
      </Card>

      {/* Pending review */}
      {pendingCustomers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-warning">⚠️ عملاء جدد بحاجة لمراجعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingCustomers.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{p.raw_name}</p>
                    {p.suggested_match && (
                      <p className="text-xs text-muted-foreground">اقتراح: {p.suggested_match}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve(p)} className="gap-1">
                      <CheckCircle className="w-3 h-3" /> اعتماد
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(p.id)} className="gap-1 text-danger border-danger hover:bg-danger/10">
                      <XCircle className="w-3 h-3" /> رفض
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-warning">⚠️ أصناف جديدة بحاجة لمراجعة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingProducts.map(p => (
                <div key={p.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="font-medium">{p.raw_name}</p>
                    {p.suggested_match && (
                      <p className="text-xs text-muted-foreground">اقتراح: {p.suggested_match}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => approve(p)} className="gap-1">
                      <CheckCircle className="w-3 h-3" /> اعتماد
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => reject(p.id)} className="gap-1 text-danger border-danger hover:bg-danger/10">
                      <XCircle className="w-3 h-3" /> رفض
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync log table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل المزامنات</CardTitle>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (logs ?? []).length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">لا توجد مزامنات سابقة — اضغط "استيراد الآن" لبدء أول مزامنة</p>
          ) : (
            <DataTable data={logs ?? []} columns={logColumns} searchPlaceholder="بحث..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
