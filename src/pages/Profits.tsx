import { useState, useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { BarChart } from '@/components/charts/BarChart'
import { useSalesByRange } from '@/hooks/useSales'
import { formatNumber, todayISO } from '@/lib/utils'
import type { Sale } from '@/types'
import { cn } from '@/lib/utils'

interface ProfitRow {
  product_id: string
  name: string
  avgSellPrice: number
  avgWAC: number
  marginPerKg: number
  marginPct: number
  qtyKg: number
  totalRevenue: number
  totalCost: number
  totalProfit: number
}

export default function Profits() {
  const today = todayISO()
  const thirtyAgo = new Date(today)
  thirtyAgo.setDate(thirtyAgo.getDate() - 30)
  const [fromDate, setFromDate] = useState(thirtyAgo.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today)

  const { data: sales, isLoading } = useSalesByRange(fromDate, toDate)

  const profitRows = useMemo<ProfitRow[]>(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; cost: number; sells: Sale[] }>()
    sales?.forEach(s => {
      const name = s.product?.name_ar ?? s.product_id
      const existing = map.get(s.product_id) ?? { name, qty: 0, revenue: 0, cost: 0, sells: [] }
      map.set(s.product_id, {
        ...existing,
        qty: existing.qty + s.qty_kg,
        revenue: existing.revenue + s.total_amount,
        cost: existing.cost + s.total_purchase,
        sells: [...existing.sells, s],
      })
    })

    return Array.from(map.entries()).map(([product_id, r]) => {
      const avgSellPrice = r.qty > 0 ? r.revenue / r.qty : 0
      const avgWAC = r.qty > 0 ? r.cost / r.qty : 0
      const totalProfit = r.revenue - r.cost
      const marginPct = r.revenue > 0 ? (totalProfit / r.revenue) * 100 : 0

      return {
        product_id,
        name: r.name,
        avgSellPrice,
        avgWAC,
        marginPerKg: avgSellPrice - avgWAC,
        marginPct,
        qtyKg: r.qty,
        totalRevenue: r.revenue,
        totalCost: r.cost,
        totalProfit,
      }
    }).sort((a, b) => b.totalProfit - a.totalProfit)
  }, [sales])

  const totalRevenue = useMemo(() => profitRows.reduce((s, r) => s + r.totalRevenue, 0), [profitRows])
  const totalCost = useMemo(() => profitRows.reduce((s, r) => s + r.totalCost, 0), [profitRows])
  const totalProfit = totalRevenue - totalCost

  const barData = useMemo(() =>
    profitRows.slice(0, 15).map(r => ({ name: r.name, 'هامش%': parseFloat(r.marginPct.toFixed(1)) })),
    [profitRows]
  )

  const columns = useMemo<ColumnDef<ProfitRow>[]>(() => [
    { accessorKey: 'name', header: 'الصنف' },
    { accessorKey: 'avgWAC', header: 'WAC', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'avgSellPrice', header: 'سعر البيع', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      accessorKey: 'marginPerKg',
      header: 'هامش/كج',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={cn('font-medium', v >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(v)}</span>
      },
    },
    {
      accessorKey: 'marginPct',
      header: 'هامش%',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={v >= 0 ? 'text-success' : 'text-danger'}>{v.toFixed(1)}%</span>
      },
    },
    { accessorKey: 'qtyKg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'totalRevenue', header: 'الإيراد', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      accessorKey: 'totalProfit',
      header: 'إجمالي الربح',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={cn('font-bold', v >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(v)}</span>
      },
    },
  ], [])

  return (
    <div className="space-y-6">
      {/* Date range filter */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <Label>من</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>إلى</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summaries */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(totalRevenue)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">إجمالي تكلفة البضاعة</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(totalCost)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">إجمالي الربح المباشر</p>
            <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatNumber(totalProfit)} <span className="text-sm font-normal text-muted-foreground">ر.س</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'}% هامش
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">هامش الربح% لكل صنف</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64" /> : (
            <BarChart
              data={barData}
              xAxisKey="name"
              bars={[{ dataKey: 'هامش%', name: 'هامش الربح%', color: '#16a34a' }]}
              layout="vertical"
              height={Math.max(280, barData.length * 30)}
            />
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفاصيل الأرباح المباشرة</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable data={profitRows} columns={columns} searchPlaceholder="بحث عن صنف..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
