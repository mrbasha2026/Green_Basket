import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart } from '@/components/charts/BarChart'
import { DataTable } from '@/components/tables/DataTable'
import { useCustomers, useAllCustomers, useUpsertCustomer } from '@/hooks/useCustomers'
import { useSalesByRange } from '@/hooks/useSales'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import type { Sale } from '@/types'
import { exportToExcel } from '@/lib/excel'
import { BarChart2, Users, Plus, Pencil } from 'lucide-react'

type CustomerType = 'مستشفى' | 'فندق' | 'مطعم' | 'تجزئة'
type View = 'analytics' | 'manage'

export default function Customers() {
  const today = todayISO()
  const [view, setView] = useState<View>('analytics')

  const ninetyAgo = new Date(today)
  ninetyAgo.setDate(ninetyAgo.getDate() - 90)
  const fromDate = ninetyAgo.toISOString().split('T')[0]

  const { data: customers, isLoading: customersLoading } = useCustomers()
  const { data: allCustomers } = useAllCustomers()
  const { data: sales, isLoading: salesLoading } = useSalesByRange(fromDate, today)
  const { mutateAsync: upsertCustomer, isPending: isUpserting } = useUpsertCustomer()

  const isLoading = customersLoading || salesLoading

  // ── Analytics ─────────────────────────────────────────────────────────────
  const customerStats = useMemo(() => {
    const stats = new Map<string, {
      totalRevenue: number; totalCost: number; totalQtyKg: number; days: Set<string>
      productCounts: Map<string, number>; lastDate: string
    }>()

    sales?.forEach(s => {
      const existing = stats.get(s.customer_id) ?? {
        totalRevenue: 0, totalCost: 0, totalQtyKg: 0, days: new Set<string>(),
        productCounts: new Map<string, number>(), lastDate: ''
      }
      existing.totalRevenue += s.total_amount
      existing.totalCost += s.total_purchase
      existing.totalQtyKg += s.qty_kg
      existing.days.add(s.date)
      const pName = s.product?.name_ar ?? s.product_id
      existing.productCounts.set(pName, (existing.productCounts.get(pName) ?? 0) + s.qty_kg)
      if (!existing.lastDate || s.date > existing.lastDate) existing.lastDate = s.date
      stats.set(s.customer_id, existing)
    })

    return customers?.map(c => {
      const st = stats.get(c.id)
      const topProducts = Array.from(st?.productCounts.entries() ?? [])
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name)
      const totalQtyKg = st?.totalQtyKg ?? 0
      return {
        ...c,
        totalRevenue: st?.totalRevenue ?? 0,
        grossProfit: (st?.totalRevenue ?? 0) - (st?.totalCost ?? 0),
        activeDays: st?.days.size ?? 0,
        avgDailyRevenue: st ? (st.totalRevenue / Math.max(st.days.size, 1)) : 0,
        avgSellPerKg: totalQtyKg > 0 ? (st?.totalRevenue ?? 0) / totalQtyKg : 0,
        avgCostPerKg: totalQtyKg > 0 ? (st?.totalCost ?? 0) / totalQtyKg : 0,
        totalQtyKg,
        topProducts,
        lastDate: st?.lastDate ?? '',
      }
    }).sort((a, b) => b.totalRevenue - a.totalRevenue) ?? []
  }, [customers, sales])

  const barData = useMemo(() =>
    customerStats.slice(0, 8).map(c => ({
      name: c.name_ar,
      'الإيراد': c.totalRevenue,
      'الربح المباشر': c.grossProfit,
    })),
    [customerStats]
  )

  const salesColumns = useMemo<ColumnDef<Sale>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorKey: 'qty_kg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'price_per_kg', header: 'السعر', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_amount', header: 'الإجمالي', cell: ({ getValue }) => formatNumber(getValue() as number) },
  ], [])

  // ── Management ────────────────────────────────────────────────────────────
  const [editItem, setEditItem] = useState<{ id?: string; name_ar: string; type: CustomerType; is_active: boolean } | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filteredCustomers = (allCustomers ?? []).filter(c => !search || c.name_ar.includes(search))

  async function handleSave() {
    if (!editItem?.name_ar) { toast.error('اسم العميل مطلوب'); return }
    try {
      await upsertCustomer(editItem)
      toast.success('تم الحفظ')
      setDialogOpen(false); setEditItem(null)
    } catch { toast.error('حدث خطأ') }
  }

  if (isLoading && view === 'analytics') {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <button onClick={() => setView('analytics')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            view === 'analytics' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
          <BarChart2 className="w-4 h-4" />تحليل العملاء
        </button>
        <button onClick={() => setView('manage')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            view === 'manage' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
          <Users className="w-4 h-4" />إدارة العملاء
        </button>
      </div>

      {/* ── Analytics View ─────────────────────────────────────────────────── */}
      {view === 'analytics' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {customerStats.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-foreground">{c.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{c.type}</p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${c.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                      {c.is_active ? 'نشط' : 'غير نشط'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">إجمالي المبيعات</span>
                      <span className="font-medium">{formatNumber(c.totalRevenue)} ر.س</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">متوسط يومي</span>
                      <span>{formatNumber(c.avgDailyRevenue)} ر.س</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">الربح المباشر</span>
                      <span className={c.grossProfit >= 0 ? 'text-success' : 'text-danger'}>
                        {formatNumber(c.grossProfit)} ر.س
                      </span>
                    </div>
                    {c.totalQtyKg > 0 && (
                      <>
                        <div className="border-t border-border/50 pt-1.5 mt-1" />
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">م. سعر البيع/كج</span>
                          <span className="font-medium text-primary">{formatNumber(c.avgSellPerKg)} ر.س</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">م. تكلفة الكيلو</span>
                          <span className="font-medium text-warning">{formatNumber(c.avgCostPerKg)} ر.س</span>
                        </div>
                      </>
                    )}
                    {c.lastDate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">آخر طلب</span>
                        <span className="text-xs">{formatDate(c.lastDate)}</span>
                      </div>
                    )}
                  </div>
                  {c.topProducts.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">أكثر الأصناف طلباً:</p>
                      <div className="flex flex-wrap gap-1">
                        {c.topProducts.slice(0, 3).map((p, i) => (
                          <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">مقارنة الإيرادات والأرباح بين العملاء</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={barData}
                xAxisKey="name"
                bars={[
                  { dataKey: 'الإيراد', name: 'الإيراد', color: '#3b82f6' },
                  { dataKey: 'الربح المباشر', name: 'الربح المباشر', color: '#16a34a' },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">جميع المبيعات — آخر 90 يوم</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                data={sales ?? []}
                columns={salesColumns}
                searchPlaceholder="بحث..."
                onExportExcel={async () => {
                  await exportToExcel('customers-sales.xlsx',
                    ['التاريخ', 'الصنف', 'الكمية(كج)', 'السعر', 'الإجمالي'],
                    (sales ?? []).map(s => [s.date, s.product?.name_ar ?? '', s.qty_kg, s.price_per_kg, s.total_amount])
                  )
                }}
              />
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Manage View ────────────────────────────────────────────────────── */}
      {view === 'manage' && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">إدارة العملاء</CardTitle>
              <div className="flex items-center gap-2">
                <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-40 text-sm" />
                <Button size="sm" className="gap-1.5" onClick={() => { setEditItem({ name_ar: '', type: 'تجزئة', is_active: true }); setDialogOpen(true) }}>
                  <Plus className="w-3.5 h-3.5" />إضافة عميل
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-border overflow-hidden max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40 z-10">
                  <tr className="border-b border-border">
                    {['الاسم', 'النوع', 'الحالة', ''].map(h => (
                      <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCustomers.map((c, i) => (
                    <tr key={c.id} className={cn('border-b border-border/50 hover:bg-muted/20', i % 2 === 1 && 'bg-muted/10')}>
                      <td className="px-3 py-2 font-medium">{c.name_ar}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{c.type}</Badge></td>
                      <td className="px-3 py-2">
                        <span className={`text-xs font-medium ${c.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                          {c.is_active ? 'نشط' : 'موقوف'}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEditItem({ id: c.id, name_ar: c.name_ar, type: c.type, is_active: c.is_active }); setDialogOpen(true) }}>
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditItem(null) }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem?.id ? 'تعديل عميل' : 'إضافة عميل'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم <span className="text-danger">*</span></Label>
              <Input value={editItem?.name_ar ?? ''} onChange={e => setEditItem(p => ({ ...p!, name_ar: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>النوع</Label>
              <Select value={editItem?.type ?? 'تجزئة'} onValueChange={v => v && setEditItem(p => ({ ...p!, type: v as CustomerType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="تجزئة">تجزئة</SelectItem>
                  <SelectItem value="مستشفى">مستشفى</SelectItem>
                  <SelectItem value="فندق">فندق</SelectItem>
                  <SelectItem value="مطعم">مطعم</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editItem?.id && (
              <div className="space-y-1">
                <Label>الحالة</Label>
                <Select value={editItem.is_active ? 'active' : 'inactive'} onValueChange={v => setEditItem(p => ({ ...p!, is_active: v === 'active' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">موقوف</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={isUpserting} className="flex-1">
                {isUpserting ? 'جاري...' : 'حفظ'}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
