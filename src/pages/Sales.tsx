import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { StepWizard } from '@/components/forms/StepWizard'
import { DataTable } from '@/components/tables/DataTable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useSales, useUpsertSales } from '@/hooks/useSales'
import { useInventoryDaily } from '@/hooks/useInventory'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Sale, SaleFormRow } from '@/types'
import { cn } from '@/lib/utils'

const emptyRow = (): SaleFormRow => ({
  product_id: '',
  qty_kg: 0,
  purchase_price_per_kg: 0,
  price_per_kg: 0,
})

export default function Sales() {
  const [step, setStep] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [rows, setRows] = useState<SaleFormRow[]>([emptyRow()])
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSource, setFilterSource] = useState('')

  const { data: products } = useProducts()
  const { data: customers } = useCustomers()
  const { data: inventory } = useInventoryDaily(selectedDate)
  const { data: sales, isLoading } = useSales(filterCustomer ? { customerId: filterCustomer } : undefined)
  const { mutateAsync: upsert, isPending } = useUpsertSales()

  function getWAC(productId: string): number {
    return inventory?.find(i => i.product_id === productId)?.weighted_avg_cost ?? 0
  }

  function updateRow(i: number, field: keyof SaleFormRow, value: string | number) {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const updated = { ...r, [field]: value }
      if (field === 'product_id') {
        updated.wac = getWAC(value as string)
      }
      return updated
    }))
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.product_id && r.qty_kg > 0)
    if (!selectedCustomer) { toast.error('اختر عميلاً'); return }
    if (valid.length === 0) { toast.error('أضف صنفاً واحداً على الأقل'); return }
    try {
      await upsert(valid.map(r => ({
        product_id: r.product_id,
        customer_id: selectedCustomer,
        date: selectedDate,
        qty_kg: r.qty_kg,
        purchase_price_per_kg: r.purchase_price_per_kg,
        price_per_kg: r.price_per_kg,
        source: 'web' as const,
      })))
      toast.success('تم حفظ المبيعات بنجاح')
      setStep(0)
      setRows([emptyRow()])
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  const columns = useMemo<ColumnDef<Sale>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.customer?.name_ar ?? '', id: 'customer', header: 'العميل' },
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorKey: 'qty_kg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'price_per_kg', header: 'سعر البيع', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_amount', header: 'الإجمالي', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      id: 'margin',
      header: 'الهامش',
      cell: ({ row }) => {
        const margin = row.original.total_amount - row.original.total_purchase
        const marginPct = row.original.total_amount > 0
          ? (margin / row.original.total_amount) * 100 : 0
        return (
          <span className={margin >= 0 ? 'text-success' : 'text-danger'}>
            {formatNumber(margin)} ({marginPct.toFixed(1)}%)
          </span>
        )
      },
    },
    { accessorKey: 'source', header: 'المصدر', cell: ({ getValue }) => getValue() === 'web' ? 'يدوي' : 'Sheets' },
  ], [])

  const filteredSales = useMemo(() => {
    let data = sales ?? []
    if (filterProduct) data = data.filter(s => s.product_id === filterProduct)
    if (filterDateFrom) data = data.filter(s => s.date >= filterDateFrom)
    if (filterDateTo) data = data.filter(s => s.date <= filterDateTo)
    if (filterSource) data = data.filter(s => s.source === filterSource)
    return data
  }, [sales, filterProduct, filterDateFrom, filterDateTo, filterSource])

  function clearFilters() {
    setFilterCustomer(''); setFilterProduct(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterSource('')
  }

  const hasFilters = filterCustomer || filterProduct || filterDateFrom || filterDateTo || filterSource

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إدخال مبيعات جديدة</CardTitle>
        </CardHeader>
        <CardContent>
          <StepWizard
            currentStep={step}
            onNext={() => setStep(s => s + 1)}
            onBack={() => setStep(s => s - 1)}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
            canNext={step === 0 ? (!!selectedCustomer && !!selectedDate) : rows.some(r => r.product_id && r.qty_kg > 0)}
            steps={[
              {
                label: 'اختيار العميل والتاريخ',
                component: (
                  <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <div className="space-y-2">
                      <Label>العميل</Label>
                      <Select value={selectedCustomer} onValueChange={v => setSelectedCustomer(v ?? '')}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر العميل" />
                        </SelectTrigger>
                        <SelectContent>
                          {customers?.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>التاريخ</Label>
                      <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} dir="ltr" />
                    </div>
                  </div>
                ),
              },
              {
                label: 'إدخال الأصناف',
                component: (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {['الصنف','الكمية(كج)','WAC','سعر البيع','هامش ريال','هامش%'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-medium text-muted-foreground">{h}</th>
                            ))}
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const wac = r.wac ?? getWAC(r.product_id)
                            const margin = r.qty_kg * (r.price_per_kg - wac)
                            const marginPct = r.qty_kg * r.price_per_kg > 0
                              ? (margin / (r.qty_kg * r.price_per_kg)) * 100 : 0
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="px-2 py-1.5">
                                  <Select value={r.product_id} onValueChange={v => updateRow(i, 'product_id', v ?? '')}>
                                    <SelectTrigger className="w-36 text-sm">
                                      <SelectValue placeholder="اختر" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {products?.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input type="number" min="0" step="0.01" value={r.qty_kg || ''} onChange={e => updateRow(i, 'qty_kg', parseFloat(e.target.value) || 0)} className="w-20 text-sm" dir="ltr" />
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground">{formatNumber(wac)}</td>
                                <td className="px-2 py-1.5">
                                  <Input type="number" min="0" step="0.01" value={r.price_per_kg || ''} onChange={e => updateRow(i, 'price_per_kg', parseFloat(e.target.value) || 0)} className="w-20 text-sm" dir="ltr" />
                                </td>
                                <td className={cn('px-2 py-1.5 font-medium', margin >= 0 ? 'text-success' : 'text-danger')}>
                                  {formatNumber(margin)}
                                </td>
                                <td className={cn('px-2 py-1.5', marginPct >= 0 ? 'text-success' : 'text-danger')}>
                                  {marginPct.toFixed(1)}%
                                </td>
                                <td className="px-2 py-1.5">
                                  <Button variant="ghost" size="icon" onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))} className="text-danger h-7 w-7">×</Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setRows(prev => [...prev, emptyRow()])}>+ إضافة صنف</Button>
                  </div>
                ),
              },
              {
                label: 'مراجعة وحفظ',
                component: (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      العميل: {customers?.find(c => c.id === selectedCustomer)?.name_ar} — {formatDate(selectedDate)}
                    </p>
                    <div className="rounded-lg border border-border overflow-hidden text-sm">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            {['الصنف','الكمية','سعر البيع','الإجمالي'].map(h => (
                              <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.filter(r => r.product_id && r.qty_kg > 0).map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-3 py-2">{products?.find(p => p.id === r.product_id)?.name_ar}</td>
                              <td className="px-3 py-2">{formatNumber(r.qty_kg)}</td>
                              <td className="px-3 py-2">{formatNumber(r.price_per_kg)}</td>
                              <td className="px-3 py-2 font-medium">{formatNumber(r.qty_kg * r.price_per_kg)}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-medium">
                            <td className="px-3 py-2" colSpan={3}>الإجمالي</td>
                            <td className="px-3 py-2 text-primary">
                              {formatNumber(rows.reduce((s, r) => s + r.qty_kg * r.price_per_kg, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل المبيعات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <Select value={filterCustomer} onValueChange={v => setFilterCustomer(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="كل العملاء" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل العملاء</SelectItem>
                {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterProduct} onValueChange={v => setFilterProduct(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الأصناف</SelectItem>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={v => setFilterSource(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="كل المصادر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل المصادر</SelectItem>
                <SelectItem value="web">يدوي</SelectItem>
                <SelectItem value="google_sheet">Sheets</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">من</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="text-xs h-9" dir="ltr" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">إلى</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="text-xs h-9" dir="ltr" />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                مسح الفلاتر
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable data={filteredSales} columns={columns} searchPlaceholder="بحث في المبيعات..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
