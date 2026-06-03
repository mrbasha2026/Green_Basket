import { useState, useMemo, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { LineChart } from '@/components/charts/LineChart'
import { BarChart } from '@/components/charts/BarChart'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useCostCategories, useOverheadEntries, useUpsertOverheadEntry, useUpsertCostCategory } from '@/hooks/useOverhead'
import { useCostAllocation, useMonthlyPL, useMonthlyPLHistory, useCalculateCostAllocation, useCloseMonth } from '@/hooks/useCostAllocation'
import { useAppStore } from '@/store/appStore'
import { formatNumber, monthName } from '@/lib/utils'
import type { CostAllocation } from '@/types'
import { cn } from '@/lib/utils'
import { Lock, Calculator, FileDown, DollarSign, Layers, BarChart2, GitCompare, Tags, Plus, Pencil } from 'lucide-react'

// Month/Year selector component
function PeriodSelector() {
  const { selectedMonth, selectedYear, setMonth, setYear } = useAppStore()
  const now = new Date()
  const years = [now.getFullYear() - 1, now.getFullYear()]
  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="flex items-center gap-2">
      <Select value={String(selectedMonth)} onValueChange={v => v && setMonth(parseInt(v))}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map(m => (
            <SelectItem key={m} value={String(m)}>{monthName(m)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={String(selectedYear)} onValueChange={v => v && setYear(parseInt(v))}>
        <SelectTrigger className="w-24">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

// Tab 1 — Cost Entry
function CostEntryTab() {
  const { selectedMonth, selectedYear } = useAppStore()
  const { data: categories } = useCostCategories()
  const { data: entries, isLoading } = useOverheadEntries(selectedYear, selectedMonth)
  const { data: pl } = useMonthlyPL(selectedYear, selectedMonth)
  const { mutateAsync: upsert, isPending } = useUpsertOverheadEntry()
  const isClosed = pl?.is_closed ?? false

  const [amounts, setAmounts] = useState<Record<string, string>>({})

  const entryMap = useMemo(() => {
    const m = new Map<string, number>()
    entries?.forEach(e => m.set(e.category_id, e.amount))
    return m
  }, [entries])

  function getAmount(catId: string): string {
    return amounts[catId] ?? String(entryMap.get(catId) ?? '')
  }

  async function saveEntry(categoryId: string) {
    if (isClosed) { toast.error('الشهر مغلق محاسبياً — لا يمكن التعديل'); return }
    const amount = parseFloat(amounts[categoryId] ?? String(entryMap.get(categoryId) ?? '0'))
    if (isNaN(amount)) return
    try {
      await upsert({ category_id: categoryId, period_year: selectedYear, period_month: selectedMonth, amount, notes: null })
      toast.success('تم الحفظ')
    } catch {
      toast.error('حدث خطأ')
    }
  }

  const fixedTotal = useMemo(() =>
    categories?.filter(c => c.type === 'fixed').reduce((s, c) => s + (entryMap.get(c.id) ?? 0), 0) ?? 0,
    [categories, entryMap]
  )
  const varTotal = useMemo(() =>
    categories?.filter(c => c.type === 'variable').reduce((s, c) => s + (entryMap.get(c.id) ?? 0), 0) ?? 0,
    [categories, entryMap]
  )

  if (isClosed) {
    return (
      <div className="flex items-center gap-3 p-4 bg-warning/10 border border-warning/30 rounded-lg text-sm text-warning">
        <Lock className="w-4 h-4" />
        الشهر مغلق محاسبياً — لا يمكن تعديل التكاليف
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isLoading ? <Skeleton className="h-48" /> : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-3 text-right text-muted-foreground">نوع التكلفة</th>
                <th className="px-4 py-3 text-right text-muted-foreground">الفئة</th>
                <th className="px-4 py-3 text-right text-muted-foreground">المبلغ (ر.س)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {categories?.map(cat => (
                <tr key={cat.id} className="border-b border-border/50">
                  <td className="px-4 py-3">{cat.name_ar}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs px-2 py-1 rounded', cat.type === 'fixed' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700')}>
                      {cat.type === 'fixed' ? 'ثابت' : 'متغير'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={getAmount(cat.id)}
                      onChange={e => setAmounts(prev => ({ ...prev, [cat.id]: e.target.value }))}
                      onBlur={() => saveEntry(cat.id)}
                      className="w-40 text-sm"
                      dir="ltr"
                      disabled={isPending}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="ghost" onClick={() => saveEntry(cat.id)} disabled={isPending}>
                      حفظ
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted/30 font-medium border-t-2 border-border">
                <td className="px-4 py-3" colSpan={2}>إجمالي التكاليف الثابتة</td>
                <td className="px-4 py-3 text-blue-600">{formatNumber(fixedTotal)}</td>
                <td></td>
              </tr>
              <tr className="bg-muted/30 font-medium">
                <td className="px-4 py-3" colSpan={2}>إجمالي التكاليف المتغيرة</td>
                <td className="px-4 py-3 text-orange-600">{formatNumber(varTotal)}</td>
                <td></td>
              </tr>
              <tr className="bg-primary/10 font-bold">
                <td className="px-4 py-3" colSpan={2}>الإجمالي الكلي</td>
                <td className="px-4 py-3 text-primary">{formatNumber(fixedTotal + varTotal)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// Tab 2 — Cost Allocation
function AllocationTab() {
  const { selectedMonth, selectedYear } = useAppStore()
  const { data: allocations, isLoading } = useCostAllocation(selectedYear, selectedMonth)
  const { data: pl } = useMonthlyPL(selectedYear, selectedMonth)
  const { mutateAsync: calculate, isPending } = useCalculateCostAllocation()
  const isClosed = pl?.is_closed ?? false
  const [distMethod, setDistMethod] = useState<'revenue' | 'qty' | 'equal'>('revenue')

  async function handleCalculate() {
    try {
      await calculate({ year: selectedYear, month: selectedMonth, distMethod })
      toast.success('تم حساب التوزيع بنجاح')
    } catch {
      toast.error('حدث خطأ أثناء الحساب')
    }
  }

  const columns = useMemo<ColumnDef<CostAllocation>[]>(() => [
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorKey: 'revenue', header: 'الإيراد', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'revenue_share_pct', header: 'نسبة%', cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
    { accessorKey: 'direct_cost', header: 'COGS', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'waste_cost', header: 'تكلفة الهدر', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'allocated_overhead', header: 'overhead موزّع', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'full_cost_per_kg', header: 'Full Cost/كج', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'breakeven_price_kg', header: 'Break-even/كج', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'contribution_margin_pct', header: 'CM%', cell: ({ getValue }) => `${(getValue() as number).toFixed(1)}%` },
    {
      accessorKey: 'net_profit',
      header: 'صافي الربح',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={v >= 0 ? 'text-success' : 'text-danger'}>{formatNumber(v)}</span>
      },
    },
  ], [])

  function rowClassName(row: CostAllocation) {
    // Determine avg sell price from revenue / qty if available
    if (row.breakeven_price_kg > 0 && row.revenue > 0 && row.qty_sold_kg > 0) {
      const avgSell = row.revenue / row.qty_sold_kg
      if (row.breakeven_price_kg > avgSell) return 'bg-danger/5'
    }
    if (row.contribution_margin_pct < 10) return 'bg-warning/5'
    if (row.contribution_margin_pct > 20) return 'bg-success/5'
    return ''
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Select value={distMethod} onValueChange={v => setDistMethod(v as 'revenue' | 'qty' | 'equal')}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">توزيع حسب الإيراد</SelectItem>
              <SelectItem value="qty">توزيع حسب الكمية</SelectItem>
              <SelectItem value="equal">توزيع متساوٍ</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleCalculate} disabled={isPending || isClosed} className="gap-2">
            <Calculator className="w-4 h-4" />
            {isPending ? 'جاري الحساب...' : 'احسب التوزيع'}
          </Button>
        </div>
        {isClosed && (
          <span className="text-sm text-warning flex items-center gap-1">
            <Lock className="w-3 h-3" /> الشهر مغلق
          </span>
        )}
        <div className="text-xs text-muted-foreground">
          🔴 Break-even أعلى من سعر البيع | 🟡 CM% أقل من 10% | 🟢 CM% أكثر من 20%
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <DataTable
          data={allocations ?? []}
          columns={columns}
          searchPlaceholder="بحث عن صنف..."
          rowClassName={rowClassName}
        />
      )}
    </div>
  )
}

// Tab 3 — P&L
function PLTab() {
  const { selectedMonth, selectedYear } = useAppStore()
  const { data: pl, isLoading } = useMonthlyPL(selectedYear, selectedMonth)
  const { mutateAsync: closeMonth, isPending: closing } = useCloseMonth()

  async function handleClose() {
    try {
      await closeMonth({ year: selectedYear, month: selectedMonth })
      toast.success('تم إغلاق الشهر محاسبياً')
    } catch {
      toast.error('حدث خطأ')
    }
  }

  async function handleExportPDF() {
    if (!pl) return
    const el = document.getElementById('pl-report-content')
    if (!el) return
    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const doc = new jsPDF({ unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 10
      const imgWidth = pageWidth - 2 * margin
      const imgHeight = (canvas.height / canvas.width) * imgWidth
      doc.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeight)
      doc.save(`P&L-${selectedYear}-${selectedMonth}.pdf`)
    } catch {
      toast.error('حدث خطأ أثناء التصدير')
    }
  }

  if (isLoading) return <Skeleton className="h-96" />

  if (!pl) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>لا يوجد تقرير P&L لهذا الشهر</p>
        <p className="text-sm mt-1">يرجى حساب توزيع التكاليف أولاً من التبويب الثاني</p>
      </div>
    )
  }

  const rows = [
    { label: 'الإيرادات', value: pl.total_revenue, bold: true, color: 'text-success' },
    { label: 'تكلفة البضاعة المباعة', value: -pl.total_purchase_cost, color: 'text-danger' },
    { label: 'تكلفة الهدر', value: -pl.total_waste_cost, color: 'text-danger' },
    { label: 'مجمل الربح (Gross Profit)', value: pl.gross_profit, bold: true, pct: pl.gross_margin_pct },
    null,
    { label: 'رواتب الموظفين', value: -pl.overhead_salaries },
    { label: 'إيجار المستودع', value: -pl.overhead_rent },
    { label: 'كهرباء ومبردات', value: -pl.overhead_utilities },
    { label: 'مصاريف نقل وتوصيل', value: -pl.overhead_transport },
    { label: 'مصاريف أخرى', value: -pl.overhead_other },
    { label: 'إجمالي التكاليف غير المباشرة', value: -pl.total_overhead, bold: true },
    null,
    { label: 'صافي الربح (Net Profit)', value: pl.net_profit, bold: true, pct: pl.net_margin_pct, color: pl.net_profit >= 0 ? 'text-success' : 'text-danger' },
  ]

  return (
    <div className="space-y-4 max-w-xl">
      {pl.is_closed && (
        <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          <Lock className="w-4 h-4" />
          الشهر مغلق محاسبياً
        </div>
      )}

      <div id="pl-report-content" className="rounded-lg border border-border overflow-hidden">
        <div className="bg-primary p-3 text-primary-foreground font-bold text-center">
          قائمة الدخل — {monthName(selectedMonth)} {selectedYear}
        </div>
        {rows.map((row, i) =>
          row === null ? (
            <div key={i} className="border-b-2 border-border" />
          ) : (
            <div
              key={i}
              className={cn(
                'flex justify-between px-4 py-2.5 border-b border-border/50',
                row.bold ? 'bg-muted/40 font-semibold' : '',
                row.color ?? ''
              )}
            >
              <span className="text-right">{row.label}</span>
              <div className="text-left flex items-center gap-3">
                {row.pct !== undefined && (
                  <span className="text-xs text-muted-foreground">{row.pct.toFixed(1)}%</span>
                )}
                <span dir="ltr">{formatNumber(row.value)}</span>
              </div>
            </div>
          )
        )}
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2">
          <FileDown className="w-4 h-4" /> PDF
        </Button>
        {!pl.is_closed && (
          <AlertDialog>
            <AlertDialogTrigger className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-warning text-warning hover:bg-warning/10 transition-colors">
              <Lock className="w-4 h-4" /> إغلاق الشهر محاسبياً
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>تأكيد إغلاق الشهر</AlertDialogTitle>
                <AlertDialogDescription>
                  بعد الإغلاق لن يمكن تعديل التكاليف لشهر {monthName(selectedMonth)} {selectedYear}. هل أنت متأكد؟
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                <AlertDialogAction onClick={handleClose} disabled={closing}>
                  {closing ? 'جاري الإغلاق...' : 'نعم، أغلق الشهر'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}

// Tab 4 — Month Comparison
function ComparisonTab() {
  const { data: history, isLoading } = useMonthlyPLHistory(12)

  const lineData = useMemo(() =>
    history?.map(m => ({
      period: `${m.period_month}/${m.period_year}`,
      'مجمل الربح': m.gross_profit,
      'صافي الربح': m.net_profit,
    })) ?? [],
    [history]
  )

  const barData = useMemo(() =>
    history?.map(m => ({
      period: `${m.period_month}/${m.period_year}`,
      'رواتب': m.overhead_salaries,
      'إيجار': m.overhead_rent,
      'كهرباء': m.overhead_utilities,
      'نقل': m.overhead_transport,
      'أخرى': m.overhead_other,
    })) ?? [],
    [history]
  )

  if (isLoading) return <Skeleton className="h-96" />

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">مجمل الربح vs صافي الربح — آخر 12 شهر</CardTitle>
        </CardHeader>
        <CardContent>
          <LineChart
            data={lineData}
            xAxisKey="period"
            lines={[
              { dataKey: 'مجمل الربح', name: 'مجمل الربح', color: '#22c55e' },
              { dataKey: 'صافي الربح', name: 'صافي الربح', color: '#16a34a' },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">التكاليف غير المباشرة حسب الفئة</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={barData}
            xAxisKey="period"
            bars={[
              { dataKey: 'رواتب', name: 'رواتب', color: '#3b82f6' },
              { dataKey: 'إيجار', name: 'إيجار', color: '#8b5cf6' },
              { dataKey: 'كهرباء', name: 'كهرباء', color: '#f59e0b' },
              { dataKey: 'نقل', name: 'نقل', color: '#ec4899' },
            ]}
          />
        </CardContent>
      </Card>

      {/* Comparison table */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {['الشهر','الإيراد','COGS','Gross%','Overhead','Net%'].map(h => (
                <th key={h} className="px-3 py-2 text-right text-muted-foreground font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {history?.map((m, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="px-3 py-2">{monthName(m.period_month)} {m.period_year}</td>
                <td className="px-3 py-2">{formatNumber(m.total_revenue)}</td>
                <td className="px-3 py-2">{formatNumber(m.total_purchase_cost)}</td>
                <td className={`px-3 py-2 ${m.gross_margin_pct >= 0 ? 'text-success' : 'text-danger'}`}>{m.gross_margin_pct.toFixed(1)}%</td>
                <td className="px-3 py-2">{formatNumber(m.total_overhead)}</td>
                <td className={`px-3 py-2 font-medium ${m.net_margin_pct >= 0 ? 'text-success' : 'text-danger'}`}>{m.net_margin_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function CostAccounting() {
  type CostSection = 'entry' | 'allocation' | 'pl' | 'comparison' | 'categories'
  const [activeTab, setActiveTab] = useState<CostSection>('entry')

  const sections: { id: CostSection; label: string; icon: React.ElementType; title: string; content?: ReactNode }[] = [
    { id: 'entry', label: 'إدخال التكاليف', icon: DollarSign, title: 'التكاليف غير المباشرة', content: <CostEntryTab /> },
    { id: 'allocation', label: 'توزيع التكاليف', icon: Layers, title: 'توزيع التكاليف على الأصناف', content: <AllocationTab /> },
    { id: 'pl', label: 'تقرير P&L', icon: BarChart2, title: 'قائمة الدخل الشهرية', content: <PLTab /> },
    { id: 'comparison', label: 'مقارنة الأشهر', icon: GitCompare, title: 'مقارنة الأشهر', content: <ComparisonTab /> },
    { id: 'categories', label: 'فئات التكاليف', icon: Tags, title: 'إدارة فئات التكاليف' },
  ]

  const current = sections.find(s => s.id === activeTab)!

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '580px' }}>
      {/* Sidebar */}
      <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
        <div className="p-3 border-b border-border">
          <PeriodSelector />
        </div>
        <div className="flex-1 p-2 space-y-0.5 mt-2">
          <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">الأقسام</p>
          {sections.map(s => (
            <button key={s.id} onClick={() => setActiveTab(s.id)}
              className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                activeTab === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <s.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{s.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-auto">
        {activeTab === 'categories' ? (
          <div className="p-4"><CostCategoriesInline /></div>
        ) : (
          <Card className="m-4 flex-1 border-0 shadow-none">
            <CardHeader className="pb-2"><CardTitle className="text-base">{current.title}</CardTitle></CardHeader>
            <CardContent>{current.content}</CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// ── Cost Categories inline component ──────────────────────────────────────────
function CostCategoriesInline() {
  const { data: categories } = useCostCategories()
  const { mutateAsync: upsertCat, isPending: isSaving } = useUpsertCostCategory()

  type CatForm = { id?: string; name_ar: string; type: 'fixed' | 'variable' }
  const [editCat, setEditCat] = useState<CatForm | null>(null)
  const [open, setOpen] = useState(false)

  async function handleSave() {
    if (!editCat?.name_ar) return
    try { await upsertCat(editCat); setOpen(false); setEditCat(null) } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => { setEditCat({ name_ar: '', type: 'fixed' }); setOpen(true) }}>
          <Plus className="w-3.5 h-3.5"/>إضافة فئة
        </Button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/30 border-b border-border">{['الاسم','النوع','الحالة',''].map(h=><th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>
            {categories?.map((cat, i) => (
              <tr key={cat.id} className={cn('border-b border-border/50 hover:bg-muted/20', i%2===1&&'bg-muted/10')}>
                <td className="px-3 py-2 font-medium">{cat.name_ar}</td>
                <td className="px-3 py-2"><span className={cn('text-xs px-2 py-0.5 rounded font-medium', cat.type==='fixed'?'bg-primary/10 text-primary':'bg-warning/10 text-warning')}>{cat.type==='fixed'?'ثابت':'متغير'}</span></td>
                <td className="px-3 py-2"><span className={cn('text-xs font-medium', cat.is_active?'text-success':'text-muted-foreground')}>{cat.is_active?'نشط':'موقوف'}</span></td>
                <td className="px-3 py-2"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={()=>{setEditCat({id:cat.id,name_ar:cat.name_ar,type:cat.type});setOpen(true)}}><Pencil className="w-3 h-3"/></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={()=>setOpen(false)}>
          <div className="bg-card rounded-xl p-5 w-80 space-y-3" onClick={e=>e.stopPropagation()}>
            <p className="font-semibold">{editCat?.id?'تعديل فئة':'إضافة فئة جديدة'}</p>
            <div className="space-y-1"><Label className="text-xs">اسم الفئة</Label><Input value={editCat?.name_ar??''} onChange={e=>setEditCat(p=>p?({...p,name_ar:e.target.value}):p)}/></div>
            <div className="space-y-1"><Label className="text-xs">النوع</Label>
              <select className="w-full h-9 rounded-lg border border-input bg-background px-3 text-sm" value={editCat?.type??'fixed'} onChange={e=>setEditCat(p=>p?({...p,type:e.target.value as 'fixed'|'variable'}):p)}>
                <option value="fixed">ثابت</option><option value="variable">متغير</option>
              </select></div>
            <div className="flex gap-2 justify-end"><Button variant="outline" size="sm" onClick={()=>setOpen(false)}>إلغاء</Button><Button size="sm" disabled={isSaving} onClick={handleSave}>{isSaving?'جاري...':'حفظ'}</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}
