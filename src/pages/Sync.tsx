import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { useSyncLogs, useSyncPendingReview, useTriggerSync, useApprovePendingReview, useRejectPendingReview } from '@/hooks/useSync'
import { formatDate } from '@/lib/utils'
import type { SyncLog } from '@/types'
import { RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react'

export default function Sync() {
  const { data: logs, isLoading: logsLoading } = useSyncLogs()
  const { data: pending } = useSyncPendingReview()
  const { mutateAsync: triggerSync, isPending: syncing } = useTriggerSync()
  const { mutateAsync: approve } = useApprovePendingReview()
  const { mutateAsync: reject } = useRejectPendingReview()

  const lastSync = logs?.[0]

  async function handleSync() {
    try {
      const result = await triggerSync()
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
      cell: ({ getValue }) => formatDate(getValue() as string),
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
                  <span className="font-medium">{formatDate(lastSync.synced_at)}</span>
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
            <p className="text-sm text-muted-foreground mb-3">استيراد يدوي</p>
            <Button onClick={handleSync} disabled={syncing} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'جاري الاستيراد...' : 'استيراد الآن'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              يستورد من Google Sheet الموضح في إعدادات البيئة
            </p>
          </CardContent>
        </Card>
      </div>

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
          ) : (
            <DataTable data={logs ?? []} columns={logColumns} searchPlaceholder="بحث..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
