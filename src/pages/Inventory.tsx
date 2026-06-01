import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { useInventoryDaily } from '@/hooks/useInventory'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { InventoryDaily } from '@/types'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

export default function Inventory() {
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const { data: inventory, isLoading } = useInventoryDaily(selectedDate)

  const lowStock = useMemo(() => inventory?.filter(i => i.closing_stock_kg < 10) ?? [], [inventory])

  const filteredInventory = useMemo(() => {
    let data = inventory ?? []
    if (filterCategory) data = data.filter(i => i.product?.category === filterCategory)
    if (filterLowStock) data = data.filter(i => i.closing_stock_kg < 10)
    return data
  }, [inventory, filterCategory, filterLowStock])

  const columns = useMemo<ColumnDef<InventoryDaily>[]>(() => [
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorFn: r => r.product?.category ?? '', id: 'category', header: 'الفئة' },
    { accessorKey: 'opening_stock_kg', header: 'رصيد الفتح', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'purchased_weight', header: 'مشتريات (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'waste_kg', header: 'الهدر (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'sales_kg', header: 'مبيعات (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      accessorKey: 'closing_stock_kg',
      header: 'رصيد الإغلاق',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return (
          <span className={cn('font-medium', v < 10 ? 'text-danger' : v < 20 ? 'text-warning' : 'text-success')}>
            {formatNumber(v)}
          </span>
        )
      },
    },
    { accessorKey: 'weighted_avg_cost', header: 'WAC (ر.س)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      id: 'stock_value',
      header: 'قيمة المخزون',
      cell: ({ row }) => formatNumber(row.original.closing_stock_kg * row.original.weighted_avg_cost),
    },
  ], [])

  const totalStockValue = useMemo(() =>
    inventory?.reduce((s, i) => s + i.closing_stock_kg * i.weighted_avg_cost, 0) ?? 0, [inventory]
  )

  return (
    <div className="space-y-6">
      {/* Date filter */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4">
            <div className="space-y-1">
              <Label>تاريخ المخزون</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-44"
                dir="ltr"
              />
            </div>
            <div className="mt-5">
              <p className="text-sm text-muted-foreground">تاريخ العرض: <span className="font-medium text-foreground">{formatDate(selectedDate)}</span></p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Low stock warning */}
      {lowStock.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-danger mb-1">مخزون منخفض — أقل من 10 كج</p>
            <div className="flex flex-wrap gap-2">
              {lowStock.map(i => (
                <span key={i.id} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded">
                  {i.product?.name_ar} — {formatNumber(i.closing_stock_kg)} كج
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">إجمالي الأصناف</p>
            <p className="text-2xl font-bold">{inventory?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">قيمة المخزون الكلية</p>
            <p className="text-2xl font-bold text-primary">{formatNumber(totalStockValue)} <span className="text-sm font-normal">ر.س</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">أصناف تحت الحد الأدنى</p>
            <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-danger' : 'text-success'}`}>{lowStock.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المخزون اليومي — {formatDate(selectedDate)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <Select value={filterCategory} onValueChange={v => setFilterCategory(v ?? '')}>
              <SelectTrigger className="w-36"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الفئات</SelectItem>
                <SelectItem value="خضار">خضار</SelectItem>
                <SelectItem value="فاكهة">فاكهة</SelectItem>
                <SelectItem value="أعشاب">أعشاب</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant={filterLowStock ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterLowStock(v => !v)}
              className="gap-2"
            >
              ⚠️ مخزون منخفض فقط
            </Button>
            {(filterCategory || filterLowStock) && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterCategory(''); setFilterLowStock(false) }}
                className="text-muted-foreground">مسح</Button>
            )}
          </div>
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable
              data={filteredInventory}
              columns={columns}
              searchPlaceholder="بحث عن صنف..."
              rowClassName={(row) => row.closing_stock_kg < 10 ? 'bg-danger/5' : ''}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
