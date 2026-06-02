import { useMemo, useState } from 'react'
import { TrendingUp, ShoppingCart, Trash2, DollarSign, AlertTriangle, Package, BarChart3, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts'
import { useSalesByRange } from '@/hooks/useSales'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { useWaste } from '@/hooks/useWaste'
import { useInventoryDaily } from '@/hooks/useInventory'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'

const CHART_COLORS = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626', '#8b5cf6', '#ec4899']

function getMonthStart() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function KpiCard({ title, value, unit, sub, icon: Icon, color, trend }: {
  title: string; value: number; unit?: string; sub?: string
  icon: React.ElementType; color: string; trend?: number
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground truncate">
              {formatNumber(value)}
              {unit && <span className="text-sm font-normal text-muted-foreground mr-1">{unit}</span>}
            </p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend >= 0 ? 'text-success' : 'text-danger'}`}>
                {trend >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {Math.abs(trend).toFixed(1)}%
              </div>
            )}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function Dashboard() {
  const today = todayISO()
  const [dateFrom, setDateFrom] = useState(getMonthStart())
  const [dateTo, setDateTo] = useState(today)

  const { data: salesRange, isLoading: salesLoading } = useSalesByRange(dateFrom, dateTo)
  const { data: purchasesRange, isLoading: purchasesLoading } = usePurchasesByRange(dateFrom, dateTo)
  const { data: wasteData } = useWaste()
  const { data: inventory } = useInventoryDaily(today)

  const isLoading = salesLoading || purchasesLoading

  const totalSales = useMemo(() => (salesRange ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').reduce((s, r) => s + r.total_amount, 0), [salesRange])
  const totalPurchases = useMemo(() => (purchasesRange ?? []).filter(p => p.transaction_type !== 'مرتجع_مشتريات').reduce((s, p) => s + p.total_cost, 0), [purchasesRange])
  const totalCOGS = useMemo(() => (salesRange ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').reduce((s, r) => s + r.total_purchase, 0), [salesRange])
  const netProfit = totalSales - totalCOGS
  const marginPct = totalSales > 0 ? (netProfit / totalSales) * 100 : 0

  const salesReturns = useMemo(() => (salesRange ?? []).filter(s => s.transaction_type === 'مرتجع_مبيعات').reduce((s, r) => s + r.total_amount, 0), [salesRange])
  const invoiceCount = useMemo(() => new Set((salesRange ?? []).filter(s => s.invoice_number && s.transaction_type !== 'مرتجع_مبيعات').map(s => s.invoice_number)).size, [salesRange])

  const wasteInRange = useMemo(() => (wasteData ?? []).filter(w => w.date >= dateFrom && w.date <= dateTo), [wasteData, dateFrom, dateTo])
  const totalWasteKg = useMemo(() => wasteInRange.reduce((s, w) => s + w.waste_kg, 0), [wasteInRange])
  const totalPurchasedKg = useMemo(() => (purchasesRange ?? []).reduce((s, p) => s + (p.total_weight ?? 0), 0), [purchasesRange])
  const wastePercent = totalPurchasedKg > 0 ? (totalWasteKg / totalPurchasedKg) * 100 : 0

  const lowStockItems = useMemo(() => (inventory ?? []).filter(i => i.closing_stock_kg > 0 && i.closing_stock_kg < 10), [inventory])

  // Daily chart
  const dailyChart = useMemo(() => {
    const map = new Map<string, { date: string; مبيعات: number; مشتريات: number; ربح: number }>()
    ;(salesRange ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').forEach(s => {
      const ex = map.get(s.date) ?? { date: s.date, مبيعات: 0, مشتريات: 0, ربح: 0 }
      ex.مبيعات += s.total_amount; ex.ربح += s.total_amount - s.total_purchase
      map.set(s.date, ex)
    })
    ;(purchasesRange ?? []).filter(p => p.transaction_type !== 'مرتجع_مشتريات').forEach(p => {
      const ex = map.get(p.date) ?? { date: p.date, مبيعات: 0, مشتريات: 0, ربح: 0 }
      ex.مشتريات += p.total_cost
      map.set(p.date, ex)
    })
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({ ...r, مبيعات: Math.round(r.مبيعات), مشتريات: Math.round(r.مشتريات), ربح: Math.round(r.ربح) }))
  }, [salesRange, purchasesRange])

  // Top products chart
  const topProductsChart = useMemo(() => {
    const map = new Map<string, { name: string; value: number; profit: number }>()
    ;(salesRange ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').forEach(s => {
      const name = s.product?.name_ar ?? s.product_id
      const ex = map.get(s.product_id) ?? { name, value: 0, profit: 0 }
      ex.value += s.total_amount; ex.profit += s.total_amount - s.total_purchase
      map.set(s.product_id, ex)
    })
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 8)
      .map(r => ({ ...r, value: Math.round(r.value), profit: Math.round(r.profit) }))
  }, [salesRange])

  // Customer pie
  const customerPie = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>()
    ;(salesRange ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات' && s.customer?.name_ar).forEach(s => {
      const name = s.customer!.name_ar
      const ex = map.get(s.customer_id) ?? { name, value: 0 }
      ex.value += s.total_amount
      map.set(s.customer_id, ex)
    })
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 6)
      .map(r => ({ ...r, value: Math.round(r.value) }))
  }, [salesRange])

  const tickFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)

  return (
    <div className="space-y-5">
      {/* Header + filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-muted-foreground">{formatDate(dateFrom)} — {formatDate(dateTo)}</p>
        </div>
        <QuickDateFilter from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { to: '/purchases', label: 'فاتورة مشتريات', icon: ShoppingCart, color: 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/15' },
          { to: '/sales', label: 'فاتورة مبيعات', icon: TrendingUp, color: 'bg-success/10 text-success border-success/20 hover:bg-success/15' },
          { to: '/waste', label: 'تسجيل هدر', icon: Trash2, color: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/15' },
          { to: '/inventory', label: 'جرد المخزون', icon: Package, color: 'bg-muted/50 text-foreground border-border hover:bg-muted' },
        ].map(a => (
          <Link key={a.to} to={a.to} className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${a.color}`}>
            <a.icon className="w-4 h-4 shrink-0" />{a.label}
          </Link>
        ))}
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="إجمالي المبيعات" value={totalSales} unit="ر.س" sub={`${invoiceCount} فاتورة`} icon={TrendingUp} color="bg-success" />
            <KpiCard title="إجمالي المشتريات" value={totalPurchases} unit="ر.س" icon={ShoppingCart} color="bg-blue-500" />
            <KpiCard title="صافي الربح" value={netProfit} unit="ر.س" sub={`هامش ${marginPct.toFixed(1)}%`} icon={DollarSign} color={netProfit >= 0 ? 'bg-success' : 'bg-danger'} trend={marginPct} />
            <KpiCard title="مرتجعات المبيعات" value={salesReturns} unit="ر.س" icon={BarChart3} color="bg-warning" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="هدر الكميات" value={totalWasteKg} unit="كج" sub={`${wastePercent.toFixed(1)}% من المشتريات`} icon={Trash2} color={wastePercent > 5 ? 'bg-danger' : 'bg-warning'} />
            <KpiCard title="أصناف منخفضة" value={lowStockItems.length} sub="أقل من 10 كج" icon={AlertTriangle} color={lowStockItems.length > 0 ? 'bg-danger' : 'bg-success'} />
            <KpiCard title="فواتير المبيعات" value={invoiceCount} icon={Package} color="bg-purple-500" />
            <KpiCard title="تكلفة البضاعة" value={totalCOGS} unit="ر.س" icon={DollarSign} color="bg-slate-500" />
          </div>
        </>
      )}

      {/* Low stock alert */}
      {lowStockItems.length > 0 && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-danger mb-2">أصناف تحتاج تجديد فوري</p>
            <div className="flex flex-wrap gap-2">
              {lowStockItems.map(i => (
                <span key={i.id} className="text-xs bg-danger/20 text-danger px-2.5 py-1 rounded-lg font-medium">
                  {i.product?.name_ar} — {formatNumber(i.closing_stock_kg)} كج
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Daily line chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">المبيعات والمشتريات والأرباح اليومية</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : dailyChart.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">لا توجد بيانات في هذه الفترة</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.substring(5)} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
                  <Tooltip formatter={(v: number, name: string) => [`${formatNumber(v)} ر.س`, name]} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="مبيعات" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="مشتريات" stroke="#2563eb" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="ربح" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="2 2" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Customer pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">توزيع المبيعات على العملاء</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-56" /> : customerPie.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">لا توجد بيانات</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={customerPie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                      {customerPie.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'المبيعات']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-1">
                  {customerPie.slice(0, 5).map((c, i) => (
                    <div key={c.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                        <span className="text-muted-foreground truncate">{c.name}</span>
                      </div>
                      <span className="font-medium shrink-0 mr-2">{formatNumber(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top products bar chart */}
      {topProductsChart.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">أعلى الأصناف مبيعاً (ر.س)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProductsChart} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} tickFormatter={v => String(v).length > 8 ? String(v).substring(0, 8) + '…' : v} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
                <Tooltip formatter={(v: number, name: string) => [`${formatNumber(v)} ر.س`, name === 'value' ? 'الإيراد' : 'الربح']} />
                <Legend formatter={(v) => v === 'value' ? 'الإيراد' : 'الربح'} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} name="value" maxBarSize={40} />
                <Bar dataKey="profit" fill="#f59e0b" radius={[4, 4, 0, 0]} name="profit" maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent quick summary table */}
      {dailyChart.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">ملخص يومي</CardTitle>
              <Link to="/analytics" className="text-xs text-primary hover:underline">عرض التفاصيل ←</Link>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-60 overflow-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/40">
                  <tr className="border-b border-border">
                    {['التاريخ', 'المبيعات', 'المشتريات', 'الربح'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...dailyChart].reverse().map((row, i) => (
                    <tr key={row.date} className={`border-b border-border/40 hover:bg-muted/20 ${i % 2 === 1 ? 'bg-muted/10' : ''}`}>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(row.date)}</td>
                      <td className="px-3 py-2 text-xs font-medium text-success">{formatNumber(row.مبيعات)}</td>
                      <td className="px-3 py-2 text-xs font-medium text-primary">{formatNumber(row.مشتريات)}</td>
                      <td className={`px-3 py-2 text-xs font-semibold ${row.ربح >= 0 ? 'text-success' : 'text-danger'}`}>{formatNumber(row.ربح)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
