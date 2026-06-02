import { useState, useMemo } from 'react'
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, Area } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { useSalesByRange } from '@/hooks/useSales'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { formatNumber, todayISO, monthName } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { TrendingUp, ShoppingCart, RotateCcw, FileText, Package, Users, Truck, BarChart2 } from 'lucide-react'

// ── Stat Card ──────────────────────────────────────────────────────────────────
function StatCard({ title, value, sub, icon: Icon, color = 'primary' }: {
  title: string; value: string; sub?: string; icon: React.ElementType
  color?: 'primary' | 'success' | 'warning' | 'danger'
}) {
  const colors = { primary: 'bg-primary/10 text-primary', success: 'bg-success/10 text-success', warning: 'bg-warning/10 text-warning', danger: 'bg-danger/10 text-danger' }
  return (
    <Card><CardContent className="pt-5">
      <div className="flex items-start justify-between">
        <div className="space-y-1 min-w-0">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={cn('p-2.5 rounded-xl shrink-0', colors[color])}><Icon className="w-5 h-5" /></div>
      </div>
    </CardContent></Card>
  )
}

function getMonthStart() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const today = todayISO()
  const [fromDate, setFromDate] = useState(getMonthStart())
  const [toDate, setToDate] = useState(today)

  // للرسوم البيانية الشهرية — آخر 12 شهر دائماً
  const twelveAgo = useMemo(() => {
    const d = new Date(today + 'T12:00:00')
    d.setMonth(d.getMonth() - 11)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [today])

  const { data: salesRange } = useSalesByRange(fromDate, toDate)
  const { data: purchasesRange } = usePurchasesByRange(fromDate, toDate)
  const { data: sales12 } = useSalesByRange(twelveAgo, today)
  const { data: purchases12 } = usePurchasesByRange(twelveAgo, today)

  // ── ملخص الفترة المختارة ───────────────────────────────────────────────────
  const salesTotal = useMemo(() =>
    (salesRange ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').reduce((s, r) => s + r.total_amount, 0),
    [salesRange])
  const purchasesTotal = useMemo(() =>
    (purchasesRange ?? []).filter(p => p.transaction_type !== 'مرتجع_مشتريات').reduce((s, p) => s + p.total_cost, 0),
    [purchasesRange])
  const grossProfit = salesTotal - purchasesTotal
  const salesReturns = useMemo(() =>
    (salesRange ?? []).filter(s => s.transaction_type === 'مرتجع_مبيعات').reduce((s, r) => s + r.total_amount, 0),
    [salesRange])
  const purchasesReturns = useMemo(() =>
    (purchasesRange ?? []).filter(p => p.transaction_type === 'مرتجع_مشتريات').reduce((s, p) => s + p.total_cost, 0),
    [purchasesRange])
  const salesInvCount = useMemo(() =>
    new Set((salesRange ?? []).filter(s => s.invoice_number && s.transaction_type !== 'مرتجع_مبيعات').map(s => s.invoice_number)).size,
    [salesRange])
  const purchasesInvCount = useMemo(() =>
    new Set((purchasesRange ?? []).filter(p => p.invoice_number && p.transaction_type !== 'مرتجع_مشتريات').map(p => p.invoice_number)).size,
    [purchasesRange])
  const topCustomer = useMemo(() => {
    const map = new Map<string, number>()
    ;(salesRange ?? []).filter(s => s.customer?.name_ar).forEach(s => {
      const n = s.customer!.name_ar
      map.set(n, (map.get(n) ?? 0) + s.total_amount)
    })
    return map.size ? Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0][0] : '—'
  }, [salesRange])
  const topSupplier = useMemo(() => {
    const map = new Map<string, number>()
    ;(purchasesRange ?? []).filter(p => p.supplier?.name_ar).forEach(p => {
      const n = p.supplier!.name_ar
      map.set(n, (map.get(n) ?? 0) + p.total_cost)
    })
    return map.size ? Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0][0] : '—'
  }, [purchasesRange])

  // ── الرسوم البيانية الشهرية (12 شهر) ──────────────────────────────────────
  const monthlyChart = useMemo(() => {
    const salesMap = new Map<string, number>()
    const purchasesMap = new Map<string, number>()
    ;(sales12 ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').forEach(s => {
      const k = s.date.substring(0, 7)
      salesMap.set(k, (salesMap.get(k) ?? 0) + s.total_amount)
    })
    ;(purchases12 ?? []).filter(p => p.transaction_type !== 'مرتجع_مشتريات').forEach(p => {
      const k = p.date.substring(0, 7)
      purchasesMap.set(k, (purchasesMap.get(k) ?? 0) + p.total_cost)
    })
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(today + 'T12:00:00')
      d.setMonth(d.getMonth() - (11 - i))
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const s = Math.round(salesMap.get(k) ?? 0)
      const p = Math.round(purchasesMap.get(k) ?? 0)
      return { month: monthName(d.getMonth() + 1).substring(0, 3), sales: s, purchases: p, profit: s - p }
    })
  }, [sales12, purchases12, today])

  // أفضل 5 عملاء
  const topCustomersChart = useMemo(() => {
    const map = new Map<string, number>()
    ;(sales12 ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات' && s.customer?.name_ar).forEach(s => {
      const n = s.customer!.name_ar
      map.set(n, (map.get(n) ?? 0) + s.total_amount)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }))
  }, [sales12])

  // أفضل 5 موردين
  const topSuppliersChart = useMemo(() => {
    const map = new Map<string, number>()
    ;(purchases12 ?? []).filter(p => p.transaction_type !== 'مرتجع_مشتريات' && p.supplier?.name_ar).forEach(p => {
      const n = p.supplier!.name_ar
      map.set(n, (map.get(n) ?? 0) + p.total_cost)
    })
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }))
  }, [purchases12])

  // أفضل 5 أصناف مبيعات
  const topProductsSales = useMemo(() => {
    const map = new Map<string, { name: string; value: number }>()
    ;(sales12 ?? []).filter(s => s.transaction_type !== 'مرتجع_مبيعات').forEach(s => {
      const name = s.product?.name_ar ?? s.product_id
      const ex = map.get(s.product_id) ?? { name, value: 0 }
      map.set(s.product_id, { ...ex, value: ex.value + s.total_amount })
    })
    return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [sales12])

  const marginPct = salesTotal > 0 ? ((grossProfit / salesTotal) * 100).toFixed(1) : '0'

  const tickFmt = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">الإحصائيات والتحليلات</h1>
          <p className="text-sm text-muted-foreground">مقارنة المبيعات والمشتريات والأرباح</p>
        </div>
        <QuickDateFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="إجمالي المبيعات" value={`${formatNumber(salesTotal)} ر.س`} sub={`${salesInvCount} فاتورة`} icon={TrendingUp} color="success" />
        <StatCard title="إجمالي المشتريات" value={`${formatNumber(purchasesTotal)} ر.س`} sub={`${purchasesInvCount} فاتورة`} icon={ShoppingCart} color="primary" />
        <StatCard title="إجمالي الربح" value={`${formatNumber(grossProfit)} ر.س`} sub={`هامش ${marginPct}%`} icon={BarChart2} color={grossProfit >= 0 ? 'success' : 'danger'} />
        <StatCard title="مرتجعات المبيعات" value={`${formatNumber(salesReturns)} ر.س`} sub={`مرتجعات مشتريات: ${formatNumber(purchasesReturns)}`} icon={RotateCcw} color="warning" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="أفضل عميل" value={topCustomer} sub="الفترة المختارة" icon={Users} color="primary" />
        <StatCard title="أفضل مورد" value={topSupplier} sub="الفترة المختارة" icon={Truck} color="primary" />
        <StatCard title="فواتير المبيعات" value={String(salesInvCount)} sub="الفترة المختارة" icon={FileText} color="success" />
        <StatCard title="فواتير المشتريات" value={String(purchasesInvCount)} sub="الفترة المختارة" icon={FileText} color="primary" />
      </div>

      {/* Monthly comparison chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">مقارنة المبيعات والمشتريات والأرباح (آخر 12 شهر)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={monthlyChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
              <Tooltip formatter={(v: number, name: string) => [
                `${formatNumber(v)} ر.س`,
                name === 'sales' ? 'مبيعات' : name === 'purchases' ? 'مشتريات' : 'ربح'
              ]} />
              <Legend formatter={(v) => v === 'sales' ? 'مبيعات' : v === 'purchases' ? 'مشتريات' : 'ربح'} />
              <Area type="monotone" dataKey="profit" fill="hsl(var(--success)/0.15)" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="profit" />
              <Line type="monotone" dataKey="sales" stroke="hsl(var(--success))" strokeWidth={2} dot={false} name="sales" />
              <Line type="monotone" dataKey="purchases" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="purchases" strokeDasharray="5 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Bottom charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Customers */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">أفضل 5 عملاء (آخر 12 شهر)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topCustomersChart} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'الإجمالي']} />
                <Bar dataKey="value" fill="hsl(var(--success))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Suppliers */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">أفضل 5 موردين (آخر 12 شهر)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topSuppliersChart} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'الإجمالي']} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Products by Sales */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">أفضل 5 أصناف مبيعاً (آخر 12 شهر)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topProductsSales} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={tickFmt} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'الإجمالي']} />
                <Bar dataKey="value" fill="hsl(var(--warning))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Monthly breakdown table */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">جدول الملخص الشهري (آخر 12 شهر)</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {['الشهر', 'المبيعات', 'المشتريات', 'الربح الإجمالي', 'هامش الربح'].map(h => (
                    <th key={h} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...monthlyChart].reverse().map((row, i) => {
                  const margin = row.sales > 0 ? ((row.profit / row.sales) * 100).toFixed(1) : '0'
                  return (
                    <tr key={i} className={cn('border-b border-border/40 hover:bg-muted/20', i % 2 === 1 && 'bg-muted/10')}>
                      <td className="px-3 py-2 font-medium text-xs">{row.month}</td>
                      <td className="px-3 py-2 text-xs text-success font-medium">{formatNumber(row.sales)}</td>
                      <td className="px-3 py-2 text-xs text-primary font-medium">{formatNumber(row.purchases)}</td>
                      <td className={cn('px-3 py-2 text-xs font-semibold', row.profit >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(row.profit)}</td>
                      <td className={cn('px-3 py-2 text-xs', row.profit >= 0 ? 'text-success' : 'text-danger')}>{margin}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
