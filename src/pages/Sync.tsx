import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { useSyncLogs, useSyncPendingReview, useTriggerSync, useDeleteSheetDataByMonth, useApprovePendingReview, useRejectPendingReview } from '@/hooks/useSync'
import { useCustomers } from '@/hooks/useCustomers'
import { useProducts, useUpsertProduct } from '@/hooks/useProducts'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'
import type { SyncLog, SyncPendingReview } from '@/types'
import { RefreshCw, CheckCircle, XCircle, Clock, Settings2, Trash2, ShoppingCart, TrendingUp, Package, Plus } from 'lucide-react'
import { monthName, todayISO } from '@/lib/utils'

const QUICK_ACTIONS = [
  { to: '/purchases', label: 'فاتورة مشتريات', icon: ShoppingCart, color: 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/15' },
  { to: '/sales', label: 'فاتورة مبيعات', icon: TrendingUp, color: 'bg-success/10 text-success border-success/20 hover:bg-success/15' },
  { to: '/waste', label: 'تسجيل هدر', icon: Trash2, color: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/15' },
  { to: '/inventory', label: 'جرد المخزون', icon: Package, color: 'bg-muted/50 text-foreground border-border hover:bg-muted' },
]

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
  const { data: customers } = useCustomers()
  const { data: products } = useProducts()
  const { mutateAsync: triggerSync, isPending: syncing } = useTriggerSync()
  const { mutateAsync: deleteSheetData, isPending: isDeleting } = useDeleteSheetDataByMonth()
  const { mutateAsync: approve } = useApprovePendingReview()
  const { mutateAsync: reject } = useRejectPendingReview()
  const [forcingSyncKey, setForcingSyncKey] = useState<string|null>(null)
  const [selectedCustomers, setSelectedCustomers] = useState<Record<string, string>>({})
  const [selectedProducts, setSelectedProducts] = useState<Record<string, string>>({})
  const [newProductDialog, setNewProductDialog] = useState<{ review: SyncPendingReview; nameAr: string; category: string } | null>(null)
  const { mutateAsync: upsertProduct, isPending: isCreatingProduct } = useUpsertProduct()

  async function handleCreateAndLink() {
    if (!newProductDialog) return
    try {
      const created = await upsertProduct({
        name_ar: newProductDialog.nameAr.trim(),
        name_en: newProductDialog.review.raw_name,
        category: newProductDialog.category as 'خضار' | 'فاكهة' | 'أعشاب',
        is_active: true,
      })
      if (created?.id) {
        await approve({ review: newProductDialog.review, existingProductId: created.id })
        toast.success(`تم إنشاء "${newProductDialog.nameAr}" وربطه`)
      }
      setNewProductDialog(null)
    } catch { toast.error('حدث خطأ أثناء الإنشاء') }
  }

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

  // ── دالة التجميع الأساسية (مع دعم تحديد نطاق زمني أو تجميع الكل) ────────────
  async function runGrouping(from?: string, to?: string) {
    // ─ مشتريات ─
    let pQuery = supabase.from('purchases')
      .select('id, date').eq('source', 'google_sheet')
      .is('invoice_number', null).limit(50000)
    if (from) pQuery = pQuery.gte('date', from)
    if (to)   pQuery = pQuery.lte('date', to)
    const { data: pRows } = await pQuery

    if (pRows && pRows.length > 0) {
      const byDate = new Map<string, string[]>()
      pRows.forEach(r => { const ids = byDate.get(r.date) ?? []; ids.push(r.id); byDate.set(r.date, ids) })

      const { data: lastP } = await supabase.from('purchases')
        .select('invoice_number').not('invoice_number', 'is', null)
        .like('invoice_number', 'PIG-%').order('created_at', { ascending: false }).limit(1)
      let pCounter = parseInt((lastP?.[0]?.invoice_number ?? 'PIG-00000').replace('PIG-', '')) + 1

      for (const [date, ids] of byDate) {
        // هل يوجد فاتورة موجودة لهذا اليوم؟
        const { data: existing } = await supabase.from('purchases')
          .select('invoice_number').eq('source', 'google_sheet').eq('date', date)
          .not('invoice_number', 'is', null).limit(1)
        const inv = existing?.[0]?.invoice_number ?? `PIG-${String(pCounter++).padStart(5, '0')}`
        await supabase.from('purchases').update({ invoice_number: inv }).in('id', ids)
      }
    }

    // ─ مبيعات ─
    let sQuery = supabase.from('sales')
      .select('id, date, customer_id').eq('source', 'google_sheet')
      .is('invoice_number', null).limit(50000)
    if (from) sQuery = sQuery.gte('date', from)
    if (to)   sQuery = sQuery.lte('date', to)
    const { data: sRows } = await sQuery

    if (sRows && sRows.length > 0) {
      const byDayCustomer = new Map<string, string[]>()
      sRows.forEach(r => {
        const k = `${r.date}__${r.customer_id}`
        const ids = byDayCustomer.get(k) ?? []; ids.push(r.id); byDayCustomer.set(k, ids)
      })

      const { data: lastS } = await supabase.from('sales')
        .select('invoice_number').not('invoice_number', 'is', null)
        .like('invoice_number', 'SIG-%').order('created_at', { ascending: false }).limit(1)
      let sCounter = parseInt((lastS?.[0]?.invoice_number ?? 'SIG-00000').replace('SIG-', '')) + 1

      for (const [key, ids] of byDayCustomer) {
        const [date, customerId] = key.split('__')
        // هل يوجد فاتورة لهذا اليوم + العميل؟
        const { data: existing } = await supabase.from('sales')
          .select('invoice_number').eq('source', 'google_sheet')
          .eq('date', date).eq('customer_id', customerId)
          .not('invoice_number', 'is', null).limit(1)
        const inv = existing?.[0]?.invoice_number ?? `SIG-${String(sCounter++).padStart(5, '0')}`
        await supabase.from('sales').update({ invoice_number: inv }).in('id', ids)
      }
    }

    return { purchases: pRows?.length ?? 0, sales: sRows?.length ?? 0 }
  }

  // تجميع شهر محدد (بعد المزامنة المباشرة)
  async function groupSheetDataIntoInvoices(monthKey: string) {
    const from = `${monthKey}-01`
    const d = new Date(monthKey + '-01T12:00:00'); d.setMonth(d.getMonth() + 1); d.setDate(0)
    const to = d.toISOString().split('T')[0]
    await runGrouping(from, to)
  }

  // تجميع كل البيانات غير المرقّمة (بدون قيد الشهر)
  const [isGroupingAll, setIsGroupingAll] = useState(false)
  async function handleGroupAll() {
    setIsGroupingAll(true)
    try {
      toast.loading('جاري تجميع كل الفواتير...', { id: 'group-all' })
      const result = await runGrouping()
      toast.success(
        `تم تجميع: ${result.purchases} مشتريات، ${result.sales} مبيعات`,
        { id: 'group-all' }
      )
    } catch (err) {
      toast.error(`فشل التجميع: ${(err as Error).message}`, { id: 'group-all' })
    } finally {
      setIsGroupingAll(false)
    }
  }

  // يعرض نتيجة المزامنة: عدد المستورد + الورقات/المنتجات غير المطابقة
  function showSyncResult(result: { imported?: number; skippedSheets?: string[]; unmatchedProducts?: string[] }, toastId: string) {
    const imported = result.imported ?? 0
    const skipped = result.skippedSheets ?? []
    const unmatched = result.unmatchedProducts ?? []

    const lines: string[] = [`تمت المزامنة — ${imported} سجل`]
    if (skipped.length > 0) {
      lines.push(`ورقات غير مطابقة (${skipped.length}): ${skipped.join('، ')}`)
    }
    if (unmatched.length > 0) {
      const shown = unmatched.slice(0, 10).join('، ')
      const more = unmatched.length > 10 ? ` …+${unmatched.length - 10}` : ''
      lines.push(`أصناف غير مطابقة (${unmatched.length}): ${shown}${more}`)
    }

    const hasWarnings = skipped.length > 0 || unmatched.length > 0
    const description = lines.slice(1).join('\n')
    if (hasWarnings) {
      toast.warning(lines[0], { id: toastId, description, duration: 12000 })
    } else {
      toast.success(lines[0], { id: toastId })
    }
  }

  async function handleSyncMonth(key: string) {
    const sheetId = sheetsConfig[key]
    if (!sheetId) { toast.error('أدخل Spreadsheet ID أولاً لهذا الشهر'); return }
    try {
      const result = await triggerSync({ spreadsheetId: sheetId })
      toast.loading('جاري تجميع الفواتير...', { id: 'sync-group' })
      await groupSheetDataIntoInvoices(key)
      showSyncResult(result, 'sync-group')
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
      showSyncResult(result, 'force-sync')
    } catch (err) {
      toast.error(`فشلت المزامنة: ${(err as Error).message}`, { id: 'force-sync' })
    } finally {
      setForcingSyncKey(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map(a => (
          <Link key={a.to} to={a.to} className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-colors ${a.color}`}>
            <a.icon className="w-4 h-4 shrink-0" />{a.label}
          </Link>
        ))}
      </div>

      {/* Group all ungrouped invoices */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-semibold text-foreground">تجميع كل الفواتير غير المرقّمة</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                يعالج جميع بيانات Sheets التي استُوردت بدون رقم فاتورة — مشتريات حسب اليوم، مبيعات حسب اليوم+العميل
              </p>
            </div>
            <Button
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={isGroupingAll || syncing || isDeleting}
              onClick={handleGroupAll}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isGroupingAll ? 'animate-spin' : ''}`} />
              {isGroupingAll ? 'جاري التجميع...' : 'تجميع كل الفواتير'}
            </Button>
          </div>
        </CardContent>
      </Card>

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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              إعداد ومزامنة ملفات Google Sheets الشهرية
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={syncing || isDeleting}
                className="gap-1.5 h-8 text-xs"
                onClick={async () => {
                  const configured = monthList.filter(({ key }) => sheetsConfig[key])
                  if (configured.length === 0) { toast.error('أدخل Spreadsheet ID لشهر واحد على الأقل'); return }
                  for (const { key } of configured) {
                    await handleSyncMonth(key)
                  }
                }}>
                <RefreshCw className="w-3.5 h-3.5" />مزامنة الكل
              </Button>
              <Button size="sm" variant="outline" disabled={syncing || isDeleting}
                className="gap-1.5 h-8 text-xs text-warning border-warning/30 hover:bg-warning/10"
                onClick={async () => {
                  const configured = monthList.filter(({ key }) => sheetsConfig[key])
                  if (configured.length === 0) { toast.error('أدخل Spreadsheet ID لشهر واحد على الأقل'); return }
                  for (const { key } of configured) {
                    await handleForceSync(key)
                  }
                }}>
                <Trash2 className="w-3.5 h-3.5" />تحديث كامل للكل
              </Button>
            </div>
          </div>
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
            <CardTitle className="text-base text-warning flex items-center gap-2">
              <Clock className="w-4 h-4" />
              عملاء جدد من الـ Sheet بحاجة لمراجعة
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              اختر عميلاً موجوداً لربطه، أو اضغط "إنشاء جديد" لإضافة عميل جديد تلقائياً
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingCustomers.map(p => {
                const customerOptions = (customers ?? []).map(c => ({ value: c.id, label: c.name_ar }))
                const selected = selectedCustomers[p.id] ?? ''
                return (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{p.raw_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">اسم الورقة في الـ Sheet</p>
                    </div>
                    <div className="w-56 shrink-0">
                      <Combobox
                        options={customerOptions}
                        value={selected}
                        onValueChange={val => setSelectedCustomers(prev => ({ ...prev, [p.id]: val }))}
                        placeholder="ربط بعميل موجود..."
                        searchPlaceholder="ابحث عن عميل..."
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm"
                        onClick={() => approve({ review: p, existingCustomerId: selected || undefined })}
                        className="gap-1 h-8 text-xs">
                        <CheckCircle className="w-3 h-3" />
                        {selected ? 'ربط' : 'إنشاء جديد'}
                      </Button>
                      <Button size="sm" variant="outline"
                        onClick={() => reject(p.id)}
                        className="gap-1 h-8 text-xs text-danger border-danger/30 hover:bg-danger/10">
                        <XCircle className="w-3 h-3" /> رفض
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {pendingProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-warning flex items-center gap-2">
              <XCircle className="w-4 h-4" />
              أصناف من الـ Sheet بحاجة لربط ({pendingProducts.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              اختر من القائمة الصنف المقابل في النظام، ثم اضغط "ربط" — سيُضاف اسم الـ Sheet كاسم بديل تلقائياً
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pendingProducts.map(p => {
                const productOptions = (products ?? []).map(pr => ({ value: pr.id, label: pr.name_ar, sub: pr.name_en ?? '' }))
                const selected = selectedProducts[p.id] ?? ''
                return (
                  <div key={p.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm font-mono">{p.raw_name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">اسم الصنف في الـ Sheet</p>
                    </div>
                    <div className="w-56 shrink-0">
                      <Combobox
                        options={productOptions}
                        value={selected}
                        onValueChange={val => setSelectedProducts(prev => ({ ...prev, [p.id]: val }))}
                        placeholder="اختر الصنف المقابل..."
                        searchPlaceholder="ابحث عن صنف..."
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        disabled={!selected}
                        onClick={() => approve({ review: p, existingProductId: selected })}
                        className="gap-1 h-8 text-xs"
                      >
                        <CheckCircle className="w-3 h-3" /> ربط
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => setNewProductDialog({ review: p, nameAr: p.raw_name, category: 'خضار' })}
                        className="gap-1 h-8 text-xs text-primary border-primary/30 hover:bg-primary/10"
                      >
                        <Plus className="w-3 h-3" /> صنف جديد
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        onClick={() => reject(p.id)}
                        className="gap-1 h-8 text-xs text-danger border-danger/30 hover:bg-danger/10"
                      >
                        <XCircle className="w-3 h-3" /> تجاهل
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog إنشاء صنف جديد */}
      <Dialog open={!!newProductDialog} onOpenChange={o => !o && setNewProductDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة صنف جديد وربطه</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="p-2 bg-muted/40 rounded-lg text-xs text-muted-foreground">
              اسم الـ Sheet: <span className="font-mono font-medium text-foreground">{newProductDialog?.review.raw_name}</span>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الاسم بالعربية <span className="text-danger">*</span></Label>
              <Input
                value={newProductDialog?.nameAr ?? ''}
                onChange={e => setNewProductDialog(p => p ? { ...p, nameAr: e.target.value } : p)}
                placeholder="اسم الصنف بالعربية"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الفئة</Label>
              <Select
                value={newProductDialog?.category ?? 'خضار'}
                onValueChange={v => v && setNewProductDialog(p => p ? { ...p, category: v } : p)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="خضار">خضار</SelectItem>
                  <SelectItem value="فاكهة">فاكهة</SelectItem>
                  <SelectItem value="أعشاب">أعشاب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleCreateAndLink}
                disabled={isCreatingProduct || !newProductDialog?.nameAr?.trim()}
                className="flex-1"
              >
                {isCreatingProduct ? 'جاري...' : 'إنشاء وربط'}
              </Button>
              <Button variant="outline" onClick={() => setNewProductDialog(null)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
            <DataTable data={logs ?? []} columns={logColumns} showSearch={false} defaultPageSize={10} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
