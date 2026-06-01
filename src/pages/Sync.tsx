import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { useSyncLogs, useSyncPendingReview, useTriggerSync, useApprovePendingReview, useRejectPendingReview } from '@/hooks/useSync'
import { formatDateTime } from '@/lib/utils'
import type { SyncLog } from '@/types'
import { RefreshCw, CheckCircle, XCircle, Clock, Settings2 } from 'lucide-react'
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
  const { mutateAsync: approve } = useApprovePendingReview()
  const { mutateAsync: reject } = useRejectPendingReview()

  // Per-month sheets config
  const [sheetsConfig, setSheetsConfig] = useState<SheetsConfig>({})
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => { setSheetsConfig(loadConfig()) }, [])

  const now = new Date(todayISO() + 'T12:00:00')
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  // Build a list of the last 6 months for configuration
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

  const activeSheetId = sheetsConfig[currentMonthKey()] ?? ''

  const lastSync = logs?.[0]

  async function handleSync() {
    try {
      const result = await triggerSync({ spreadsheetId: activeSheetId || undefined })
      toast.success(`تمت المزامنة — ${result.imported ?? 0} سجل`)
    } catch (err) {
      toast.error(`فشلت المزامنة: ${(err as Error).message}`)
    }
  }

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

  return (
    <div className="space-y-6">
      {/* Status + trigger */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-3">آخر مزامنة</p>
            {lastSync ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {lastSync.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-success" />
                  ) : lastSync.status === 'running' ? (
                    <Clock className="w-4 h-4 text-warning" />
                  ) : (
                    <XCircle className="w-4 h-4 text-danger" />
                  )}
                  <span className="font-medium">{formatDateTime(lastSync.synced_at)}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lastSync.records_imported} سجل مستورد
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">لا توجد مزامنات سابقة</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground mb-1">استيراد يدوي</p>
            {activeSheetId && (
              <p className="text-xs text-muted-foreground mb-3 font-mono truncate" dir="ltr">{activeSheetId}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={syncing} className="gap-2">
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'جاري الاستيراد...' : 'استيراد الآن'}
              </Button>
              <Button variant="outline" size="icon" onClick={() => setShowConfig(v => !v)}>
                <Settings2 className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              يستورد من ملف {monthName(currentMonth)} {currentYear}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-month sheets configuration */}
      {showConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4" />
              إعداد ملفات Google Sheets الشهرية
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-4">
              أدخل معرّف الـ Spreadsheet ID لكل شهر (موجود في رابط الـ Sheet بعد /d/ وقبل /edit)
            </p>
            <div className="space-y-3">
              {monthList.map(({ key, year, month }) => (
                <div key={key} className="flex items-center gap-3">
                  <Label className="w-28 text-sm shrink-0">
                    {monthName(month)} {year}
                    {key === currentMonthKey() && <span className="text-xs text-primary mr-1">(الحالي)</span>}
                  </Label>
                  <Input
                    dir="ltr"
                    placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                    value={sheetsConfig[key] ?? ''}
                    onChange={e => updateSheetId(key, e.target.value)}
                    className="text-xs font-mono"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">يُحفظ تلقائياً في المتصفح</p>
          </CardContent>
        </Card>
      )}

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
