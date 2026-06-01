import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { PieChart } from '@/components/charts/PieChart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProducts } from '@/hooks/useProducts'
import { useWaste, useInsertWaste } from '@/hooks/useWaste'
import { useInventoryDaily } from '@/hooks/useInventory'
import { useAppStore } from '@/store/appStore'
import { formatNumber, formatDate, todayISO, monthName } from '@/lib/utils'
import type { WasteLog } from '@/types'

export default function Waste() {
  const { selectedMonth, selectedYear } = useAppStore()
  const [date, setDate] = useState(todayISO())
  const [productId, setProductId] = useState('')
  const [wasteKg, setWasteKg] = useState('')
  const [reason, setReason] = useState('')

  const { data: products } = useProducts()
  const { data: wasteLog, isLoading } = useWaste({ month: selectedMonth, year: selectedYear })
  const { data: inventory } = useInventoryDaily(date)
  const { mutateAsync: insertWaste, isPending } = useInsertWaste()

  function getWAC(pid: string) {
    return inventory?.find(i => i.product_id === pid)?.weighted_avg_cost ?? 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId || !wasteKg) { toast.error('اختر الصنف وأدخل الكمية'); return }
    try {
      await insertWaste({ product_id: productId, date, waste_kg: parseFloat(wasteKg), reason: reason || null, source: 'web' })
      toast.success('تم تسجيل الهدر بنجاح')
      setProductId('')
      setWasteKg('')
      setReason('')
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  // Monthly summary grouped by product
  const monthlySummary = useMemo(() => {
    const map = new Map<string, { name: string; waste_kg: number; cost: number; purchased_kg: number }>()
    wasteLog?.forEach(w => {
      const name = w.product?.name_ar ?? w.product_id
      const wac = getWAC(w.product_id)
      const existing = map.get(w.product_id) ?? { name, waste_kg: 0, cost: 0, purchased_kg: 0 }
      map.set(w.product_id, { ...existing, waste_kg: existing.waste_kg + w.waste_kg, cost: existing.cost + w.waste_kg * wac })
    })
    return Array.from(map.values()).sort((a, b) => b.waste_kg - a.waste_kg)
  }, [wasteLog, inventory])

  const pieData = useMemo(() =>
    monthlySummary.slice(0, 5).map(r => ({ name: r.name, value: r.waste_kg })), [monthlySummary]
  )

  const [filterProduct, setFilterProduct] = useState('')
  const [filterSource, setFilterSource] = useState('')

  const filteredWaste = useMemo(() => {
    let data = wasteLog ?? []
    if (filterProduct) data = data.filter(w => w.product_id === filterProduct)
    if (filterSource) data = data.filter(w => w.source === filterSource)
    return data
  }, [wasteLog, filterProduct, filterSource])

  const columns = useMemo<ColumnDef<WasteLog>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorKey: 'waste_kg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'reason', header: 'السبب', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'source', header: 'المصدر', cell: ({ getValue }) => getValue() === 'web' ? 'يدوي' : 'Sheets' },
  ], [])

  return (
    <div className="space-y-6">
      {/* Entry form */}
      <Card>
        <CardHeader>
          <CardTitle>تسجيل هدر يومي</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>الصنف</Label>
              <Select value={productId} onValueChange={v => setProductId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                <SelectContent>
                  {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الكمية (كج)</Label>
              <Input type="number" min="0" step="0.01" value={wasteKg} onChange={e => setWasteKg(e.target.value)} dir="ltr" placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label>السبب (اختياري)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="تلف طبيعي..." />
            </div>
            <div className="col-span-full">
              <Button type="submit" disabled={isPending}>{isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Monthly summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ملخص الهدر — {monthName(selectedMonth)} {selectedYear}</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-48" /> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-right text-muted-foreground">الصنف</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">هدر (كج)</th>
                      <th className="px-3 py-2 text-right text-muted-foreground">التكلفة (ر.س)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlySummary.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 text-warning">{formatNumber(r.waste_kg)}</td>
                        <td className="px-3 py-2 text-danger">{formatNumber(r.cost)}</td>
                      </tr>
                    ))}
                    {monthlySummary.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">لا توجد بيانات</td></tr>
                    )}
                    {monthlySummary.length > 0 && (
                      <tr className="bg-muted/30 font-medium">
                        <td className="px-3 py-2">الإجمالي</td>
                        <td className="px-3 py-2 text-warning">{formatNumber(monthlySummary.reduce((s, r) => s + r.waste_kg, 0))}</td>
                        <td className="px-3 py-2 text-danger">{formatNumber(monthlySummary.reduce((s, r) => s + r.cost, 0))}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">أكثر الأصناف هدراً</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? <PieChart data={pieData} /> : (
              <p className="text-center text-muted-foreground py-16 text-sm">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Log table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل الهدر — {monthName(selectedMonth)} {selectedYear}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <Select value={filterProduct} onValueChange={v => setFilterProduct(v ?? '')}>
              <SelectTrigger className="w-40"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الأصناف</SelectItem>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={v => setFilterSource(v ?? '')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="كل المصادر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل المصادر</SelectItem>
                <SelectItem value="web">يدوي</SelectItem>
                <SelectItem value="google_sheet">Sheets</SelectItem>
              </SelectContent>
            </Select>
            {(filterProduct || filterSource) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterProduct(''); setFilterSource('') }}
                className="text-muted-foreground">مسح</Button>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable data={filteredWaste} columns={columns} searchPlaceholder="بحث..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
