import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSuppliers, useUpsertSupplier, useDeleteSupplier } from '@/hooks/useSuppliers'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { exportToExcel } from '@/lib/excel'
import type { Supplier } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Pencil, Trash2, Truck, Phone, MapPin, FileDown, ShoppingCart, Package } from 'lucide-react'

export function SuppliersDashboard() {
  const today = todayISO()
  const ninetyAgo = new Date(today + 'T12:00:00')
  ninetyAgo.setDate(ninetyAgo.getDate() - 90)
  const fromDate = ninetyAgo.toISOString().split('T')[0]

  const { data: suppliers, isLoading: sLoading } = useSuppliers()
  const { data: purchases, isLoading: pLoading } = usePurchasesByRange(fromDate, today)
  const { mutateAsync: upsert, isPending } = useUpsertSupplier()
  const { mutateAsync: remove, isPending: isRemoving } = useDeleteSupplier()

  const [editSupplier, setEditSupplier] = useState<Partial<Supplier> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const isLoading = sLoading || pLoading

  const supplierStats = useMemo(() => {
    const stats = new Map<string, {
      total: number; invoices: Set<string>; lastDate: string
      products: Map<string, number>; days: Set<string>
    }>()
    purchases?.filter(p => p.transaction_type !== 'مرتجع_مشتريات').forEach(p => {
      const key = p.supplier_id ?? 'none'
      const ex = stats.get(key) ?? { total: 0, invoices: new Set<string>(), lastDate: '', products: new Map<string, number>(), days: new Set<string>() }
      ex.total += p.total_cost
      if (p.invoice_number) ex.invoices.add(p.invoice_number)
      if (!ex.lastDate || p.date > ex.lastDate) ex.lastDate = p.date
      ex.days.add(p.date)
      const pName = p.product?.name_ar ?? p.product_id
      ex.products.set(pName, (ex.products.get(pName) ?? 0) + p.total_cost)
      stats.set(key, ex)
    })
    return (suppliers ?? []).map(s => {
      const st = stats.get(s.id)
      const topProducts = Array.from(st?.products.entries() ?? []).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n]) => n)
      return {
        ...s,
        total90: st?.total ?? 0,
        invoiceCount: st?.invoices.size ?? 0,
        lastDate: st?.lastDate ?? '',
        activeDays: st?.days.size ?? 0,
        avgPerInvoice: st && st.invoices.size > 0 ? st.total / st.invoices.size : 0,
        topProducts,
      }
    }).sort((a, b) => b.total90 - a.total90)
  }, [suppliers, purchases])

  const filtered = useMemo(() =>
    search ? supplierStats.filter(s => s.name_ar.toLowerCase().includes(search.toLowerCase())) : supplierStats,
    [supplierStats, search]
  )

  const totalPurchases90 = useMemo(() => supplierStats.reduce((s, r) => s + r.total90, 0), [supplierStats])
  const activeSuppliers = useMemo(() => supplierStats.filter(s => s.total90 > 0).length, [supplierStats])

  const barData = useMemo(() =>
    supplierStats.slice(0, 8).filter(s => s.total90 > 0).map(s => ({
      name: s.name_ar.length > 10 ? s.name_ar.substring(0, 10) + '…' : s.name_ar,
      value: Math.round(s.total90),
    })),
    [supplierStats]
  )

  async function handleSave() {
    if (!editSupplier?.name_ar) return
    try { await upsert(editSupplier as Partial<Supplier> & { name_ar: string }); setDialogOpen(false); setEditSupplier(null) } catch {}
  }

  function handleExport() {
    exportToExcel(supplierStats.map(s => ({
      'اسم المورد': s.name_ar,
      'الهاتف': s.phone ?? '—',
      'المدينة': s.city ?? '—',
      'إجمالي المشتريات (90 يوم)': s.total90,
      'عدد الفواتير': s.invoiceCount,
      'متوسط الفاتورة': s.avgPerInvoice,
      'آخر شراء': s.lastDate || '—',
      'أبرز الأصناف': s.topProducts.join(' / '),
    })), 'الموردون')
  }

  if (isLoading) return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-3 gap-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-36" />)}</div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Action bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <Input placeholder="بحث عن مورد..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-48 text-sm" />
          <span className="text-xs text-muted-foreground">{filtered.length} مورد</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExport}>
            <FileDown className="w-3.5 h-3.5" />Excel
          </Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={() => { setEditSupplier({ name_ar: '', phone: '', city: '', is_active: true, is_default: false }); setDialogOpen(true) }}>
            <Plus className="w-3.5 h-3.5" />إضافة مورد
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'إجمالي الموردين', value: String((suppliers ?? []).length), icon: Truck, color: 'bg-primary/10 text-primary' },
            { label: 'موردون نشطون (90 يوم)', value: String(activeSuppliers), icon: Package, color: 'bg-success/10 text-success' },
            { label: 'إجمالي المشتريات (90 يوم)', value: `${formatNumber(totalPurchases90)} ر.س`, icon: ShoppingCart, color: 'bg-warning/10 text-warning' },
            { label: 'أعلى مورد', value: supplierStats[0]?.name_ar ?? '—', icon: Truck, color: 'bg-primary/10 text-primary' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}><CardContent className="pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="text-base font-bold truncate mt-0.5">{value}</p></div>
                <div className={cn('p-2 rounded-xl shrink-0', color)}><Icon className="w-4 h-4" /></div>
              </div>
            </CardContent></Card>
          ))}
        </div>

        {/* Bar chart */}
        {barData.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">أعلى الموردين من حيث المشتريات (90 يوم)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'المشتريات']} />
                  <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Suppliers grid */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا يوجد موردون{search ? ` يطابق "${search}"` : ' بعد'}</p>
            {!search && <Button size="sm" className="mt-3 gap-1" onClick={() => { setEditSupplier({ name_ar: '', phone: '', city: '', is_active: true, is_default: false }); setDialogOpen(true) }}><Plus className="w-3.5 h-3.5" />إضافة أول مورد</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(s => (
              <Card key={s.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{s.name_ar}</p>
                      <div className="flex flex-col gap-0.5 mt-0.5">
                        {s.phone && <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="w-3 h-3" />{s.phone}</span>}
                        {s.city && <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{s.city}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.is_default && <Badge className="text-xs bg-primary/15 text-primary">افتراضي</Badge>}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditSupplier({ id: s.id, name_ar: s.name_ar, phone: s.phone ?? '', city: s.city ?? '', notes: s.notes ?? '' }); setDialogOpen(true) }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      {!s.is_default && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:bg-danger/10" onClick={() => setDeleteId(s.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>حصة المشتريات</span>
                      <span>{totalPurchases90 > 0 ? ((s.total90 / totalPurchases90) * 100).toFixed(1) : '0'}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${totalPurchases90 > 0 ? (s.total90 / totalPurchases90) * 100 : 0}%` }} />
                    </div>
                  </div>

                  <div className="space-y-1.5 text-sm border-t border-border pt-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">المشتريات (90 يوم)</span><span className="font-semibold text-primary">{formatNumber(s.total90)} ر.س</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">عدد الفواتير</span><span>{s.invoiceCount} فاتورة</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">متوسط الفاتورة</span><span>{formatNumber(s.avgPerInvoice)} ر.س</span></div>
                    {s.lastDate && <div className="flex justify-between"><span className="text-muted-foreground">آخر شراء</span><span className="text-xs">{formatDate(s.lastDate)}</span></div>}
                  </div>
                  {s.topProducts.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">أبرز الأصناف:</p>
                      <div className="flex flex-wrap gap-1">
                        {s.topProducts.map((p, i) => <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{p}</span>)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditSupplier(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editSupplier?.id ? 'تعديل مورد' : 'إضافة مورد جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>الاسم <span className="text-danger">*</span></Label>
              <Input value={editSupplier?.name_ar ?? ''} onChange={e => setEditSupplier(p => ({ ...p, name_ar: e.target.value }))} /></div>
            <div className="space-y-1"><Label>الهاتف</Label>
              <Input value={String(editSupplier?.phone ?? '')} onChange={e => setEditSupplier(p => ({ ...p, phone: e.target.value }))} dir="ltr" /></div>
            <div className="space-y-1"><Label>المدينة</Label>
              <Input value={String(editSupplier?.city ?? '')} onChange={e => setEditSupplier(p => ({ ...p, city: e.target.value }))} /></div>
            <div className="space-y-1"><Label>ملاحظات</Label>
              <Input value={String(editSupplier?.notes ?? '')} onChange={e => setEditSupplier(p => ({ ...p, notes: e.target.value }))} /></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button size="sm" disabled={isPending || !editSupplier?.name_ar} onClick={handleSave}>{isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف المورد</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد إزالة هذا المورد؟ لن يُحذف من السجلات القديمة.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" size="sm" disabled={isRemoving}
              onClick={async () => { if (deleteId) { await remove(deleteId); setDeleteId(null) } }}>{isRemoving ? 'جاري...' : 'حذف'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
