import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { Combobox } from '@/components/ui/combobox'
import { useEarliestInventory, useInventoryRange, useInventoryDaily, useInventoryUpTo, useUpsertInventory, useDeleteInventory } from '@/hooks/useInventory'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { useSalesByRange } from '@/hooks/useSales'
import { useWasteByRange } from '@/hooks/useWaste'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useProducts } from '@/hooks/useProducts'
import { exportToExcel } from '@/lib/excel'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'
import { AlertTriangle, FileDown, Trash2, Pencil, Package, BarChart2, TrendingDown, Layers, Search, ClipboardList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ── Types ──────────────────────────────────────────────────────────────────────
interface InventoryBalance {
  product_id: string; product?: Product
  opening_stock_kg: number; purchased_weight: number; sales_kg: number
  waste_kg: number; closing_stock_kg: number; weighted_avg_cost: number; stock_value: number
}
type MovType = 'شراء' | 'بيع' | 'هدر' | 'افتتاحي'
interface MovementRow {
  id: string; date: string; product_id: string; product_name: string
  category: string; type: MovType; qty: number; cost_per_unit: number; total: number
}
type Section = 'overview' | 'balance' | 'movements' | 'jard'

function firstOfMonth() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function prevDay(s: string) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
const DISABLED = '9999-01-01'
const PIE_COLORS = ['hsl(var(--success))', 'hsl(var(--primary))', 'hsl(var(--warning))', 'hsl(var(--danger))']

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

// ── Main ───────────────────────────────────────────────────────────────────────
export default function Inventory() {
  const [activeSection, setActiveSection] = useState<Section>('overview')

  // Balance tab state
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(todayISO())
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null)
  const [appliedTo, setAppliedTo] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLowStock, setFilterLowStock] = useState(false)

  // Movements tab state
  const [reportFrom, setReportFrom] = useState(firstOfMonth())
  const [reportTo, setReportTo] = useState(todayISO())
  const [reportProduct, setReportProduct] = useState('')
  const [reportType, setReportType] = useState('')
  const [reportCategory, setReportCategory] = useState('')
  const [appliedRFrom, setAppliedRFrom] = useState<string | null>(null)
  const [appliedRTo, setAppliedRTo] = useState<string | null>(null)

  // Jard state
  const [jardDate, setJardDate] = useState(todayISO())
  const [jardEditId, setJardEditId] = useState<string | null>(null)
  const [jardEditQty, setJardEditQty] = useState('')
  const [jardInputs, setJardInputs] = useState<Record<string, string>>({})

  // Overview state — auto-load current month
  const [ovFrom, setOvFrom] = useState(firstOfMonth())
  const [ovTo, setOvTo] = useState(todayISO())
  const [ovApplied, setOvApplied] = useState(true)

  const qFrom = appliedFrom ?? DISABLED; const qTo = appliedTo ?? DISABLED
  const dayBefore = appliedFrom ? prevDay(appliedFrom) : DISABLED
  const rFrom = appliedRFrom ?? DISABLED; const rTo = appliedRTo ?? DISABLED

  // Overview query
  const ovDayBefore = prevDay(ovFrom)
  const { data: ovEarliest } = useEarliestInventory()
  const { data: ovPurchBefore } = usePurchasesByRange('2000-01-01', ovApplied ? ovDayBefore : DISABLED)
  const { data: ovSalesBefore } = useSalesByRange('2000-01-01', ovApplied ? ovDayBefore : DISABLED)
  const { data: ovWasteBefore } = useWasteByRange('2000-01-01', ovApplied ? ovDayBefore : DISABLED)
  const { data: ovPurch } = usePurchasesByRange(ovApplied ? ovFrom : DISABLED, ovApplied ? ovTo : DISABLED)
  const { data: ovSales } = useSalesByRange(ovApplied ? ovFrom : DISABLED, ovApplied ? ovTo : DISABLED)
  const { data: ovWaste } = useWasteByRange(ovApplied ? ovFrom : DISABLED, ovApplied ? ovTo : DISABLED)

  // Balance queries
  const { data: earliest, isLoading: eL } = useEarliestInventory()
  const { data: products } = useProducts()
  const { mutateAsync: upsertInventory, isPending: isSaving } = useUpsertInventory()
  const { mutateAsync: deleteInventory } = useDeleteInventory()
  const { data: jardExisting } = useInventoryDaily(jardDate)
  const { data: jardExpected } = useInventoryUpTo(jardDate)
  const { data: purchasesBefore, isLoading: pbL } = usePurchasesByRange('2000-01-01', dayBefore)
  const { data: salesBefore, isLoading: sbL } = useSalesByRange('2000-01-01', dayBefore)
  const { data: wasteBefore, isLoading: wbL } = useWasteByRange('2000-01-01', dayBefore)
  const { data: purchases, isLoading: pL } = usePurchasesByRange(qFrom, qTo)
  const { data: salesData, isLoading: sL } = useSalesByRange(qFrom, qTo)
  const { data: wasteData, isLoading: wL } = useWasteByRange(qFrom, qTo)
  const { data: movPurchases, isLoading: mpL } = usePurchasesByRange(rFrom, rTo)
  const { data: movSales, isLoading: msL } = useSalesByRange(rFrom, rTo)
  const { data: movWaste, isLoading: mwL } = useWasteByRange(rFrom, rTo)
  const { data: invRange, isLoading: irL } = useInventoryRange(rFrom, rTo)
  const { data: latestCosts } = useLatestPurchaseCosts(appliedRTo ?? todayISO())

  const isBalLoading = !!appliedFrom && (eL || pbL || sbL || wbL || pL || sL || wL)
  const isMovLoading = !!appliedRFrom && (mpL || msL || mwL || irL)

  // ── Opening map builder ──────────────────────────────────────────────────────
  function buildOpeningMap(
    earliestData: typeof earliest,
    purchBefore: typeof purchasesBefore,
    salBefore: typeof salesBefore,
    wstBefore: typeof wasteBefore
  ) {
    const result: Record<string, { stock: number; wac: number }> = {}
    earliestData?.forEach(inv => { result[inv.product_id] = { stock: inv.opening_stock_kg, wac: inv.weighted_avg_cost } })
    const allIds = new Set([
      ...(earliestData?.map(i => i.product_id) ?? []),
      ...(purchBefore?.map(p => p.product_id) ?? []),
      ...(salBefore?.map(s => s.product_id) ?? []),
      ...(wstBefore?.map(w => w.product_id) ?? []),
    ])
    allIds.forEach(pid => {
      const base = result[pid] ?? { stock: 0, wac: 0 }
      const baseDate = earliestData?.find(i => i.product_id === pid)?.date ?? '2000-01-01'
      const purch = (purchBefore ?? []).filter(p => p.product_id === pid && p.date >= baseDate)
      const sale = (salBefore ?? []).filter(s => s.product_id === pid && s.date >= baseDate)
      const wst = (wstBefore ?? []).filter(w => w.product_id === pid && w.date >= baseDate)
      const pw = purch.reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
      const pc = purch.reduce((s, p) => s + (p.total_cost ?? p.cartons_qty * p.price_per_carton), 0)
      const sk = sale.reduce((s, s2) => s + s2.qty_kg, 0)
      const wk = wst.reduce((s, w) => s + w.waste_kg, 0)
      const closing = Math.max(0, base.stock + pw - sk - wk)
      const ti = base.stock + pw
      result[pid] = { stock: closing, wac: ti > 0 ? (base.stock * base.wac + pc) / ti : base.wac }
    })
    return result
  }

  const openingMap = useMemo(() => {
    if (!appliedFrom) return {}
    return buildOpeningMap(earliest, purchasesBefore, salesBefore, wasteBefore)
  }, [appliedFrom, earliest, purchasesBefore, salesBefore, wasteBefore])

  // Overview opening map
  const ovOpeningMap = useMemo(() =>
    buildOpeningMap(ovEarliest, ovPurchBefore, ovSalesBefore, ovWasteBefore),
    [ovEarliest, ovPurchBefore, ovSalesBefore, ovWasteBefore]
  )

  // ── Balance builder ──────────────────────────────────────────────────────────
  function buildBalance(
    opMap: Record<string, { stock: number; wac: number }>,
    purch: typeof purchases,
    sales: typeof salesData,
    waste: typeof wasteData
  ): InventoryBalance[] {
    const ids = new Set([
      ...Object.keys(opMap),
      ...(purch?.map(p => p.product_id) ?? []),
      ...(sales?.map(s => s.product_id) ?? []),
      ...(waste?.map(w => w.product_id) ?? []),
    ])
    return Array.from(ids).map(pid => {
      const ob = opMap[pid] ?? { stock: 0, wac: 0 }
      const pw = (purch ?? []).filter(p => p.product_id === pid).reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
      const pc = (purch ?? []).filter(p => p.product_id === pid).reduce((s, p) => s + (p.total_cost ?? p.cartons_qty * p.price_per_carton), 0)
      const sk = (sales ?? []).filter(s => s.product_id === pid).reduce((s, s2) => s + s2.qty_kg, 0)
      const wk = (waste ?? []).filter(w => w.product_id === pid).reduce((s, w) => s + w.waste_kg, 0)
      const closing = Math.max(0, ob.stock + pw - sk - wk)
      const ti = ob.stock + pw
      const wac = ti > 0 ? (ob.stock * ob.wac + pc) / ti : ob.wac
      const product = products?.find(p => p.id === pid) ?? (purch ?? []).find(p => p.product_id === pid)?.product ?? (sales ?? []).find(s => s.product_id === pid)?.product
      return { product_id: pid, product, opening_stock_kg: ob.stock, purchased_weight: pw, sales_kg: sk, waste_kg: wk, closing_stock_kg: closing, weighted_avg_cost: wac, stock_value: closing * wac }
    }).filter(b => b.opening_stock_kg > 0 || b.purchased_weight > 0)
      .sort((a, b) => (a.product?.name_ar ?? '').localeCompare(b.product?.name_ar ?? ''))
  }

  const inventoryBalance = useMemo<InventoryBalance[]>(() => {
    if (!appliedFrom) return []
    return buildBalance(openingMap, purchases, salesData, wasteData)
  }, [appliedFrom, openingMap, purchases, salesData, wasteData, products])

  // Overview balance (auto, no button needed)
  const ovBalance = useMemo<InventoryBalance[]>(() =>
    buildBalance(ovOpeningMap, ovPurch, ovSales, ovWaste),
    [ovOpeningMap, ovPurch, ovSales, ovWaste, products]
  )

  const filteredBalance = useMemo(() => {
    let d = inventoryBalance
    if (filterCategory) d = d.filter(b => b.product?.category === filterCategory)
    if (filterLowStock) d = d.filter(b => b.closing_stock_kg < 10)
    return d
  }, [inventoryBalance, filterCategory, filterLowStock])

  const lowStock = useMemo(() => inventoryBalance.filter(b => b.closing_stock_kg > 0 && b.closing_stock_kg < 10), [inventoryBalance])
  const totalStockValue = useMemo(() => inventoryBalance.reduce((s, b) => s + b.stock_value, 0), [inventoryBalance])

  // Overview stats
  const ovLowStock = useMemo(() => ovBalance.filter(b => b.closing_stock_kg > 0 && b.closing_stock_kg < 10), [ovBalance])
  const ovTotalValue = useMemo(() => ovBalance.reduce((s, b) => s + b.stock_value, 0), [ovBalance])
  const categories = useMemo(() => [...new Set(products?.map(p => p.category) ?? [])], [products])

  // Top 10 by closing stock (for bar chart)
  const topStockChart = useMemo(() =>
    [...ovBalance].sort((a, b) => b.closing_stock_kg - a.closing_stock_kg).slice(0, 10).map(b => ({
      name: (b.product?.name_ar ?? '').substring(0, 10),
      value: Math.round(b.closing_stock_kg),
    })),
    [ovBalance]
  )

  // Category distribution (for pie chart)
  const categoryChart = useMemo(() => {
    const map = new Map<string, number>()
    ovBalance.forEach(b => {
      const cat = b.product?.category ?? 'أخرى'
      map.set(cat, (map.get(cat) ?? 0) + b.stock_value)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value: Math.round(value) }))
  }, [ovBalance])

  // ── Movements ─────────────────────────────────────────────────────────────
  const movements = useMemo<MovementRow[]>(() => {
    if (!appliedRFrom) return []
    const rows: MovementRow[] = []
    ;(invRange ?? []).forEach(i => {
      if (i.opening_stock_kg > 0) {
        const prod = products?.find(p => p.id === i.product_id) ?? i.product
        rows.push({ id: `inv_${i.id}`, date: i.date, product_id: i.product_id, product_name: prod?.name_ar ?? '—', category: prod?.category ?? '', type: 'افتتاحي', qty: i.opening_stock_kg, cost_per_unit: i.weighted_avg_cost, total: i.opening_stock_kg * i.weighted_avg_cost })
      }
    })
    ;(movPurchases ?? []).forEach(p => {
      rows.push({ id: `p_${p.id}`, date: p.date, product_id: p.product_id, product_name: p.product?.name_ar ?? '—', category: p.product?.category ?? '', type: 'شراء', qty: p.total_weight ?? p.cartons_qty * p.weight_per_carton, cost_per_unit: p.cost_per_kg, total: p.total_cost ?? p.cartons_qty * p.price_per_carton })
    })
    ;(movSales ?? []).forEach(s => {
      rows.push({ id: `s_${s.id}`, date: s.date, product_id: s.product_id, product_name: s.product?.name_ar ?? '—', category: s.product?.category ?? '', type: 'بيع', qty: s.qty_kg, cost_per_unit: s.price_per_kg, total: s.total_amount })
    })
    ;(movWaste ?? []).forEach(w => {
      const wac = latestCosts?.[w.product_id] ?? 0
      rows.push({ id: `w_${w.id}`, date: w.date, product_id: w.product_id, product_name: w.product?.name_ar ?? '—', category: w.product?.category ?? '', type: 'هدر', qty: w.waste_kg, cost_per_unit: wac, total: w.waste_kg * wac })
    })
    return rows.filter(r => {
      if (reportProduct && r.product_id !== reportProduct) return false
      if (reportType && r.type !== reportType) return false
      if (reportCategory && r.category !== reportCategory) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [appliedRFrom, invRange, movPurchases, movSales, movWaste, latestCosts, products, reportProduct, reportType, reportCategory])

  // ── Columns ───────────────────────────────────────────────────────────────
  const balCols = useMemo<ColumnDef<InventoryBalance>[]>(() => [
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorFn: r => r.product?.category ?? '', id: 'category', header: 'الفئة', cell: ({ getValue }) => <Badge variant="outline" className="text-xs">{getValue() as string}</Badge> },
    { accessorKey: 'opening_stock_kg', header: 'أول المدة', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'purchased_weight', header: '+ مشتريات', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-primary font-medium">{formatNumber(v)}</span> : <span className="text-muted-foreground">—</span> } },
    { accessorKey: 'sales_kg', header: '− مبيعات', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-danger font-medium">{formatNumber(v)}</span> : <span className="text-muted-foreground">—</span> } },
    { accessorKey: 'waste_kg', header: '− هدر', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-warning font-medium">{formatNumber(v)}</span> : <span className="text-muted-foreground">—</span> } },
    { accessorKey: 'closing_stock_kg', header: 'الرصيد (كج)', cell: ({ getValue }) => { const v = getValue() as number; return <span className={cn('font-bold text-sm', v <= 0 ? 'text-muted-foreground' : v < 10 ? 'text-danger' : v < 20 ? 'text-warning' : 'text-success')}>{formatNumber(v)}</span> } },
    { accessorKey: 'weighted_avg_cost', header: 'م.و.م', cell: ({ getValue }) => <span className="text-muted-foreground">{formatNumber(getValue() as number)}</span> },
    { accessorKey: 'stock_value', header: 'القيمة (ر.س)', cell: ({ getValue }) => <span className="font-semibold text-primary">{formatNumber(getValue() as number)}</span> },
  ], [])

  const movCols = useMemo<ColumnDef<MovementRow>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
    { accessorKey: 'product_name', header: 'الصنف', cell: ({ getValue }) => <span className="font-medium text-sm">{getValue() as string}</span> },
    { accessorKey: 'category', header: 'الفئة', cell: ({ getValue }) => <Badge variant="outline" className="text-xs">{getValue() as string}</Badge> },
    {
      accessorKey: 'type', header: 'النوع', cell: ({ getValue }) => {
        const t = getValue() as MovType
        const cls = t === 'شراء' ? 'bg-primary/15 text-primary' : t === 'بيع' ? 'bg-danger/15 text-danger' : t === 'هدر' ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground'
        return <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', cls)}>{t}</span>
      }
    },
    {
      accessorKey: 'qty', header: 'الكمية (كج)', cell: ({ row }) => {
        const v = row.original.qty; const t = row.original.type
        const color = t === 'شراء' || t === 'افتتاحي' ? 'text-primary' : t === 'بيع' ? 'text-danger' : 'text-warning'
        return <span className={cn('font-semibold', color)}>{t === 'بيع' || t === 'هدر' ? '−' : '+'}{formatNumber(v)}</span>
      }
    },
    { accessorKey: 'cost_per_unit', header: 'السعر/كج', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-xs text-muted-foreground">{formatNumber(v)}</span> : '—' } },
    { accessorKey: 'total', header: 'الإجمالي (ر.س)', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="font-medium">{formatNumber(v)}</span> : '—' } },
  ], [])

  // ── Jard handlers ──────────────────────────────────────────────────────────
  async function handleSaveJard() {
    const rows = Object.entries(jardInputs)
      .filter(([, v]) => v !== '' && parseFloat(v) >= 0)
      .map(([pid, v]) => {
        const qty = parseFloat(v); const wac = latestCosts?.[pid] ?? 0
        return { product_id: pid, date: jardDate, opening_stock_kg: qty, opening_cost_per_kg: wac, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: wac }
      })
    if (rows.length === 0) { toast.error('أدخل كمية واحدة على الأقل'); return }
    try { await upsertInventory(rows); toast.success(`تم حفظ ${rows.length} صنف`); setJardInputs({}) } catch { toast.error('حدث خطأ') }
  }
  async function handleDeleteJard(product_id: string) {
    try { await deleteInventory({ product_id, date: jardDate }); toast.success('تم الحذف') } catch { toast.error('حدث خطأ') }
  }
  async function handleUpdateJard(product_id: string) {
    const qty = parseFloat(jardEditQty); if (isNaN(qty) || qty < 0) return
    const wac = latestCosts?.[product_id] ?? 0
    try {
      await upsertInventory([{ product_id, date: jardDate, opening_stock_kg: qty, opening_cost_per_kg: wac, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: wac }])
      toast.success('تم التعديل'); setJardEditId(null); setJardEditQty('')
    } catch { toast.error('حدث خطأ') }
  }

  // ── Sidebar sections ───────────────────────────────────────────────────────
  const sections: { id: Section; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'overview', label: 'لوحة المخزون', icon: BarChart2 },
    { id: 'balance', label: 'رصيد المخزون', icon: Package, badge: inventoryBalance.length || undefined },
    { id: 'movements', label: 'حركات المخزون', icon: TrendingDown, badge: movements.length || undefined },
    { id: 'jard', label: 'جرد المخزون', icon: ClipboardList },
  ]

  const productOptions = (products ?? []).map(p => ({ value: p.id, label: p.name_ar }))

  return (
    <div className="space-y-4">

      {/* ── Sidebar + Content ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '620px' }}>

        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
          {/* Quick actions */}
          <div className="p-3 border-b border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wide">إجراءات سريعة</p>
            <Button size="sm" className="w-full gap-2 justify-start h-8" onClick={() => setActiveSection('jard')}>
              <ClipboardList className="w-3.5 h-3.5" />بدء جرد جديد
            </Button>
            <Button variant="outline" size="sm" className="w-full gap-2 justify-start h-8 text-xs" onClick={() => setActiveSection('movements')}>
              <TrendingDown className="w-3.5 h-3.5" />حركات المخزون
            </Button>
          </div>

          {/* Sections */}
          <div className="flex-1 p-2 space-y-0.5">
            <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">الأقسام</p>
            {sections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                  activeSection === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <s.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{s.label}</span>
                {s.badge !== undefined && (
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', activeSection === s.id ? 'bg-white/20 text-white' : 'bg-primary/15 text-primary')}>{s.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Low stock alert */}
          {ovLowStock.length > 0 && (
            <div className="p-3 border-t border-border">
              <button onClick={() => { setFilterLowStock(true); setActiveSection('balance'); if (!appliedFrom) { setAppliedFrom(ovFrom); setAppliedTo(ovTo) } }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                {ovLowStock.length} صنف منخفض
              </button>
            </div>
          )}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-auto">

          {/* ── Overview ────────────────────────────────────────────────── */}
          {activeSection === 'overview' && (
            <div className="p-5 space-y-5">
              {/* Date filter */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h2 className="text-base font-semibold">لوحة المخزون</h2>
                <QuickDateFilter from={ovFrom} to={ovTo} onFromChange={v => { setOvFrom(v); setOvApplied(false) }} onToChange={v => { setOvTo(v); setOvApplied(false) }} />
                <Button size="sm" className="gap-1.5" onClick={() => setOvApplied(true)}><Search className="w-3.5 h-3.5" />عرض</Button>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard title="إجمالي الأصناف" value={String(products?.length ?? 0)} sub={`${categories.length} فئة`} icon={Layers} color="primary" />
                <StatCard title="قيمة المخزون" value={`${formatNumber(ovTotalValue)} ر.س`} sub={`${ovBalance.length} صنف نشط`} icon={Package} color="success" />
                <StatCard title="أصناف منخفضة" value={String(ovLowStock.length)} sub="أقل من 10 كج" icon={AlertTriangle} color={ovLowStock.length > 0 ? 'danger' : 'success'} />
                <StatCard title="الفئات" value={String(categories.length)} icon={BarChart2} color="primary" />
              </div>

              {/* Low stock alert */}
              {ovLowStock.length > 0 && (
                <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-danger mb-1.5">تنبيه: أصناف تحتاج تجديد</p>
                    <div className="flex flex-wrap gap-2">
                      {ovLowStock.map(b => (
                        <span key={b.product_id} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded-md font-medium">
                          {b.product?.name_ar} — {formatNumber(b.closing_stock_kg)} كج
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">أعلى 10 أصناف في المخزون (كج)</CardTitle></CardHeader>
                  <CardContent>
                    {topStockChart.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8 text-sm">لا توجد بيانات — اضغط عرض</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={topStockChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                          <Tooltip formatter={(v: number) => [`${formatNumber(v)} كج`, 'الكمية']} />
                          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">قيمة المخزون حسب الفئة</CardTitle></CardHeader>
                  <CardContent>
                    {categoryChart.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8 text-sm">لا توجد بيانات</p>
                    ) : (
                      <>
                        <ResponsiveContainer width="100%" height={160}>
                          <PieChart>
                            <Pie data={categoryChart} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                              {categoryChart.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'القيمة']} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-1.5 mt-2">
                          {categoryChart.map((item, i) => (
                            <div key={item.name} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                <span className="text-muted-foreground">{item.name}</span>
                              </div>
                              <span className="font-medium">{formatNumber(item.value)} ر.س</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Quick table */}
              {ovBalance.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">أدنى المخزونات (أقل 10)</CardTitle>
                      <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setActiveSection('balance')}>
                        عرض الكل
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {[...ovBalance].sort((a, b) => a.closing_stock_kg - b.closing_stock_kg).slice(0, 10).map(b => {
                        const pct = Math.max(0, Math.min(100, (b.closing_stock_kg / 100) * 100))
                        return (
                          <div key={b.product_id} className="flex items-center gap-3">
                            <span className="text-xs font-medium w-28 truncate">{b.product?.name_ar}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all', b.closing_stock_kg < 10 ? 'bg-danger' : b.closing_stock_kg < 20 ? 'bg-warning' : 'bg-success')} style={{ width: `${pct}%` }} />
                            </div>
                            <span className={cn('text-xs font-semibold w-16 text-left', b.closing_stock_kg < 10 ? 'text-danger' : b.closing_stock_kg < 20 ? 'text-warning' : 'text-success')}>
                              {formatNumber(b.closing_stock_kg)} كج
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ── Balance ─────────────────────────────────────────────────── */}
          {activeSection === 'balance' && (
            <div className="p-5 space-y-5">
              {/* Filter bar */}
              <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-xl border border-border">
                <QuickDateFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
                <Button onClick={() => { setAppliedFrom(fromDate); setAppliedTo(toDate) }} className="gap-1.5 h-8">
                  <Search className="w-3.5 h-3.5" />عرض
                </Button>
              </div>

              {!appliedFrom && <p className="text-center py-12 text-muted-foreground text-sm">حدد الفترة واضغط <strong>عرض</strong></p>}

              {appliedFrom && (
                <>
                  {lowStock.length > 0 && (
                    <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex gap-3">
                      <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-danger mb-1.5">مخزون منخفض</p>
                        <div className="flex flex-wrap gap-2">
                          {lowStock.map(b => <span key={b.product_id} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded">{b.product?.name_ar} — {formatNumber(b.closing_stock_kg)} كج</span>)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <StatCard title="إجمالي الأصناف" value={String(inventoryBalance.length)} icon={Package} color="primary" />
                    <StatCard title="قيمة المخزون" value={`${formatNumber(totalStockValue)} ر.س`} icon={BarChart2} color="success" />
                    <StatCard title="أصناف منخفضة" value={String(lowStock.length)} icon={AlertTriangle} color={lowStock.length > 0 ? 'danger' : 'success'} />
                  </div>

                  <Card>
                    <CardHeader><CardTitle className="text-sm flex items-center justify-between">
                      <span>رصيد المخزون — {formatDate(appliedFrom)} إلى {formatDate(appliedTo!)}</span>
                      <div className="flex gap-2">
                        <Select value={filterCategory} onValueChange={v => setFilterCategory(v ?? '')}>
                          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                          <SelectContent><SelectItem value="">كل الفئات</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button variant={filterLowStock ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFilterLowStock(v => !v)}>منخفض فقط</Button>
                        <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => exportToExcel(`inventory-${appliedTo}.xlsx`, ['الصنف','الفئة','أول المدة','المشتريات','المبيعات','الهدر','الرصيد','م.و.م','القيمة'], filteredBalance.map(b => [b.product?.name_ar ?? '', b.product?.category ?? '', b.opening_stock_kg, b.purchased_weight, b.sales_kg, b.waste_kg, b.closing_stock_kg, b.weighted_avg_cost, b.stock_value]))}>
                          <FileDown className="w-3.5 h-3.5" />Excel
                        </Button>
                      </div>
                    </CardTitle></CardHeader>
                    <CardContent>
                      {isBalLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                        : filteredBalance.length === 0 ? <p className="text-center py-10 text-sm text-muted-foreground">لا توجد بيانات</p>
                          : <DataTable data={filteredBalance} columns={balCols} searchPlaceholder="بحث عن صنف..." rowClassName={row => row.closing_stock_kg > 0 && row.closing_stock_kg < 10 ? 'bg-danger/5' : ''} />}
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}

          {/* ── Movements ───────────────────────────────────────────────── */}
          {activeSection === 'movements' && (
            <div className="p-5 space-y-5">
              <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-xl border border-border">
                <QuickDateFilter from={reportFrom} to={reportTo} onFromChange={setReportFrom} onToChange={setReportTo} />
                <div className="w-44">
                  <Combobox options={[{ value: '', label: 'كل الأصناف' }, ...productOptions]} value={reportProduct} onValueChange={setReportProduct} placeholder="كل الأصناف" />
                </div>
                <Select value={reportCategory} onValueChange={v => setReportCategory(v ?? '')}>
                  <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                  <SelectContent><SelectItem value="">كل الفئات</SelectItem>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={reportType} onValueChange={v => setReportType(v ?? '')}>
                  <SelectTrigger className="w-36 h-9 text-sm"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
                  <SelectContent><SelectItem value="">كل الأنواع</SelectItem><SelectItem value="افتتاحي">رصيد افتتاحي</SelectItem><SelectItem value="شراء">مشتريات</SelectItem><SelectItem value="بيع">مبيعات</SelectItem><SelectItem value="هدر">هدر</SelectItem></SelectContent>
                </Select>
                <Button onClick={() => { setAppliedRFrom(reportFrom); setAppliedRTo(reportTo) }} className="gap-1.5 h-9">
                  <Search className="w-3.5 h-3.5" />عرض
                </Button>
              </div>

              {!appliedRFrom && <p className="text-center py-12 text-muted-foreground text-sm">حدد الفترة واضغط <strong>عرض</strong></p>}

              {appliedRFrom && (
                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center justify-between">
                    <span>حركات المخزون <span className="text-muted-foreground font-normal">({movements.length} حركة)</span></span>
                    <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => exportToExcel(`movements-${appliedRFrom}-${appliedRTo}.xlsx`, ['التاريخ','الصنف','الفئة','النوع','الكمية(كج)','السعر/كج','الإجمالي'], movements.map(m => [m.date, m.product_name, m.category, m.type, m.qty, m.cost_per_unit, m.total]))}>
                      <FileDown className="w-3.5 h-3.5" />Excel
                    </Button>
                  </CardTitle></CardHeader>
                  <CardContent>
                    {isMovLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                      : movements.length === 0 ? <p className="text-center text-muted-foreground py-10 text-sm">لا توجد حركات</p>
                        : <DataTable data={movements} columns={movCols} searchPlaceholder="بحث..." />}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* ── Jard ────────────────────────────────────────────────────── */}
          {activeSection === 'jard' && (
            <div className="p-5 space-y-5">
              <div className="flex items-end gap-3 p-4 bg-muted/30 rounded-xl border border-border">
                <div className="space-y-1"><Label className="text-xs">تاريخ الجرد</Label>
                  <Input type="date" value={jardDate} onChange={e => { setJardDate(e.target.value); setJardInputs({}) }} className="w-44 h-9" dir="ltr" />
                </div>
                <p className="text-xs text-muted-foreground pb-1">أدخل الكميات الفعلية لكل صنف في المخزن وقت الجرد</p>
              </div>

              {/* Saved records */}
              {(jardExisting ?? []).length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-sm flex items-center justify-between">
                    <span>سجلات الجرد المحفوظة — {formatDate(jardDate)}</span>
                    <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => exportToExcel(`jard-${jardDate}.xlsx`, ['الصنف','الكمية (كج)','التكلفة/كج','القيمة'], (jardExisting ?? []).map(j => [j.product?.name_ar ?? j.product_id, j.opening_stock_kg, j.weighted_avg_cost, j.opening_stock_kg * j.weighted_avg_cost]))}>
                      <FileDown className="w-3.5 h-3.5" />Excel
                    </Button>
                  </CardTitle></CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-border bg-muted/30">{['الصنف','الفئة','الكمية (كج)','التكلفة/كج','القيمة',''].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
                        <tbody>
                          {(jardExisting ?? []).map(j => (
                            <tr key={j.product_id} className="border-b last:border-b-0 border-border/50 hover:bg-muted/20">
                              <td className="px-3 py-2 font-medium">{j.product?.name_ar ?? j.product_id}</td>
                              <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{j.product?.category}</Badge></td>
                              <td className="px-3 py-2">
                                {jardEditId === j.product_id
                                  ? <Input type="number" min="0" step="0.01" value={jardEditQty} onChange={e => setJardEditQty(e.target.value)} className="w-24 h-8 text-sm" dir="ltr" autoFocus />
                                  : <span className="font-semibold text-success">{formatNumber(j.opening_stock_kg)}</span>}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground">{formatNumber(j.weighted_avg_cost)}</td>
                              <td className="px-3 py-2 font-medium text-primary">{formatNumber(j.opening_stock_kg * j.weighted_avg_cost)}</td>
                              <td className="px-3 py-2">
                                {jardEditId === j.product_id
                                  ? <div className="flex gap-1"><Button size="sm" className="h-7" onClick={() => handleUpdateJard(j.product_id)} disabled={isSaving}>حفظ</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => { setJardEditId(null); setJardEditQty('') }}>إلغاء</Button></div>
                                  : <div className="flex gap-1">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setJardEditId(j.product_id); setJardEditQty(String(j.opening_stock_kg)) }}><Pencil className="w-3.5 h-3.5" /></Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10" onClick={() => handleDeleteJard(j.product_id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                  </div>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* New jard input */}
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center justify-between">
                  <span>إدخال كميات الجرد — {formatDate(jardDate)}</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1 h-8 text-xs" onClick={() => exportToExcel(`jard-sheet-${jardDate}.xlsx`, ['الصنف','الفئة','الرصيد الدفتري(كج)','الكمية الفعلية(كج)','الفرق','قيمة الفرق'], (products ?? []).map(p => { const exp = (jardExpected ?? []).find(j => j.product_id === p.id); return [p.name_ar, p.category, exp?.closing_stock_kg ?? 0, '', '', ''] }))}>
                      <FileDown className="w-3.5 h-3.5" />ورقة عدّ
                    </Button>
                    <Button size="sm" className="gap-1.5 h-8" onClick={handleSaveJard} disabled={isSaving}>
                      {isSaving ? 'جاري الحفظ...' : 'حفظ الجرد'}
                    </Button>
                  </div>
                </CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border bg-muted/30">{['الصنف','الفئة','الرصيد الدفتري','الكمية الفعلية','الفرق','الفرق%','قيمة الفرق (ر.س)'].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}</tr></thead>
                      <tbody>
                        {(products ?? []).map(p => {
                          const existing = (jardExisting ?? []).find(j => j.product_id === p.id)
                          if (existing) return null
                          const expected = (jardExpected ?? []).find(j => j.product_id === p.id)?.closing_stock_kg ?? 0
                          const actualStr = jardInputs[p.id] ?? ''; const actual = actualStr !== '' ? parseFloat(actualStr) : null
                          const diff = actual !== null ? actual - expected : null
                          const diffPct = expected > 0 && diff !== null ? (diff / expected) * 100 : null
                          const wac = latestCosts?.[p.id] ?? 0; const diffValue = diff !== null ? diff * wac : null
                          return (
                            <tr key={p.id} className={cn('border-b last:border-b-0 border-border/50 hover:bg-muted/20', diff !== null && Math.abs(diff) >= 5 ? 'bg-danger/5' : diff !== null && diff !== 0 ? 'bg-warning/5' : '')}>
                              <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                              <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                              <td className="px-3 py-2 text-muted-foreground font-medium">{expected > 0 ? formatNumber(expected) : '—'}</td>
                              <td className="px-3 py-2"><Input type="number" min="0" step="0.01" placeholder="أدخل الكمية" value={actualStr} onChange={e => setJardInputs(prev => ({ ...prev, [p.id]: e.target.value }))} className="w-28 h-8 text-sm" dir="ltr" /></td>
                              <td className={cn('px-3 py-2 font-semibold', diff === null ? 'text-muted-foreground' : diff === 0 ? 'text-success' : diff > 0 ? 'text-success' : 'text-danger')}>
                                {diff !== null ? (diff >= 0 ? '+' : '') + formatNumber(diff) : '—'}
                              </td>
                              <td className={cn('px-3 py-2 text-xs', diffPct === null ? 'text-muted-foreground' : Math.abs(diffPct) < 5 ? 'text-warning' : 'text-danger')}>
                                {diffPct !== null ? (diffPct >= 0 ? '+' : '') + diffPct.toFixed(1) + '%' : '—'}
                              </td>
                              <td className={cn('px-3 py-2 font-medium', diffValue === null ? '' : diffValue >= 0 ? 'text-success' : 'text-danger')}>
                                {diffValue !== null ? (diffValue >= 0 ? '+' : '') + formatNumber(diffValue) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {Object.keys(jardInputs).length > 0 && (() => {
                        const totalDiffValue = Object.entries(jardInputs).filter(([, v]) => v !== '').reduce((s, [pid, v]) => {
                          const exp = (jardExpected ?? []).find(j => j.product_id === pid)?.closing_stock_kg ?? 0
                          return s + (parseFloat(v) - exp) * (latestCosts?.[pid] ?? 0)
                        }, 0)
                        return (
                          <tfoot>
                            <tr className="bg-muted/40 border-t-2 border-border font-semibold text-sm">
                              <td colSpan={6} className="px-3 py-2.5">إجمالي الفروقات القيمية</td>
                              <td className={cn('px-3 py-2.5', totalDiffValue >= 0 ? 'text-success' : 'text-danger')}>
                                {(totalDiffValue >= 0 ? '+' : '') + formatNumber(totalDiffValue)} ر.س
                              </td>
                            </tr>
                          </tfoot>
                        )
                      })()}
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
