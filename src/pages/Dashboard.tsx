import { useMemo, useState } from 'react'
import { TrendingUp, ShoppingCart, Trash2, DollarSign, Calendar, Percent, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { LineChart } from '@/components/charts/LineChart'
import { BarChart } from '@/components/charts/BarChart'
import { PieChart } from '@/components/charts/PieChart'
import { Skeleton } from '@/components/ui/skeleton'
import { useSalesByRange } from '@/hooks/useSales'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { useWaste } from '@/hooks/useWaste'
import { useInventoryDaily } from '@/hooks/useInventory'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'

function KpiCard({
  title, value, unit, icon: Icon, color,
}: {
  title: string
  value: number
  unit?: string
  icon: React.ElementType
  color: string
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {formatNumber(value)}
              {unit && <span className="text-sm font-normal text-muted-foreground mr-1">{unit}</span>}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const today = todayISO()
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)

  const isToday = dateFrom === today && dateTo === today

  function resetToToday() {
    setDateFrom(today)
    setDateTo(today)
  }

  const { data: salesRange, isLoading: salesLoading } = useSalesByRange(dateFrom, dateTo)
  const { data: purchasesRange, isLoading: purchasesLoading } = usePurchasesByRange(dateFrom, dateTo)
  const { data: wasteRange } = useWaste(
    dateFrom === dateTo
      ? { date: dateFrom }
      : { month: new Date(dateFrom).getMonth() + 1, year: new Date(dateFrom).getFullYear() }
  )
  const { data: inventory } = useInventoryDaily(dateTo)

  const isLoading = salesLoading || purchasesLoading

  // KPIs for selected range
  const totalSales = useMemo(() =>
    salesRange?.reduce((sum, s) => sum + s.total_amount, 0) ?? 0, [salesRange]
  )
  const totalPurchases = useMemo(() =>
    purchasesRange?.reduce((sum, p) => sum + p.total_cost, 0) ?? 0, [purchasesRange]
  )
  const totalWasteKg = useMemo(() =>
    wasteRange?.reduce((sum, w) => sum + w.waste_kg, 0) ?? 0, [wasteRange]
  )
  const totalPurchasedKg = useMemo(() =>
    purchasesRange?.reduce((sum, p) => sum + p.total_weight, 0) ?? 0, [purchasesRange]
  )
  const wastePercent = totalPurchasedKg > 0 ? (totalWasteKg / totalPurchasedKg) * 100 : 0
  const totalCOGS = useMemo(() =>
    salesRange?.reduce((sum, s) => sum + s.total_purchase, 0) ?? 0, [salesRange]
  )
  const netProfit = totalSales - totalCOGS

  // Line chart
  const lineData = useMemo(() => {
    const map = new Map<string, { date: string; مبيعات: number; مشتريات: number }>()
    salesRange?.forEach(s => {
      const existing = map.get(s.date) ?? { date: s.date, مبيعات: 0, مشتريات: 0 }
      map.set(s.date, { ...existing, مبيعات: existing.مبيعات + s.total_amount })
    })
    purchasesRange?.forEach(p => {
      const existing = map.get(p.date) ?? { date: p.date, مبيعات: 0, مشتريات: 0 }
      map.set(p.date, { ...existing, مشتريات: existing.مشتريات + p.total_cost })
    })
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [salesRange, purchasesRange])

  // Top products
  const topProductsData = useMemo(() => {
    const map = new Map<string, { name: string; كمية: number }>()
    salesRange?.forEach(s => {
      const name = s.product?.name_ar ?? s.product_id
      const existing = map.get(s.product_id) ?? { name, كمية: 0 }
      map.set(s.product_id, { ...existing, كمية: existing.كمية + s.qty_kg })
    })
    return Array.from(map.values()).sort((a, b) => b.كمية - a.كمية).slice(0, 10)
  }, [salesRange])

  // Customer pie
  const customerPieData = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>()
    salesRange?.forEach(s => {
      const name = s.customer?.name_ar ?? s.customer_id
      const existing = map.get(s.customer_id) ?? { name, value: 0 }
      map.set(s.customer_id, { ...existing, value: existing.value + s.total_amount })
    })
    return Array.from(map.values()).sort((a, b) => b.value - a.value)
  }, [salesRange])

  // Top profit
  const topProfit = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number; cost: number }>()
    salesRange?.forEach(s => {
      const name = s.product?.name_ar ?? s.product_id
      const existing = map.get(s.product_id) ?? { name, revenue: 0, cost: 0 }
      map.set(s.product_id, {
        ...existing,
        revenue: existing.revenue + s.total_amount,
        cost: existing.cost + s.total_purchase,
      })
    })
    return Array.from(map.values())
      .map(r => ({ ...r, profit: r.revenue - r.cost, margin: r.revenue > 0 ? ((r.revenue - r.cost) / r.revenue) * 100 : 0 }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10)
  }, [salesRange])

  // Low stock
  const lowStockItems = useMemo(() => inventory?.filter(i => i.closing_stock_kg < 10) ?? [], [inventory])

  const rangeLabel = dateFrom === dateTo
    ? formatDate(dateFrom)
    : `${formatDate(dateFrom)} — ${formatDate(dateTo)}`

  return (
    <div className="space-y-6">

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-4 p-4 bg-card rounded-lg border border-border shadow-sm">
        <Calendar className="w-4 h-4 text-muted-foreground self-center shrink-0" />
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">من</Label>
          <Input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={e => setDateFrom(e.target.value || today)}
            className="w-40"
            dir="ltr"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">إلى</Label>
          <Input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={e => setDateTo(e.target.value || today)}
            className="w-40"
            dir="ltr"
          />
        </div>
        {!isToday && (
          <Button variant="outline" size="sm" onClick={resetToToday}>
            اليوم
          </Button>
        )}
        <span className="text-sm text-muted-foreground self-center">
          {isToday
            ? <span className="text-success font-medium">اليوم</span>
            : rangeLabel
          }
        </span>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/purchases', label: 'إدخال مشتريات', color: 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20' },
          { to: '/sales', label: 'إدخال مبيعات', color: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' },
          { to: '/waste', label: 'تسجيل هدر', color: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20' },
          { to: '/inventory', label: 'جرد المخزون', color: 'bg-muted/50 text-foreground border-border hover:bg-muted' },
        ].map(a => (
          <Link key={a.to} to={a.to} className={`flex items-center justify-center px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${a.color}`}>
            {a.label}
          </Link>
        ))}
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard title="إجمالي المبيعات" value={totalSales} unit="ر.س" icon={TrendingUp} color="bg-primary" />
          <KpiCard title="إجمالي المشتريات" value={totalPurchases} unit="ر.س" icon={ShoppingCart} color="bg-blue-500" />
          <KpiCard title="صافي الربح" value={netProfit} unit="ر.س" icon={DollarSign} color={netProfit >= 0 ? 'bg-success' : 'bg-danger'} />
          <KpiCard title="هامش الربح" value={totalSales > 0 ? (netProfit / totalSales) * 100 : 0} unit="%" icon={Percent} color={netProfit >= 0 ? 'bg-success' : 'bg-danger'} />
          <KpiCard title="نسبة الهدر" value={wastePercent} unit="%" icon={Trash2} color="bg-warning" />
          <KpiCard title="أصناف منخفضة" value={lowStockItems.length} icon={Package} color={lowStockItems.length > 0 ? 'bg-danger' : 'bg-success'} />
        </div>
      )}

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-lg p-4">
          <p className="text-sm font-medium text-danger mb-2">⚠️ مخزون منخفض — {formatDate(dateTo)}</p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map(i => (
              <span key={i.id} className="text-xs bg-danger/20 text-danger px-2 py-1 rounded">
                {i.product?.name_ar} — {formatNumber(i.closing_stock_kg)} كج
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">المبيعات والمشتريات</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64" /> : (
              <LineChart
                data={lineData}
                xAxisKey="date"
                lines={[
                  { dataKey: 'مبيعات', name: 'مبيعات', color: '#16a34a' },
                  { dataKey: 'مشتريات', name: 'مشتريات', color: '#3b82f6' },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">توزيع المبيعات على العملاء</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-64" /> : <PieChart data={customerPieData} />}
          </CardContent>
        </Card>
      </div>

      {/* Top products */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أكثر 10 أصناف مبيعاً (كج)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64" /> : (
            <BarChart
              data={topProductsData}
              xAxisKey="name"
              bars={[{ dataKey: 'كمية', name: 'الكمية (كج)', color: '#16a34a' }]}
              height={280}
            />
          )}
        </CardContent>
      </Card>

      {/* Top profit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أعلى الأصناف ربحاً — {rangeLabel}</CardTitle>
        </CardHeader>
        <CardContent>
          {topProfit.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">لا توجد مبيعات في هذه الفترة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs">
                    <th className="text-right pb-2 font-medium">الصنف</th>
                    <th className="text-right pb-2 font-medium">الإيراد</th>
                    <th className="text-right pb-2 font-medium">التكلفة</th>
                    <th className="text-right pb-2 font-medium">الربح</th>
                    <th className="text-right pb-2 font-medium">الهامش%</th>
                  </tr>
                </thead>
                <tbody>
                  {topProfit.map((r, i) => (
                    <tr key={i} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-muted/20' : ''}`}>
                      <td className="py-2 font-medium">{r.name}</td>
                      <td className="py-2">{formatNumber(r.revenue)}</td>
                      <td className="py-2">{formatNumber(r.cost)}</td>
                      <td className={`py-2 font-medium ${r.profit >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatNumber(r.profit)}
                      </td>
                      <td className={`py-2 ${r.margin >= 0 ? 'text-success' : 'text-danger'}`}>
                        {r.margin.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
