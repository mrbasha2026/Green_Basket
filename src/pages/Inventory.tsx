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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DataTable } from '@/components/tables/DataTable'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { Combobox } from '@/components/ui/combobox'
import { StocktakeSection } from '@/components/inventory/StocktakeSection'
import { useApprovedStocktakeItems } from '@/hooks/useStocktake'
import { useEarliestInventory, useInventoryRange, useInventoryDaily, useInventoryUpTo, useUpsertInventory, useDeleteInventory } from '@/hooks/useInventory'
import { usePurchasesByRange, useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useSalesByRange } from '@/hooks/useSales'
import { useWasteByRange } from '@/hooks/useWaste'
import { useAllProducts, useUpsertProduct, useDeleteProduct, useToggleProductActive } from '@/hooks/useProducts'
import { useProducts } from '@/hooks/useProducts'
import { exportToExcel } from '@/lib/excel'
import { formatNumber, formatDate, todayISO, getChartStyle } from '@/lib/utils'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'
import { AlertTriangle, FileDown, Trash2, Pencil, Package, BarChart2, TrendingDown, Layers, Search, ClipboardList, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ── Types ──────────────────────────────────────────────────────────────────────
interface InventoryBalance {
  product_id: string; product?: Product
  opening_stock_kg: number; purchased_weight: number; sales_kg: number
  waste_kg: number; closing_stock_kg: number; weighted_avg_cost: number; stock_value: number
}
type MovType = 'شراء' | 'بيع' | 'هدر' | 'افتتاحي' | 'مرتجع مشتريات' | 'مرتجع مبيعات' | 'جرد'
interface MovementRow {
  id: string; date: string; product_id: string; product_name: string
  category: string; type: MovType; qty: number; cost_per_unit: number; total: number
}
type Section = 'overview' | 'balance' | 'movements' | 'jard' | 'products' | 'opening_balance'

function firstOfMonth() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function prevDay(s: string) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
const DISABLED = '9999-01-01'
const PIE_COLORS = ['#16a34a', '#2563eb', '#f59e0b', '#dc2626']

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
  const { data: movStocktake, isLoading: stL } = useApprovedStocktakeItems(rFrom, rTo)
  const { data: latestCosts } = useLatestPurchaseCosts(appliedRTo ?? todayISO())

  const isBalLoading = !!appliedFrom && (eL || pbL || sbL || wbL || pL || sL || wL)
  const isMovLoading = !!appliedRFrom && (mpL || msL || mwL || irL || stL)

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
      const isReturn = p.transaction_type === 'مرتجع_مشتريات'
      rows.push({ id: `p_${p.id}`, date: p.date, product_id: p.product_id, product_name: p.product?.name_ar ?? '—', category: p.product?.category ?? '', type: isReturn ? 'مرتجع مشتريات' : 'شراء', qty: p.total_weight ?? p.cartons_qty * p.weight_per_carton, cost_per_unit: p.cost_per_kg, total: p.total_cost ?? p.cartons_qty * p.price_per_carton })
    })
    ;(movSales ?? []).forEach(s => {
      const isReturn = s.transaction_type === 'مرتجع_مبيعات'
      rows.push({ id: `s_${s.id}`, date: s.date, product_id: s.product_id, product_name: s.product?.name_ar ?? '—', category: s.product?.category ?? '', type: isReturn ? 'مرتجع مبيعات' : 'بيع', qty: s.qty_kg, cost_per_unit: s.price_per_kg, total: s.total_amount })
    })
    ;(movWaste ?? []).forEach(w => {
      const wac = latestCosts?.[w.product_id] ?? 0
      rows.push({ id: `w_${w.id}`, date: w.date, product_id: w.product_id, product_name: w.product?.name_ar ?? '—', category: w.product?.category ?? '', type: 'هدر', qty: w.waste_kg, cost_per_unit: wac, total: w.waste_kg * wac })
    })
    ;(movStocktake ?? []).forEach(st => {
      if (st.actual_qty === null || st.actual_qty === undefined) return
      const wac = latestCosts?.[st.product_id] ?? 0
      const prod = st.product as { name_ar: string; category: string } | undefined
      rows.push({ id: `st_${st.id}`, date: st.session_date, product_id: st.product_id, product_name: prod?.name_ar ?? '—', category: prod?.category ?? '', type: 'جرد', qty: st.actual_qty, cost_per_unit: wac, total: st.actual_qty * wac })
    })
    return rows.filter(r => {
      if (reportProduct && r.product_id !== reportProduct) return false
      if (reportType && r.type !== reportType) return false
      if (reportCategory && r.category !== reportCategory) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date))
  }, [appliedRFrom, invRange, movPurchases, movSales, movWaste, movStocktake, latestCosts, products, reportProduct, reportType, reportCategory])

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
        const cls = t === 'شراء' ? 'bg-primary/15 text-primary' : t === 'بيع' ? 'bg-danger/15 text-danger' : t === 'هدر' ? 'bg-warning/15 text-warning' : t === 'مرتجع مشتريات' ? 'bg-warning/15 text-warning' : t === 'مرتجع مبيعات' ? 'bg-success/15 text-success' : t === 'جرد' ? 'bg-violet-500/15 text-violet-700' : 'bg-muted text-muted-foreground'
        return <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', cls)}>{t}</span>
      }
    },
    {
      accessorKey: 'qty', header: 'الكمية (كج)', cell: ({ row }) => {
        const v = row.original.qty; const t = row.original.type
        const isOut = t === 'بيع' || t === 'هدر' || t === 'مرتجع مشتريات'
        const color = isOut ? 'text-danger' : 'text-primary'
        return <span className={cn('font-semibold', color)}>{isOut ? '−' : '+'}{formatNumber(v)}</span>
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
  const sections: { id: Section; label: string; icon: React.ElementType; badge?: number; group?: string }[] = [
    { id: 'overview', label: 'لوحة المخزون', icon: BarChart2, group: 'عرض' },
    { id: 'balance', label: 'رصيد المخزون', icon: Package, badge: inventoryBalance.length || undefined, group: 'عرض' },
    { id: 'movements', label: 'حركات المخزون', icon: TrendingDown, badge: movements.length || undefined, group: 'عرض' },
    { id: 'jard', label: 'جرد المخزون', icon: ClipboardList, group: 'عرض' },
    { id: 'products', label: 'إدارة الأصناف', icon: Layers, group: 'إدارة' },
    { id: 'opening_balance', label: 'الرصيد الافتتاحي', icon: Plus, group: 'إدارة' },
  ]

  const productOptions = (products ?? []).map(p => ({ value: p.id, label: p.name_ar }))

  return (
    <div className="space-y-4">

      {/* ── Sidebar + Content ──────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '620px' }}>

        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
          {/* Quick actions */}
          <div className="p-3 border-b border-border space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wide">إجراءات سريعة</p>
            <Button size="sm" className="w-full gap-2 justify-start h-8" onClick={() => setActiveSection('jard')}>
              <ClipboardList className="w-3.5 h-3.5" />جرد جديد
            </Button>
            <Button variant="outline" size="sm" className="w-full gap-2 justify-start h-8 text-xs" onClick={() => setActiveSection('products')}>
              <Plus className="w-3.5 h-3.5" />إضافة صنف
            </Button>
            <Button variant="outline" size="sm" className="w-full gap-2 justify-start h-8 text-xs" onClick={() => setActiveSection('opening_balance')}>
              <Layers className="w-3.5 h-3.5" />رصيد افتتاحي
            </Button>
          </div>

          {/* Sections grouped */}
          <div className="flex-1 p-2 overflow-y-auto space-y-3">
            {(['عرض', 'إدارة'] as const).map(group => (
              <div key={group}>
                <p className="text-xs font-semibold text-muted-foreground px-3 py-1.5 uppercase tracking-wide">{group}</p>
                <div className="space-y-0.5">
                  {sections.filter(s => s.group === group).map(s => (
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
              </div>
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
                        {(() => { const cs = getChartStyle(); return (
                        <BarChart data={topStockChart} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={cs.gridStroke} />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: cs.tickColor }} />
                          <YAxis tick={{ fontSize: 10, fill: cs.tickColor }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                          <Tooltip contentStyle={cs.tooltipStyle} formatter={(v: number) => [`${formatNumber(v)} كج`, 'الكمية']} />
                          <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
                        </BarChart>
                        )})()}
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
                            <Tooltip contentStyle={getChartStyle().tooltipStyle} formatter={(v: number) => [`${formatNumber(v)} ر.س`, 'القيمة']} />
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
                  <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
                  <SelectContent><SelectItem value="">كل الأنواع</SelectItem><SelectItem value="افتتاحي">رصيد افتتاحي</SelectItem><SelectItem value="شراء">مشتريات</SelectItem><SelectItem value="مرتجع مشتريات">مرتجع مشتريات</SelectItem><SelectItem value="بيع">مبيعات</SelectItem><SelectItem value="مرتجع مبيعات">مرتجع مبيعات</SelectItem><SelectItem value="هدر">هدر</SelectItem><SelectItem value="جرد">جرد مخزون</SelectItem></SelectContent>
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

          {/* ── Jard (new stocktake sessions) ───────────────────────── */}
          {activeSection === 'jard' && (
            <div className="p-5">
              <StocktakeSection />
            </div>
          )}

          {/* ── Products ────────────────────────────────────────────── */}
          {activeSection === 'products' && (
            <div className="p-5">
              <ProductsSection />
            </div>
          )}

          {/* ── Opening Balance ──────────────────────────────────────── */}
          {activeSection === 'opening_balance' && (
            <div className="p-5">
              <OpeningBalanceSection />
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Products Section ───────────────────────────────────────────────────────────
function ProductsSection() {
  const { data: products } = useAllProducts()
  const { mutateAsync: upsert, isPending } = useUpsertProduct()
  const { mutateAsync: toggleActive } = useToggleProductActive()
  const { mutateAsync: deleteProduct } = useDeleteProduct()
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null)
  const [open, setOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  async function handleSave() {
    if (!editProduct?.name_ar) { toast.error('اسم الصنف مطلوب'); return }
    try { await upsert(editProduct); toast.success('تم الحفظ'); setOpen(false); setEditProduct(null) } catch { toast.error('حدث خطأ') }
  }

  const filtered = (products ?? []).filter(p => {
    if (!showInactive && !p.is_active) return false
    if (search) return p.name_ar.includes(search) || (p.name_en ?? '').toLowerCase().includes(search.toLowerCase())
    return true
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 w-40 text-sm" />
          <button onClick={() => setShowInactive(v => !v)} className={cn('text-xs px-3 py-1.5 rounded-lg border transition-colors', showInactive ? 'bg-muted text-foreground border-border' : 'bg-background text-muted-foreground border-border hover:bg-muted')}>
            {showInactive ? 'إخفاء الموقوفة' : 'إظهار الموقوفة'}
          </button>
          <span className="text-xs text-muted-foreground">{filtered.length} صنف</span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => { setEditProduct({ name_ar: '', name_en: '', category: 'خضار', is_active: true }); setOpen(true) }}>
          <Plus className="w-3.5 h-3.5" />إضافة صنف
        </Button>
      </div>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditProduct(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{editProduct?.id ? 'تعديل صنف' : 'إضافة صنف جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>الاسم بالعربية <span className="text-danger">*</span></Label>
              <Input value={editProduct?.name_ar ?? ''} onChange={e => setEditProduct(p => ({ ...p, name_ar: e.target.value }))} /></div>
            <div className="space-y-1"><Label>الاسم بالإنجليزية</Label>
              <Input value={String(editProduct?.name_en ?? '')} onChange={e => setEditProduct(p => ({ ...p, name_en: e.target.value }))} dir="ltr" /></div>
            <div className="space-y-1"><Label>الفئة</Label>
              <Select value={editProduct?.category ?? 'خضار'} onValueChange={v => v && setEditProduct(p => ({ ...p, category: v as Product['category'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="خضار">خضار</SelectItem><SelectItem value="فاكهة">فاكهة</SelectItem><SelectItem value="أعشاب">أعشاب</SelectItem></SelectContent>
              </Select></div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleSave} disabled={isPending} className="flex-1">{isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>تعطيل الصنف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم تعطيل الصنف ولن يظهر في الفواتير الجديدة. السجلات القديمة لن تتأثر.</p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={async () => { if (deleteId) { await deleteProduct(deleteId); toast.success('تم تعطيل الصنف'); setDeleteId(null) } }}>تعطيل</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border overflow-hidden max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40 z-10">
            <tr className="border-b border-border">
              {['الاسم','الإنجليزية','الفئة','الحالة','إجراءات'].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={p.id} className={cn('border-b border-border/50 hover:bg-muted/20', i % 2 === 1 && 'bg-muted/10', !p.is_active && 'opacity-60')}>
                <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs" dir="ltr">{p.name_en ?? '—'}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleActive({ id: p.id, is_active: !p.is_active })}
                    className={cn('text-xs px-2 py-0.5 rounded font-medium transition-colors', p.is_active ? 'bg-success/15 text-success hover:bg-success/25' : 'bg-muted text-muted-foreground hover:bg-muted/80')}>
                    {p.is_active ? 'نشط' : 'موقوف'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditProduct({ id: p.id, name_ar: p.name_ar, name_en: p.name_en ?? '', category: p.category }); setOpen(true) }}><Pencil className="w-3 h-3" /></Button>
                    {p.is_active && <Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10" onClick={() => setDeleteId(p.id)}><Trash2 className="w-3 h-3" /></Button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Opening Balance Section ────────────────────────────────────────────────────
function OpeningBalanceSection() {
  const { data: prods } = useProducts()
  const { data: latestCosts } = useLatestPurchaseCosts()
  const [date, setDate] = useState(() => { const d = new Date(todayISO() + 'T12:00:00'); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })
  const [balances, setBalances] = useState<Record<string, { qty: string; cost: string }>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(''); const [editCost, setEditCost] = useState('')
  const { data: existing } = useInventoryDaily(date)
  const { mutateAsync: upsertInv, isPending: isSaving } = useUpsertInventory()
  const { mutateAsync: del } = useDeleteInventory()

  async function handleSave() {
    const rows = Object.entries(balances).filter(([, v]) => parseFloat(v.qty) > 0).map(([pid, v]) => {
      const qty = parseFloat(v.qty) || 0; const cost = parseFloat(v.cost) || (latestCosts?.[pid] ?? 0)
      return { product_id: pid, date, opening_stock_kg: qty, opening_cost_per_kg: cost, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: cost }
    })
    if (rows.length === 0) { toast.error('أدخل كمية واحدة على الأقل'); return }
    try { await upsertInv(rows); toast.success(`تم حفظ ${rows.length} صنف`); setBalances({}) } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4 p-4 bg-muted/30 rounded-xl border border-border">
        <div className="space-y-1"><Label className="text-xs">تاريخ الرصيد الافتتاحي</Label>
          <Input type="date" value={date} onChange={e => { setDate(e.target.value); setBalances({}) }} className="w-44 h-9" dir="ltr" /></div>
        <p className="text-xs text-muted-foreground pb-1">يُدخل مرة واحدة في بداية استخدام النظام</p>
      </div>

      {(existing ?? []).length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">الأرصدة المحفوظة — {formatDate(date)}</CardTitle></CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead><tr className="bg-muted/30 border-b border-border">{['الصنف','الفئة','الكمية (كج)','التكلفة/كج',''].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
                <tbody>
                  {(existing ?? []).map(j => (
                    <tr key={j.product_id} className="border-b last:border-b-0 border-border/50">
                      <td className="px-3 py-2 font-medium">{j.product?.name_ar ?? j.product_id}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{j.product?.category}</Badge></td>
                      <td className="px-3 py-2">{editId === j.product_id ? <Input type="number" min="0" step="0.01" value={editQty} onChange={e => setEditQty(e.target.value)} className="w-24 h-8 text-sm" dir="ltr" autoFocus /> : <span className="font-semibold">{formatNumber(j.opening_stock_kg)}</span>}</td>
                      <td className="px-3 py-2">{editId === j.product_id ? <Input type="number" min="0" step="0.01" value={editCost} onChange={e => setEditCost(e.target.value)} className="w-24 h-8 text-sm" dir="ltr" /> : formatNumber(j.weighted_avg_cost)}</td>
                      <td className="px-3 py-2">
                        {editId === j.product_id
                          ? <div className="flex gap-1"><Button size="sm" className="h-7" onClick={async () => { const qty = parseFloat(editQty); const cost = parseFloat(editCost); if (isNaN(qty)) return; await upsertInv([{ product_id: j.product_id, date, opening_stock_kg: qty, opening_cost_per_kg: cost||0, purchased_weight:0, purchase_cost:0, waste_kg:0, sales_kg:0, closing_stock_kg:qty, weighted_avg_cost:cost||0 }]); toast.success('تم'); setEditId(null) }} disabled={isSaving}>حفظ</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => setEditId(null)}>إلغاء</Button></div>
                          : <div className="flex gap-1"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditId(j.product_id); setEditQty(String(j.opening_stock_kg)); setEditCost(String(j.weighted_avg_cost)) }}><Pencil className="w-3.5 h-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10" onClick={() => del({ product_id: j.product_id, date }).then(() => toast.success('تم الحذف'))}><Trash2 className="w-3.5 h-3.5" /></Button></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card><CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">إضافة أصناف جديدة</CardTitle>
        <Button size="sm" className="h-8 gap-1.5" onClick={handleSave} disabled={isSaving}>{isSaving ? 'جاري الحفظ...' : 'حفظ الأرصدة'}</Button>
      </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/30 border-b border-border">{['الصنف','الفئة','الكمية (كج)','التكلفة/كج'].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>
                {(prods ?? []).map(p => {
                  if ((existing ?? []).some(j => j.product_id === p.id)) return null
                  return (
                    <tr key={p.id} className="border-b last:border-b-0 border-border/50">
                      <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                      <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                      <td className="px-3 py-2"><Input type="number" min="0" step="0.01" placeholder="0" value={balances[p.id]?.qty ?? ''} onChange={e => setBalances(prev => ({ ...prev, [p.id]: { ...prev[p.id], qty: e.target.value, cost: prev[p.id]?.cost ?? String(latestCosts?.[p.id] ?? '') } }))} className="w-28 h-8 text-sm" dir="ltr" /></td>
                      <td className="px-3 py-2"><Input type="number" min="0" step="0.01" placeholder={String(latestCosts?.[p.id] ?? '0')} value={balances[p.id]?.cost ?? ''} onChange={e => setBalances(prev => ({ ...prev, [p.id]: { ...prev[p.id], cost: e.target.value, qty: prev[p.id]?.qty ?? '' } }))} className="w-28 h-8 text-sm" dir="ltr" /></td>
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
