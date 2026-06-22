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
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { useProducts } from '@/hooks/useProducts'
import { useWaste, useInsertWaste, useWasteByRange } from '@/hooks/useWaste'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useAppStore } from '@/store/appStore'
import { formatNumber, formatDate, todayISO, monthName, getChartStyle } from '@/lib/utils'
import type { WasteLog } from '@/types'
import { cn } from '@/lib/utils'
import { exportToExcel } from '@/lib/excel'
import { Combobox } from '@/components/ui/combobox'
import { BarChart2, List, PieChart as PieChartIcon, Plus, ShoppingCart, TrendingUp, Package, TrendingDown } from 'lucide-react'
import { Link } from 'react-router-dom'
import { usePermission } from '@/hooks/usePermissions'

export default function Waste() {
  const canAdd = usePermission('waste', 'add')
  const canExport = usePermission('waste', 'export')
  const { selectedMonth, selectedYear } = useAppStore()
  const [date, setDate] = useState(todayISO())
  const [productId, setProductId] = useState('')
  const [wasteKg, setWasteKg] = useState('')
  const [reason, setReason] = useState('')

  const { data: products } = useProducts()
  const { data: wasteLog, isLoading } = useWaste({ month: selectedMonth, year: selectedYear })
  const { data: latestCosts } = useLatestPurchaseCosts()
  const { mutateAsync: insertWaste, isPending } = useInsertWaste()

  function getWAC(pid: string): number {
    return latestCosts?.[pid] ?? 0
  }

  // Show WAC for selected product in form
  const formWAC = productId ? getWAC(productId) : 0

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
    const map = new Map<string, { name: string; waste_kg: number; cost: number }>()
    wasteLog?.forEach(w => {
      const name = w.product?.name_ar ?? w.product_id
      const wac = getWAC(w.product_id)
      const existing = map.get(w.product_id) ?? { name, waste_kg: 0, cost: 0 }
      map.set(w.product_id, {
        ...existing,
        waste_kg: existing.waste_kg + w.waste_kg,
        cost: existing.cost + w.waste_kg * wac,
      })
    })
    return Array.from(map.values()).sort((a, b) => b.waste_kg - a.waste_kg)
  }, [wasteLog, latestCosts])

  const pieDataQty = useMemo(() =>
    monthlySummary.slice(0, 6).map(r => ({ name: r.name, value: parseFloat(r.waste_kg.toFixed(2)) })),
    [monthlySummary]
  )

  const pieDataCost = useMemo(() =>
    monthlySummary.filter(r => r.cost > 0).slice(0, 6).map(r => ({ name: r.name, value: parseFloat(r.cost.toFixed(2)) })),
    [monthlySummary]
  )

  // Monthly trend — last 12 months
  const trendFrom = useMemo(() => {
    const d = new Date(todayISO() + 'T12:00:00')
    d.setMonth(d.getMonth() - 11)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  }, [])
  const { data: trendWaste } = useWasteByRange(trendFrom, todayISO())

  const monthlyTrendData = useMemo(() => {
    const map = new Map<string, { wasteKg: number; wasteCost: number }>()
    trendWaste?.forEach(w => {
      const key = w.date.substring(0, 7) // YYYY-MM
      const ex = map.get(key) ?? { wasteKg: 0, wasteCost: 0 }
      const wac = latestCosts?.[w.product_id] ?? 0
      map.set(key, { wasteKg: ex.wasteKg + w.waste_kg, wasteCost: ex.wasteCost + w.waste_kg * wac })
    })
    // Generate last 12 months in order
    const months: string[] = []
    const now = new Date(todayISO() + 'T12:00:00')
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now)
      d.setMonth(d.getMonth() - i)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return months.map(key => {
      const [y, m] = key.split('-')
      const data = map.get(key) ?? { wasteKg: 0, wasteCost: 0 }
      return { month: `${monthName(parseInt(m)).substring(0, 3)} ${y.substring(2)}`, ...data }
    })
  }, [trendWaste, latestCosts])

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
    {
      id: 'cost',
      header: 'التكلفة (ر.س)',
      cell: ({ row }) => {
        const wac = getWAC(row.original.product_id)
        const cost = row.original.waste_kg * wac
        return wac > 0
          ? <span className="text-danger">{formatNumber(cost)}</span>
          : <span className="text-muted-foreground">—</span>
      },
    },
    { accessorKey: 'reason', header: 'السبب', cell: ({ getValue }) => (getValue() as string) ?? '—' },
    { accessorKey: 'source', header: 'المصدر', cell: ({ getValue }) => getValue() === 'web' ? 'يدوي' : 'Sheets' },
  ], [latestCosts])

  type WasteSection = 'summary' | 'charts' | 'trend' | 'log'
  const [activeSection, setActiveSection] = useState<WasteSection>('summary')

  const totalWasteKg = monthlySummary.reduce((s, r) => s + r.waste_kg, 0)
  const totalWasteCost = monthlySummary.reduce((s, r) => s + r.cost, 0)

  const sections = [
    { id: 'summary' as WasteSection, label: 'ملخص الهدر', icon: BarChart2 },
    { id: 'charts' as WasteSection, label: 'المخططات', icon: PieChartIcon },
    { id: 'trend' as WasteSection, label: 'الاتجاه الشهري', icon: TrendingDown },
    { id: 'log' as WasteSection, label: 'سجل الهدر', icon: List, badge: filteredWaste.length },
  ]

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '580px' }}>
      {/* Sidebar */}
      <div className="w-64 shrink-0 border-l border-border bg-muted/30 flex flex-col">
        {/* Quick Actions */}
        <div className="p-3 border-b border-border space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground px-1 py-0.5 uppercase tracking-wide">إجراءات سريعة</p>
          {[
            { to: '/purchases', label: 'مشتريات', icon: ShoppingCart, color: 'text-blue-600 hover:bg-blue-500/10' },
            { to: '/sales', label: 'مبيعات', icon: TrendingUp, color: 'text-success hover:bg-success/10' },
            { to: '/inventory', label: 'المخزون', icon: Package, color: 'text-purple-600 hover:bg-purple-500/10' },
          ].map(a => (
            <Link key={a.to} to={a.to} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${a.color}`}>
              <a.icon className="w-3.5 h-3.5" />{a.label}
            </Link>
          ))}
        </div>
        {/* Form */}
        {canAdd && <div className="p-3 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wide flex items-center gap-1.5"><Plus className="w-3 h-3"/>تسجيل هدر جديد</p>
          <form onSubmit={handleSubmit} className="space-y-2.5 mt-2">
            <div className="space-y-1"><Label className="text-xs">التاريخ</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} dir="ltr" className="h-8 text-xs" /></div>
            <div className="space-y-1"><Label className="text-xs">الصنف</Label>
              <Combobox options={(products ?? []).map(p => ({ value: p.id, label: p.name_ar, sub: p.category }))} value={productId} onValueChange={setProductId} placeholder="اختر صنف" /></div>
            <div className="space-y-1"><Label className="text-xs">الكمية (كج)</Label>
              <Input type="number" min="0" step="0.01" value={wasteKg} onChange={e => setWasteKg(e.target.value)} dir="ltr" placeholder="0" className="h-8 text-xs" /></div>
            {formWAC > 0 && wasteKg && (
              <div className="text-xs text-center py-1.5 bg-danger/10 text-danger rounded-lg font-medium">
                التكلفة: {formatNumber(parseFloat(wasteKg || '0') * formWAC)} ر.س
              </div>
            )}
            <div className="space-y-1"><Label className="text-xs">السبب (اختياري)</Label>
              <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="تلف طبيعي..." className="h-8 text-xs" /></div>
            <Button type="submit" size="sm" disabled={isPending} className="w-full gap-1.5">
              <Plus className="w-3.5 h-3.5"/>{isPending ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </form>
        </div>}

        {/* Month selector */}
        <div className="p-3 border-b border-border space-y-2">
          <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wide">الفترة</p>
          <div className="flex gap-1.5">
            <Select value={String(selectedMonth)} onValueChange={v => v && useAppStore.getState().setMonth(parseInt(v))}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>{Array.from({length:12},(_,i)=>i+1).map(m=><SelectItem key={m} value={String(m)}>{monthName(m).substring(0,3)}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={v => v && useAppStore.getState().setYear(parseInt(v))}>
              <SelectTrigger className="h-8 text-xs w-20"><SelectValue /></SelectTrigger>
              <SelectContent>{[new Date().getFullYear()-1,new Date().getFullYear()].map(y=><SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats */}
        {totalWasteKg > 0 && (
          <div className="p-3 border-b border-border space-y-1.5">
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">إجمالي الهدر</span><span className="font-semibold text-warning">{formatNumber(totalWasteKg)} كج</span></div>
            <div className="flex justify-between text-xs"><span className="text-muted-foreground">قيمة الهدر</span><span className="font-semibold text-danger">{formatNumber(totalWasteCost)} ر.س</span></div>
          </div>
        )}

        {/* Sections */}
        <div className="flex-1 p-2 space-y-0.5">
          <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">الأقسام</p>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveSection(s.id)}
              className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                activeSection === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <s.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{s.label}</span>
              {'badge' in s && (s as {badge?: number}).badge !== undefined && (s as {badge: number}).badge > 0 && <span className={cn('text-xs px-1.5 py-0.5 rounded-full', activeSection === s.id ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary')}>{(s as {badge: number}).badge}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-auto p-5 space-y-5">
        {activeSection === 'summary' && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص الهدر — {monthName(selectedMonth)} {selectedYear}</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-48" /> : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-muted/30">{['الصنف','هدر (كج)','التكلفة (ر.س)'].map(h=><th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {monthlySummary.map((r, i) => (
                        <tr key={i} className={cn('border-b border-border/50 hover:bg-muted/20', i%2===1&&'bg-muted/10')}>
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2 font-semibold text-warning">{formatNumber(r.waste_kg)}</td>
                          <td className="px-3 py-2 font-semibold text-danger">{r.cost > 0 ? formatNumber(r.cost) : <span className="text-muted-foreground">—</span>}</td>
                        </tr>
                      ))}
                      {monthlySummary.length === 0 && <tr><td colSpan={3} className="px-3 py-8 text-center text-muted-foreground text-sm">لا توجد بيانات هذا الشهر</td></tr>}
                      {monthlySummary.length > 0 && (
                        <tr className="bg-muted/40 font-bold border-t-2 border-border">
                          <td className="px-3 py-2.5">الإجمالي</td>
                          <td className="px-3 py-2.5 text-warning">{formatNumber(totalWasteKg)}</td>
                          <td className="px-3 py-2.5 text-danger">{formatNumber(totalWasteCost)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {activeSection === 'charts' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">الهدر حسب الكمية (كج)</CardTitle></CardHeader>
              <CardContent>{pieDataQty.length > 0 ? <PieChart data={pieDataQty} /> : <p className="text-center text-muted-foreground py-10 text-sm">لا توجد بيانات</p>}</CardContent>
            </Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">الهدر حسب التكلفة (ر.س)</CardTitle></CardHeader>
              <CardContent>{pieDataCost.length > 0 ? <PieChart data={pieDataCost} /> : <p className="text-center text-muted-foreground py-10 text-sm">لا توجد بيانات</p>}</CardContent>
            </Card>
          </div>
        )}

        {activeSection === 'trend' && (
          <div className="space-y-5">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">الهدر الشهري — الكمية (كج) — آخر 12 شهر</CardTitle></CardHeader>
              <CardContent>
                {monthlyTrendData.every(d => d.wasteKg === 0) ? (
                  <p className="text-center text-muted-foreground py-10 text-sm">لا توجد بيانات</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    {(() => { const cs = getChartStyle(); return (
                      <BarChart data={monthlyTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={cs.gridStroke} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.tickColor }} />
                        <YAxis tick={{ fontSize: 10, fill: cs.tickColor }} />
                        <Tooltip contentStyle={cs.tooltipStyle} formatter={(v) => [`${formatNumber(Number(v))} كج`, 'الهدر']} />
                        <Bar dataKey="wasteKg" fill="#f59e0b" radius={[4, 4, 0, 0]} name="الهدر" />
                      </BarChart>
                    )})()}
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">تكلفة الهدر الشهرية (ر.س) — آخر 12 شهر</CardTitle></CardHeader>
              <CardContent>
                {monthlyTrendData.every(d => d.wasteCost === 0) ? (
                  <p className="text-center text-muted-foreground py-10 text-sm">لا توجد بيانات بتكاليف</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    {(() => { const cs = getChartStyle(); return (
                      <BarChart data={monthlyTrendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={cs.gridStroke} />
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: cs.tickColor }} />
                        <YAxis tick={{ fontSize: 10, fill: cs.tickColor }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                        <Tooltip contentStyle={cs.tooltipStyle} formatter={(v) => [`${formatNumber(Number(v))} ر.س`, 'التكلفة']} />
                        <Bar dataKey="wasteCost" fill="#dc2626" radius={[4, 4, 0, 0]} name="التكلفة" />
                      </BarChart>
                    )})()}
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
            {/* جدول ملخص الاتجاه الشهري */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">ملخص شهري تفصيلي</CardTitle></CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-muted/30">{['الشهر','الهدر(كج)','التكلفة(ر.س)'].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
                    <tbody>
                      {monthlyTrendData.map((r, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="px-3 py-2 font-medium">{r.month}</td>
                          <td className={cn('px-3 py-2 font-semibold', r.wasteKg > 0 ? 'text-warning' : 'text-muted-foreground')}>{r.wasteKg > 0 ? formatNumber(r.wasteKg) : '—'}</td>
                          <td className={cn('px-3 py-2 font-semibold', r.wasteCost > 0 ? 'text-danger' : 'text-muted-foreground')}>{r.wasteCost > 0 ? formatNumber(r.wasteCost) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === 'log' && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">سجل الهدر — {monthName(selectedMonth)} {selectedYear}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Select value={filterProduct} onValueChange={v => setFilterProduct(v ?? '')}>
                  <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
                  <SelectContent><SelectItem value="">كل الأصناف</SelectItem>{products?.map(p=><SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={filterSource} onValueChange={v => setFilterSource(v ?? '')}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="كل المصادر" /></SelectTrigger>
                  <SelectContent><SelectItem value="">كل المصادر</SelectItem><SelectItem value="web">يدوي</SelectItem><SelectItem value="google_sheet">Sheets</SelectItem></SelectContent>
                </Select>
                {(filterProduct||filterSource)&&<Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={()=>{setFilterProduct('');setFilterSource('')}}>مسح</Button>}
              </div>
              {isLoading ? <div className="space-y-2">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-10"/>)}</div> : (
                <DataTable data={filteredWaste} columns={columns} searchPlaceholder="بحث..." onExportExcel={canExport?async()=>{await exportToExcel('waste.xlsx',['التاريخ','الصنف','الكمية(كج)','التكلفة(ر.س)','السبب','المصدر'],filteredWaste.map(w=>[w.date,w.product?.name_ar??'',w.waste_kg,parseFloat((w.waste_kg*getWAC(w.product_id)).toFixed(2)),w.reason??'',w.source==='web'?'يدوي':'Sheets']))}:undefined} />
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
