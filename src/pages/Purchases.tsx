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
import { useProducts } from '@/hooks/useProducts'
import { usePurchases, useUpsertPurchases } from '@/hooks/usePurchases'
import { calcCostPerKg } from '@/lib/calculations'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Purchase, PurchaseFormRow } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const emptyRow = (): PurchaseFormRow => ({
  product_id: '',
  cartons_qty: 0,
  price_per_carton: 0,
  weight_per_carton: 0,
  waste_kg: 0,
})

export default function Purchases() {
  const [step, setStep] = useState(0)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [rows, setRows] = useState<PurchaseFormRow[]>([emptyRow()])
  const [filterDate, setFilterDate] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterSource, setFilterSource] = useState('')

  const { data: products } = useProducts()
  const { data: purchases, isLoading } = usePurchases(filterDate || undefined)
  const { mutateAsync: upsert, isPending } = useUpsertPurchases()

  function updateRow(i: number, field: keyof PurchaseFormRow, value: string | number) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.product_id && r.cartons_qty > 0)
    if (valid.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل')
      return
    }
    try {
      await upsert(valid.map(r => ({
        product_id: r.product_id,
        date: selectedDate,
        cartons_qty: r.cartons_qty,
        price_per_carton: r.price_per_carton,
        weight_per_carton: r.weight_per_carton,
        waste_kg: r.waste_kg,
        cost_per_kg: calcCostPerKg(
          r.cartons_qty * r.price_per_carton,
          r.cartons_qty * r.weight_per_carton,
          r.waste_kg
        ),
        source: 'web' as const,
        notes: null,
      })))
      toast.success('تم حفظ المشتريات بنجاح')
      setStep(0)
      setRows([emptyRow()])
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  const filteredPurchases = useMemo(() => {
    let data = purchases ?? []
    if (filterProduct) data = data.filter(p => p.product_id === filterProduct)
    if (filterSource) data = data.filter(p => p.source === filterSource)
    return data
  }, [purchases, filterProduct, filterSource])

  // History columns
  const columns = useMemo<ColumnDef<Purchase>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.product?.name_ar ?? r.product_id, header: 'الصنف', id: 'product' },
    { accessorKey: 'cartons_qty', header: 'كراتين', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'price_per_carton', header: 'السعر/كرتون', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_cost', header: 'إجمالي التكلفة', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_weight', header: 'إجمالي الوزن (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'waste_kg', header: 'الهدر (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'cost_per_kg', header: 'تكلفة/كج', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'source', header: 'المصدر', cell: ({ getValue }) => getValue() === 'web' ? 'يدوي' : 'Sheets' },
  ], [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إدخال مشتريات جديدة</CardTitle>
        </CardHeader>
        <CardContent>
          <StepWizard
            currentStep={step}
            onNext={() => setStep(s => s + 1)}
            onBack={() => setStep(s => s - 1)}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
            canNext={step === 0 ? !!selectedDate : rows.some(r => r.product_id && r.cartons_qty > 0)}
            steps={[
              {
                label: 'اختيار التاريخ',
                component: (
                  <div className="space-y-3 max-w-xs">
                    <Label>تاريخ الشراء</Label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      dir="ltr"
                    />
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
                            {['الصنف','كراتين','السعر/كرتون','وزن/كرتون','هدر(كج)','تكلفة/كج'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-medium text-muted-foreground">{h}</th>
                            ))}
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const totalCost = r.cartons_qty * r.price_per_carton
                            const totalWeight = r.cartons_qty * r.weight_per_carton
                            const costPerKg = calcCostPerKg(totalCost, totalWeight, r.waste_kg)
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="px-2 py-1.5">
                                  <Select
                                    value={r.product_id}
                                    onValueChange={v => updateRow(i, 'product_id', v ?? '')}
                                  >
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
                                {(['cartons_qty','price_per_carton','weight_per_carton','waste_kg'] as const).map(field => (
                                  <td key={field} className="px-2 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={r[field] || ''}
                                      onChange={e => updateRow(i, field, parseFloat(e.target.value) || 0)}
                                      className="w-24 text-sm"
                                      dir="ltr"
                                    />
                                  </td>
                                ))}
                                <td className="px-2 py-1.5 text-primary font-medium w-24">
                                  {formatNumber(costPerKg)}
                                </td>
                                <td className="px-2 py-1.5">
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => removeRow(i)}
                                    className="text-danger hover:text-danger h-7 w-7"
                                  >×</Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Button variant="outline" size="sm" onClick={addRow}>+ إضافة صنف</Button>
                  </div>
                ),
              },
              {
                label: 'مراجعة وحفظ',
                component: (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">التاريخ: {formatDate(selectedDate)}</p>
                    <div className="rounded-lg border border-border overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            <th className="px-3 py-2 text-right text-muted-foreground">الصنف</th>
                            <th className="px-3 py-2 text-right text-muted-foreground">كراتين</th>
                            <th className="px-3 py-2 text-right text-muted-foreground">إجمالي التكلفة</th>
                            <th className="px-3 py-2 text-right text-muted-foreground">تكلفة/كج</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.filter(r => r.product_id && r.cartons_qty > 0).map((r, i) => {
                            const totalCost = r.cartons_qty * r.price_per_carton
                            const totalWeight = r.cartons_qty * r.weight_per_carton
                            const costPerKg = calcCostPerKg(totalCost, totalWeight, r.waste_kg)
                            const product = products?.find(p => p.id === r.product_id)
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="px-3 py-2">{product?.name_ar}</td>
                                <td className="px-3 py-2">{formatNumber(r.cartons_qty)}</td>
                                <td className="px-3 py-2">{formatNumber(totalCost)}</td>
                                <td className="px-3 py-2 text-primary">{formatNumber(costPerKg)}</td>
                              </tr>
                            )
                          })}
                          <tr className="bg-muted/30 font-medium">
                            <td className="px-3 py-2" colSpan={2}>الإجمالي</td>
                            <td className="px-3 py-2 text-primary">
                              {formatNumber(rows.reduce((s, r) => s + r.cartons_qty * r.price_per_carton, 0))}
                            </td>
                            <td></td>
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
          <CardTitle className="text-base">سجل المشتريات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">التاريخ</Label>
              <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} className="text-xs h-9" dir="ltr" />
            </div>
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
            {(filterDate || filterProduct || filterSource) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterDate(''); setFilterProduct(''); setFilterSource('') }}
                className="text-muted-foreground">مسح الفلاتر</Button>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable data={filteredPurchases} columns={columns} searchPlaceholder="بحث في المشتريات..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
