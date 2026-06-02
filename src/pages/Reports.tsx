import { useState, useMemo, type ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileDown, Search, Package, Users, Target, TrendingUp } from 'lucide-react'
import { useCostAllocation } from '@/hooks/useCostAllocation'
import { useSalesByRange } from '@/hooks/useSales'
import { usePurchasesByRange, useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useWasteByRange } from '@/hooks/useWaste'
import { useCustomers } from '@/hooks/useCustomers'
import { formatNumber, todayISO, monthName } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Helpers ────────────────────────────────────────────────────────────────
const DISABLED = '9999-01-01'

function firstOfMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}-01`
}
function lastOfMonth(year: number, month: number) {
  return new Date(year, month, 0).toISOString().split('T')[0]
}
function currentYear() { return new Date().getFullYear() }
function currentMonth() { return new Date().getMonth() + 1 }
function currentFirstOfMonth() { return firstOfMonth(currentYear(), currentMonth()) }

// ── Excel export ────────────────────────────────────────────────────────────
async function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const ws = wb.addWorksheet('تقرير')
  ws.addRow(headers)
  rows.forEach(r => ws.addRow(r))
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

// ── Applied filter type ─────────────────────────────────────────────────────
interface AppliedFilter {
  mode: 'month' | 'range'
  year: number
  month: number
  from: string
  to: string
  label: string
}

type ReportSection = 'products' | 'customers' | 'breakeven' | 'cm'

export default function Reports() {
  // ── Filter inputs ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<'month' | 'range'>('month')
  const [year, setYear] = useState(currentYear())
  const [month, setMonth] = useState(currentMonth())
  const [fromDate, setFromDate] = useState(currentFirstOfMonth())
  const [toDate, setToDate] = useState(todayISO())
  const [applied, setApplied] = useState<AppliedFilter | null>(null)
  const [activeRep, setActiveRep] = useState<ReportSection>('products')

  const years = [currentYear() - 1, currentYear(), currentYear() + 1]
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  function handleApply() {
    if (mode === 'month') {
      setApplied({
        mode: 'month', year, month,
        from: firstOfMonth(year, month),
        to: lastOfMonth(year, month),
        label: `${monthName(month)} ${year}`,
      })
    } else {
      if (!fromDate || !toDate) return
      setApplied({
        mode: 'range', year: 0, month: 0,
        from: fromDate, to: toDate,
        label: `${fromDate} → ${toDate}`,
      })
    }
  }

  // ── Query dates ───────────────────────────────────────────────────────────
  const qFrom = applied?.from ?? DISABLED
  const qTo = applied?.to ?? DISABLED
  const allocYear = applied?.mode === 'month' ? applied.year : 9999
  const allocMonth = applied?.mode === 'month' ? applied.month : 1

  // ── Data fetching ─────────────────────────────────────────────────────────
  const { data: sales, isLoading: salesLoading } = useSalesByRange(qFrom, qTo)
  const { data: purchases } = usePurchasesByRange(qFrom, qTo)
  const { data: wasteData } = useWasteByRange(qFrom, qTo)
  const { data: latestCosts } = useLatestPurchaseCosts(qTo === DISABLED ? todayISO() : qTo)
  const { data: allocations, isLoading: allocLoading } = useCostAllocation(allocYear, allocMonth)
  const { data: customers } = useCustomers()

  const isLoading = salesLoading

  // ── Summary KPIs ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const revenue = (sales ?? []).reduce((s, r) => s + r.total_amount, 0)
    const cost = (sales ?? []).reduce((s, r) => {
      const c = r.total_purchase > 0 ? r.total_purchase : r.qty_kg * (latestCosts?.[r.product_id] ?? 0)
      return s + c
    }, 0)
    const wasteCost = (wasteData ?? []).reduce((s, w) => s + w.waste_kg * (latestCosts?.[w.product_id] ?? 0), 0)
    const qtyKg = (sales ?? []).reduce((s, r) => s + r.qty_kg, 0)
    return { revenue, cost, wasteCost, grossProfit: revenue - cost, qtyKg }
  }, [sales, latestCosts, wasteData])

  // ── Product profitability ─────────────────────────────────────────────────
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; cost: number; purchasesKg: number; purchaseCost: number }>()
    sales?.forEach(s => {
      const ex = map.get(s.product_id) ?? { name: s.product?.name_ar ?? s.product_id, qty: 0, revenue: 0, cost: 0, purchasesKg: 0, purchaseCost: 0 }
      const lineCost = s.total_purchase > 0 ? s.total_purchase : s.qty_kg * (latestCosts?.[s.product_id] ?? 0)
      map.set(s.product_id, { ...ex, qty: ex.qty + s.qty_kg, revenue: ex.revenue + s.total_amount, cost: ex.cost + lineCost })
    })
    purchases?.forEach(p => {
      const ex = map.get(p.product_id)
      if (ex) {
        ex.purchasesKg += p.total_weight ?? p.cartons_qty * p.weight_per_carton
        ex.purchaseCost += p.total_cost ?? p.cartons_qty * p.price_per_carton
      }
    })
    return Array.from(map.entries()).map(([pid, r]) => {
      const avgSell = r.qty > 0 ? r.revenue / r.qty : 0
      const avgCost = r.qty > 0 ? r.cost / r.qty : (latestCosts?.[pid] ?? 0)
      const profit = r.revenue - r.cost
      const marginPct = r.revenue > 0 ? (profit / r.revenue) * 100 : 0
      return { product_id: pid, name: r.name, qtyKg: r.qty, revenue: r.revenue, cost: r.cost, profit, marginPct, avgSell, avgCost }
    }).sort((a, b) => b.profit - a.profit)
  }, [sales, purchases, latestCosts])

  // ── Customer profitability ─────────────────────────────────────────────────
  const customerRows = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number; qty: number }>()
    sales?.forEach(s => {
      const ex = map.get(s.customer_id) ?? { revenue: 0, cost: 0, qty: 0 }
      const c = s.total_purchase > 0 ? s.total_purchase : s.qty_kg * (latestCosts?.[s.product_id] ?? 0)
      map.set(s.customer_id, { revenue: ex.revenue + s.total_amount, cost: ex.cost + c, qty: ex.qty + s.qty_kg })
    })
    return (customers ?? []).map(c => {
      const st = map.get(c.id) ?? { revenue: 0, cost: 0, qty: 0 }
      const profit = st.revenue - st.cost
      return { name: c.name_ar, type: c.type, revenue: st.revenue, cost: st.cost, profit, qty: st.qty, marginPct: st.revenue > 0 ? (profit / st.revenue) * 100 : 0 }
    }).filter(r => r.revenue > 0).sort((a, b) => b.profit - a.profit)
  }, [sales, customers, latestCosts])

  // ── Break-even rows ────────────────────────────────────────────────────────
  const avgSellByProduct = useMemo(() => {
    const m = new Map<string, { total: number; qty: number }>()
    sales?.forEach(s => { const ex = m.get(s.product_id) ?? { total: 0, qty: 0 }; m.set(s.product_id, { total: ex.total + s.total_amount, qty: ex.qty + s.qty_kg }) })
    return new Map(Array.from(m.entries()).map(([k, v]) => [k, v.qty > 0 ? v.total / v.qty : 0]))
  }, [sales])

  const breakevenRows = useMemo(() =>
    (allocations ?? []).map(a => ({
      product: a.product?.name_ar ?? a.product_id,
      fullCostPerKg: a.full_cost_per_kg,
      avgSell: avgSellByProduct.get(a.product_id) ?? 0,
      diff: (avgSellByProduct.get(a.product_id) ?? 0) - a.full_cost_per_kg,
      cogs: a.direct_cost, waste: a.waste_cost, overhead: a.allocated_overhead,
    })).sort((a, b) => a.diff - b.diff),
    [allocations, avgSellByProduct]
  )

  const cmRows = useMemo(() =>
    (allocations ?? []).map(a => ({
      product: a.product?.name_ar ?? a.product_id,
      cm: a.contribution_margin, cmPct: a.contribution_margin_pct,
      revenue: a.revenue, directCost: a.direct_cost,
    })).sort((a, b) => b.cm - a.cm),
    [allocations]
  )

  // ── Label for export filename ──────────────────────────────────────────────
  const periodTag = applied?.mode === 'month' ? `${applied.year}-${applied.month}` : `${applied?.from}_${applied?.to}`

  return (
    <div className="space-y-4">
      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-3 flex-wrap">
            {/* Mode toggle */}
            <div className="space-y-1">
              <Label>نوع الفترة</Label>
              <div className="flex rounded-lg border border-border overflow-hidden">
                {(['month', 'range'] as const).map(m => (
                  <button key={m} type="button"
                    onClick={() => setMode(m)}
                    className={cn('px-3 py-1.5 text-sm transition-colors',
                      mode === m ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted/60'
                    )}>
                    {m === 'month' ? 'شهر / سنة' : 'نطاق تاريخي'}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'month' ? (
              <>
                <div className="space-y-1">
                  <Label>السنة</Label>
                  <Select value={String(year)} onValueChange={v => setYear(parseInt(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>الشهر</Label>
                  <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>{months.map(m => <SelectItem key={m} value={String(m)}>{monthName(m)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>من</Label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" dir="ltr" />
                </div>
                <div className="space-y-1">
                  <Label>إلى</Label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" dir="ltr" />
                </div>
              </>
            )}

            <Button onClick={handleApply} className="gap-2">
              <Search className="w-4 h-4" /> عرض
            </Button>

            {applied && (
              <span className="text-xs text-muted-foreground pb-1">
                يعرض: <strong>{applied.label}</strong>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {!applied && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          حدد الفترة واضغط <strong>عرض</strong> لتحميل التقارير
        </div>
      )}

      {applied && (
        <>
          {/* ── KPI Summary ──────────────────────────────────────────────── */}
          {isLoading ? (
            <div className="grid grid-cols-4 gap-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
                <p className="text-xl font-bold">{formatNumber(kpis.revenue)}</p>
                <p className="text-xs text-muted-foreground">ر.س</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">تكلفة البضاعة</p>
                <p className="text-xl font-bold">{formatNumber(kpis.cost)}</p>
                <p className="text-xs text-muted-foreground">ر.س</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">الربح المباشر</p>
                <p className={cn('text-xl font-bold', kpis.grossProfit >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(kpis.grossProfit)}</p>
                <p className="text-xs text-muted-foreground">{kpis.revenue > 0 ? ((kpis.grossProfit / kpis.revenue) * 100).toFixed(1) : 0}% هامش</p>
              </CardContent></Card>
              <Card><CardContent className="pt-4">
                <p className="text-xs text-muted-foreground">الكمية المباعة</p>
                <p className="text-xl font-bold">{formatNumber(kpis.qtyKg)}</p>
                <p className="text-xs text-muted-foreground">كج</p>
              </CardContent></Card>
            </div>
          )}

          {/* ── Report Sections ───────────────────────────────────────────── */}
          {(()=>{
            const repSections: { id: ReportSection; label: string; icon: React.ElementType }[] = [
              { id: 'products', label: 'ربحية الأصناف', icon: Package },
              { id: 'customers', label: 'ربحية العملاء', icon: Users },
              { id: 'breakeven', label: 'نقطة التعادل', icon: Target },
              { id: 'cm', label: 'هامش المساهمة%', icon: TrendingUp },
            ]
            return null
          })()}
          <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '480px' }}>
            <nav className="w-52 shrink-0 border-l border-border bg-muted/30 flex flex-col p-2 space-y-0.5">
              <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">نوع التقرير</p>
              {([
                { id: 'products' as ReportSection, label: 'ربحية الأصناف', icon: Package },
                { id: 'customers' as ReportSection, label: 'ربحية العملاء', icon: Users },
                { id: 'breakeven' as ReportSection, label: 'نقطة التعادل', icon: Target },
                { id: 'cm' as ReportSection, label: 'هامش المساهمة%', icon: TrendingUp },
              ]).map(s => (
                <button key={s.id} onClick={() => setActiveRep(s.id)}
                  className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                    activeRep === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <s.icon className="w-4 h-4 shrink-0" /><span className="flex-1">{s.label}</span>
                </button>
              ))}
            </nav>
            <div className="flex-1 min-w-0 overflow-auto p-4 space-y-4">
            {activeRep === 'products' && <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between items-center">
                    <span>ربحية الأصناف — {applied.label}</span>
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => exportToExcel(`products-${periodTag}.xlsx`,
                        ['الصنف','الكمية(كج)','الإيراد','التكلفة','الربح','هامش%','سعر البيع/كج','التكلفة/كج'],
                        productRows.map(r => [r.name, r.qtyKg, r.revenue, r.cost, r.profit, r.marginPct.toFixed(1)+'%', r.avgSell, r.avgCost])
                      )}>
                      <FileDown className="w-4 h-4" /> Excel
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-48" /> : productRows.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10 text-sm">لا توجد مبيعات في هذه الفترة</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {['الصنف','الكمية(كج)','الإيراد','التكلفة','الربح','هامش%','سعر البيع/كج','تكلفة/كج'].map(h => (
                              <th key={h} className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {productRows.map((r, i) => (
                            <tr key={i} className={cn('border-b border-border/50', r.profit < 0 ? 'bg-danger/5' : '')}>
                              <td className="px-3 py-2 font-medium">{r.name}</td>
                              <td className="px-3 py-2">{formatNumber(r.qtyKg)}</td>
                              <td className="px-3 py-2">{formatNumber(r.revenue)}</td>
                              <td className="px-3 py-2">{formatNumber(r.cost)}</td>
                              <td className={cn('px-3 py-2 font-medium', r.profit >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(r.profit)}</td>
                              <td className={cn('px-3 py-2', r.marginPct >= 20 ? 'text-success' : r.marginPct >= 10 ? 'text-warning' : 'text-danger')}>{r.marginPct.toFixed(1)}%</td>
                              <td className="px-3 py-2">{formatNumber(r.avgSell)}</td>
                              <td className="px-3 py-2 text-muted-foreground">{formatNumber(r.avgCost)}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-medium border-t-2 border-border">
                            <td className="px-3 py-2">الإجمالي</td>
                            <td className="px-3 py-2">{formatNumber(productRows.reduce((s, r) => s + r.qtyKg, 0))}</td>
                            <td className="px-3 py-2">{formatNumber(productRows.reduce((s, r) => s + r.revenue, 0))}</td>
                            <td className="px-3 py-2">{formatNumber(productRows.reduce((s, r) => s + r.cost, 0))}</td>
                            <td className={cn('px-3 py-2', kpis.grossProfit >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(productRows.reduce((s, r) => s + r.profit, 0))}</td>
                            <td className="px-3 py-2"></td>
                            <td colSpan={2}></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>}
            {activeRep === 'customers' && <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between items-center">
                    <span>ربحية العملاء — {applied.label}</span>
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => exportToExcel(`customers-${periodTag}.xlsx`,
                        ['العميل','النوع','الكمية(كج)','الإيراد','التكلفة','الربح','هامش%'],
                        customerRows.map(r => [r.name, r.type, r.qty, r.revenue, r.cost, r.profit, r.marginPct.toFixed(1)+'%'])
                      )}>
                      <FileDown className="w-4 h-4" /> Excel
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isLoading ? <Skeleton className="h-48" /> : customerRows.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10 text-sm">لا توجد مبيعات في هذه الفترة</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {['العميل','النوع','الكمية(كج)','الإيراد','التكلفة','الربح','هامش%'].map(h => (
                              <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {customerRows.map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-3 py-2 font-medium">{r.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
                              <td className="px-3 py-2">{formatNumber(r.qty)}</td>
                              <td className="px-3 py-2">{formatNumber(r.revenue)}</td>
                              <td className="px-3 py-2">{formatNumber(r.cost)}</td>
                              <td className={cn('px-3 py-2 font-medium', r.profit >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(r.profit)}</td>
                              <td className={cn('px-3 py-2', r.marginPct >= 20 ? 'text-success' : r.marginPct >= 10 ? 'text-warning' : 'text-danger')}>{r.marginPct.toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>}
            {activeRep === 'breakeven' && <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between items-center">
                    <span>نقطة التعادل — السعر الأدنى للبيع بلا خسارة</span>
                    {breakevenRows.length > 0 && (
                      <Button variant="outline" size="sm" className="gap-2"
                        onClick={() => exportToExcel(`breakeven-${periodTag}.xlsx`,
                          ['الصنف','التكلفة الكاملة/كج','متوسط سعر البيع','الفرق','الحالة'],
                          breakevenRows.map(r => [r.product, r.fullCostPerKg, r.avgSell, r.diff, r.diff < 0 ? 'خسارة' : r.diff < 2 ? 'هامش ضيق' : 'ربح'])
                        )}>
                        <FileDown className="w-4 h-4" /> Excel
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {applied.mode === 'range' ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <p>هذا التقرير يعتمد على بيانات توزيع التكاليف الشهرية</p>
                      <p className="mt-1">اختر <strong>شهر / سنة</strong> بعد احتساب التوزيع من صفحة محاسبة التكاليف</p>
                    </div>
                  ) : allocLoading ? <Skeleton className="h-48" /> : breakevenRows.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <p>لا توجد بيانات توزيع للشهر المحدد</p>
                      <p className="mt-1">يرجى احتساب التوزيع أولاً من صفحة محاسبة التكاليف</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {['الصنف','تكلفة البضاعة','تكلفة الهدر','المصاريف','التكلفة الكاملة/كج','متوسط سعر البيع','الفرق','الحالة'].map(h => (
                              <th key={h} className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {breakevenRows.map((r, i) => (
                            <tr key={i} className={cn('border-b border-border/50', r.diff < 0 ? 'bg-danger/5' : r.diff < 2 ? 'bg-warning/5' : '')}>
                              <td className="px-3 py-2 font-medium">{r.product}</td>
                              <td className="px-3 py-2">{formatNumber(r.cogs)}</td>
                              <td className="px-3 py-2 text-warning">{formatNumber(r.waste)}</td>
                              <td className="px-3 py-2 text-blue-600">{formatNumber(r.overhead)}</td>
                              <td className="px-3 py-2 font-medium">{formatNumber(r.fullCostPerKg)}</td>
                              <td className="px-3 py-2">{formatNumber(r.avgSell)}</td>
                              <td className={cn('px-3 py-2 font-bold', r.diff >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(r.diff)}</td>
                              <td className="px-3 py-2">{r.diff < 0 ? '🔴 خسارة' : r.diff < 2 ? '🟡 ضيق' : '🟢 ربح'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>}
            {activeRep === 'cm' && <>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex justify-between items-center">
                    <span>هامش المساهمة — مساهمة الصنف في تغطية التكاليف الثابتة</span>
                    {cmRows.length > 0 && (
                      <Button variant="outline" size="sm" className="gap-2"
                        onClick={() => exportToExcel(`cm-${periodTag}.xlsx`,
                          ['الصنف','هامش المساهمة(ر.س)','هامش%','الإيراد','تكلفة البضاعة'],
                          cmRows.map(r => [r.product, r.cm, r.cmPct.toFixed(1)+'%', r.revenue, r.directCost])
                        )}>
                        <FileDown className="w-4 h-4" /> Excel
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {applied.mode === 'range' ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <p>هذا التقرير يعتمد على بيانات توزيع التكاليف الشهرية</p>
                      <p className="mt-1">اختر <strong>شهر / سنة</strong> بعد احتساب التوزيع</p>
                    </div>
                  ) : allocLoading ? <Skeleton className="h-48" /> : cmRows.length === 0 ? (
                    <div className="text-center py-10 text-sm text-muted-foreground">
                      <p>لا توجد بيانات توزيع للشهر المحدد</p>
                      <p className="mt-1">يرجى احتساب التوزيع من صفحة محاسبة التكاليف</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {['الصنف','هامش المساهمة(ر.س)','هامش%','الإيراد','تكلفة البضاعة'].map(h => (
                              <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {cmRows.map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-3 py-2 font-medium">{r.product}</td>
                              <td className={cn('px-3 py-2 font-medium', r.cm >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(r.cm)}</td>
                              <td className={cn('px-3 py-2 font-bold', r.cmPct >= 20 ? 'text-success' : r.cmPct >= 10 ? 'text-warning' : 'text-danger')}>{r.cmPct.toFixed(1)}%</td>
                              <td className="px-3 py-2">{formatNumber(r.revenue)}</td>
                              <td className="px-3 py-2">{formatNumber(r.directCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
