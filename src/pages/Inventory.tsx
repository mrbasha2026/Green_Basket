import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { useEarliestInventory, useInventoryRange, useInventoryDaily, useUpsertInventory, useDeleteInventory } from '@/hooks/useInventory'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { useSalesByRange } from '@/hooks/useSales'
import { useWasteByRange } from '@/hooks/useWaste'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useProducts } from '@/hooks/useProducts'
import { exportToExcel } from '@/lib/excel'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'
import { AlertTriangle, Search, FileDown, Trash2, Pencil } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

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

function firstOfMonth() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function prevDay(s: string) {
  const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
const DISABLED = '9999-01-01'

export default function Inventory() {
  // ── Tab 1: Balance ─────────────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(todayISO())
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null)
  const [appliedTo, setAppliedTo] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLowStock, setFilterLowStock] = useState(false)

  // ── Tab 2: Movements ──────────────────────────────────────────────────────
  const [reportFrom, setReportFrom] = useState(firstOfMonth())
  const [reportTo, setReportTo] = useState(todayISO())
  const [reportProduct, setReportProduct] = useState('')
  const [reportType, setReportType] = useState('')
  const [reportCategory, setReportCategory] = useState('')
  const [appliedRFrom, setAppliedRFrom] = useState<string | null>(null)
  const [appliedRTo, setAppliedRTo] = useState<string | null>(null)

  // ── Tab 3: جرد (Physical count) ─────────────────────────────────────────
  const [jardDate, setJardDate] = useState(todayISO())
  const [jardEditId, setJardEditId] = useState<string | null>(null)
  const [jardEditQty, setJardEditQty] = useState('')
  const [jardInputs, setJardInputs] = useState<Record<string, string>>({})


  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleBalanceSearch() {
    if (!fromDate || !toDate) return
    setAppliedFrom(fromDate); setAppliedTo(toDate)
  }
  function handleMovSearch() {
    if (!reportFrom || !reportTo) return
    setAppliedRFrom(reportFrom); setAppliedRTo(reportTo)
  }
  async function handleSaveJardNew() {
    const rows = Object.entries(jardInputs)
      .filter(([, v]) => v !== '' && parseFloat(v) >= 0)
      .map(([pid, v]) => {
        const qty = parseFloat(v)
        const wac = latestCosts?.[pid] ?? 0
        return {
          product_id: pid, date: jardDate,
          opening_stock_kg: qty, opening_cost_per_kg: wac,
          purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0,
          closing_stock_kg: qty, weighted_avg_cost: wac,
        }
      })
    if (rows.length === 0) { toast.error('أدخل كمية واحدة على الأقل'); return }
    try {
      await upsertInventory(rows)
      toast.success(`تم حفظ ${rows.length} صنف`)
      setJardInputs({})
    } catch { toast.error('حدث خطأ') }
  }

  async function handleDeleteJard(product_id: string) {
    try {
      await deleteInventory({ product_id, date: jardDate })
      toast.success('تم الحذف')
    } catch { toast.error('حدث خطأ') }
  }

  async function handleUpdateJard(product_id: string) {
    const qty = parseFloat(jardEditQty)
    if (isNaN(qty) || qty < 0) return
    const wac = latestCosts?.[product_id] ?? 0
    try {
      await upsertInventory([{
        product_id, date: jardDate,
        opening_stock_kg: qty, opening_cost_per_kg: wac,
        purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0,
        closing_stock_kg: qty, weighted_avg_cost: wac,
      }])
      toast.success('تم التعديل')
      setJardEditId(null); setJardEditQty('')
    } catch { toast.error('حدث خطأ') }
  }

  // ── Query dates ───────────────────────────────────────────────────────────
  const qFrom = appliedFrom ?? DISABLED; const qTo = appliedTo ?? DISABLED
  const dayBefore = appliedFrom ? prevDay(appliedFrom) : DISABLED
  const rFrom = appliedRFrom ?? DISABLED; const rTo = appliedRTo ?? DISABLED

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { data: earliest, isLoading: eL } = useEarliestInventory()
  const { data: products } = useProducts()
  const { mutateAsync: upsertInventory, isPending: isSaving } = useUpsertInventory()
  const { mutateAsync: deleteInventory } = useDeleteInventory()
  const { data: jardExisting } = useInventoryDaily(jardDate)

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

  // ── Compute opening balance map ───────────────────────────────────────────
  const openingMap = useMemo<Record<string, { stock: number; wac: number }>>(() => {
    if (!appliedFrom) return {}
    const result: Record<string, { stock: number; wac: number }> = {}
    earliest?.forEach(inv => { result[inv.product_id] = { stock: inv.opening_stock_kg, wac: inv.weighted_avg_cost } })
    const allIds = new Set([
      ...(earliest?.map(i => i.product_id) ?? []),
      ...(purchasesBefore?.map(p => p.product_id) ?? []),
      ...(salesBefore?.map(s => s.product_id) ?? []),
      ...(wasteBefore?.map(w => w.product_id) ?? []),
    ])
    allIds.forEach(pid => {
      const base = result[pid] ?? { stock: 0, wac: 0 }
      const baseDate = earliest?.find(i => i.product_id === pid)?.date ?? '2000-01-01'
      const purch = (purchasesBefore ?? []).filter(p => p.product_id === pid && p.date >= baseDate)
      const sale = (salesBefore ?? []).filter(s => s.product_id === pid && s.date >= baseDate)
      const wst = (wasteBefore ?? []).filter(w => w.product_id === pid && w.date >= baseDate)
      const pw = purch.reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
      const pc = purch.reduce((s, p) => s + (p.total_cost ?? p.cartons_qty * p.price_per_carton), 0)
      const sk = sale.reduce((s, s2) => s + s2.qty_kg, 0)
      const wk = wst.reduce((s, w) => s + w.waste_kg, 0)
      const closing = Math.max(0, base.stock + pw - sk - wk)
      const ti = base.stock + pw
      result[pid] = { stock: closing, wac: ti > 0 ? (base.stock * base.wac + pc) / ti : base.wac }
    })
    return result
  }, [appliedFrom, earliest, purchasesBefore, salesBefore, wasteBefore])

  // ── Inventory balance ─────────────────────────────────────────────────────
  const inventoryBalance = useMemo<InventoryBalance[]>(() => {
    if (!appliedFrom) return []
    const ids = new Set([
      ...Object.keys(openingMap),
      ...(purchases?.map(p => p.product_id) ?? []),
      ...(salesData?.map(s => s.product_id) ?? []),
      ...(wasteData?.map(w => w.product_id) ?? []),
    ])
    return Array.from(ids).map(pid => {
      const ob = openingMap[pid] ?? { stock: 0, wac: 0 }
      const pw = (purchases ?? []).filter(p => p.product_id === pid).reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
      const pc = (purchases ?? []).filter(p => p.product_id === pid).reduce((s, p) => s + (p.total_cost ?? p.cartons_qty * p.price_per_carton), 0)
      const sk = (salesData ?? []).filter(s => s.product_id === pid).reduce((s, s2) => s + s2.qty_kg, 0)
      const wk = (wasteData ?? []).filter(w => w.product_id === pid).reduce((s, w) => s + w.waste_kg, 0)
      const closing = Math.max(0, ob.stock + pw - sk - wk)
      const ti = ob.stock + pw
      const wac = ti > 0 ? (ob.stock * ob.wac + pc) / ti : ob.wac
      const product = products?.find(p => p.id === pid) ?? (purchases ?? []).find(p => p.product_id === pid)?.product ?? (salesData ?? []).find(s => s.product_id === pid)?.product
      return { product_id: pid, product, opening_stock_kg: ob.stock, purchased_weight: pw, sales_kg: sk, waste_kg: wk, closing_stock_kg: closing, weighted_avg_cost: wac, stock_value: closing * wac }
    }).filter(b => b.opening_stock_kg > 0 || b.purchased_weight > 0)
      .sort((a, b) => (a.product?.name_ar ?? '').localeCompare(b.product?.name_ar ?? ''))
  }, [appliedFrom, openingMap, purchases, salesData, wasteData, products])

  const filteredBalance = useMemo(() => {
    let d = inventoryBalance
    if (filterCategory) d = d.filter(b => b.product?.category === filterCategory)
    if (filterLowStock) d = d.filter(b => b.closing_stock_kg < 10)
    return d
  }, [inventoryBalance, filterCategory, filterLowStock])

  const lowStock = useMemo(() => inventoryBalance.filter(b => b.closing_stock_kg > 0 && b.closing_stock_kg < 10), [inventoryBalance])
  const totalStockValue = useMemo(() => inventoryBalance.reduce((s, b) => s + b.stock_value, 0), [inventoryBalance])

  // ── Movement rows ─────────────────────────────────────────────────────────
  const movements = useMemo<MovementRow[]>(() => {
    if (!appliedRFrom) return []
    const rows: MovementRow[] = []

    // رصيد افتتاحي من inventory_daily — أي سجل له رصيد افتتاحي
    ;(invRange ?? []).forEach(i => {
      if (i.opening_stock_kg > 0) {
        const prod = products?.find(p => p.id === i.product_id) ?? i.product
        rows.push({ id: `inv_${i.id}`, date: i.date, product_id: i.product_id, product_name: prod?.name_ar ?? '—', category: prod?.category ?? '', type: 'افتتاحي', qty: i.opening_stock_kg, cost_per_unit: i.weighted_avg_cost, total: i.opening_stock_kg * i.weighted_avg_cost })
      }
    })
    // مشتريات
    ;(movPurchases ?? []).forEach(p => {
      rows.push({ id: `p_${p.id}`, date: p.date, product_id: p.product_id, product_name: p.product?.name_ar ?? '—', category: p.product?.category ?? '', type: 'شراء', qty: p.total_weight ?? p.cartons_qty * p.weight_per_carton, cost_per_unit: p.cost_per_kg, total: p.total_cost ?? p.cartons_qty * p.price_per_carton })
    })
    // مبيعات
    ;(movSales ?? []).forEach(s => {
      rows.push({ id: `s_${s.id}`, date: s.date, product_id: s.product_id, product_name: s.product?.name_ar ?? '—', category: s.product?.category ?? '', type: 'بيع', qty: s.qty_kg, cost_per_unit: s.price_per_kg, total: s.total_amount })
    })
    // هدر
    ;(movWaste ?? []).forEach(w => {
      const wac = latestCosts?.[w.product_id] ?? 0
      rows.push({ id: `w_${w.id}`, date: w.date, product_id: w.product_id, product_name: w.product?.name_ar ?? '—', category: w.product?.category ?? '', type: 'هدر', qty: w.waste_kg, cost_per_unit: wac, total: w.waste_kg * wac })
    })

    return rows.filter(r => {
      if (reportProduct && r.product_id !== reportProduct) return false
      if (reportType && r.type !== reportType) return false
      if (reportCategory && r.category !== reportCategory) return false
      return true
    }).sort((a, b) => b.date.localeCompare(a.date) || a.product_name.localeCompare(b.product_name))
  }, [appliedRFrom, invRange, movPurchases, movSales, movWaste, latestCosts, products, reportProduct, reportType, reportCategory])


  // ── Columns ───────────────────────────────────────────────────────────────
  const balCols = useMemo<ColumnDef<InventoryBalance>[]>(() => [
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorFn: r => r.product?.category ?? '', id: 'category', header: 'الفئة' },
    { accessorKey: 'opening_stock_kg', header: 'أول المدة', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'purchased_weight', header: '+ مشتريات', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-success">{formatNumber(v)}</span> : '—' } },
    { accessorKey: 'sales_kg', header: '− مبيعات', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-danger">{formatNumber(v)}</span> : '—' } },
    { accessorKey: 'waste_kg', header: '− هدر', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-warning">{formatNumber(v)}</span> : '—' } },
    { accessorKey: 'closing_stock_kg', header: 'رصيد المخزون', cell: ({ getValue }) => { const v = getValue() as number; return <span className={cn('font-bold', v <= 0 ? 'text-muted-foreground' : v < 10 ? 'text-danger' : v < 20 ? 'text-warning' : 'text-success')}>{formatNumber(v)}</span> } },
    { accessorKey: 'weighted_avg_cost', header: 'م.و.م', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'stock_value', header: 'القيمة (ر.س)', cell: ({ getValue }) => <span className="font-medium">{formatNumber(getValue() as number)}</span> },
  ], [])

  const movCols = useMemo<ColumnDef<MovementRow>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: 'product_name', header: 'الصنف' },
    { accessorKey: 'category', header: 'الفئة' },
    { accessorKey: 'type', header: 'النوع', cell: ({ getValue }) => {
      const t = getValue() as MovType
      const variant = t === 'شراء' ? 'default' : t === 'بيع' ? 'destructive' : t === 'هدر' ? 'secondary' : 'outline'
      return <Badge variant={variant}>{t}</Badge>
    }},
    { accessorKey: 'qty', header: 'الكمية (كج)', cell: ({ row }) => {
      const v = row.original.qty; const t = row.original.type
      const color = t === 'شراء' || t === 'افتتاحي' ? 'text-success' : t === 'بيع' ? 'text-danger' : 'text-warning'
      return <span className={cn('font-medium', color)}>{formatNumber(v)}</span>
    }},
    { accessorKey: 'cost_per_unit', header: 'السعر/كج', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? formatNumber(v) : '—' } },
    { accessorKey: 'total', header: 'الإجمالي (ر.س)', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="font-medium">{formatNumber(v)}</span> : '—' } },
  ], [])

  // ── Excel exports ─────────────────────────────────────────────────────────
  function exportBalance() {
    exportToExcel(`inventory-balance-${appliedTo}.xlsx`,
      ['الصنف','الفئة','أول المدة','المشتريات','المبيعات','الهدر','رصيد المخزون','م.و.م','القيمة'],
      filteredBalance.map(b => [b.product?.name_ar ?? '', b.product?.category ?? '', b.opening_stock_kg, b.purchased_weight, b.sales_kg, b.waste_kg, b.closing_stock_kg, b.weighted_avg_cost, b.stock_value])
    )
  }

  function exportMovements() {
    exportToExcel(`inventory-movements-${appliedRFrom}-${appliedRTo}.xlsx`,
      ['التاريخ','الصنف','الفئة','النوع','الكمية(كج)','السعر/كج','الإجمالي'],
      movements.map(m => [m.date, m.product_name, m.category, m.type, m.qty, m.cost_per_unit, m.total])
    )
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="current">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="current">رصيد المخزون</TabsTrigger>
            <TabsTrigger value="movement">حركات المخزون</TabsTrigger>
            <TabsTrigger value="jard">جرد المخزون</TabsTrigger>
          </TabsList>
        </div>

        {/* ── Tab 1: Balance ──────────────────────────────────────────────── */}
        <TabsContent value="current">
          <div className="space-y-6 mt-4">
            <Card><CardContent className="pt-5">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1"><Label>من</Label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" dir="ltr" /></div>
                <div className="space-y-1"><Label>إلى</Label><Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" dir="ltr" /></div>
                <Button onClick={handleBalanceSearch} className="gap-2"><Search className="w-4 h-4" /> عرض</Button>
              </div>
            </CardContent></Card>

            {!appliedFrom && <p className="text-center py-12 text-muted-foreground text-sm">حدد الفترة واضغط <strong>عرض</strong></p>}

            {appliedFrom && (
              <>
                {lowStock.length > 0 && (
                  <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-danger mb-1">مخزون منخفض</p>
                      <div className="flex flex-wrap gap-2">
                        {lowStock.map(b => <span key={b.product_id} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded">{b.product?.name_ar} — {formatNumber(b.closing_stock_kg)} كج</span>)}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-4">
                  <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">إجمالي الأصناف</p><p className="text-2xl font-bold">{inventoryBalance.length}</p></CardContent></Card>
                  <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">قيمة المخزون</p><p className="text-2xl font-bold text-primary">{formatNumber(totalStockValue)} <span className="text-sm font-normal">ر.س</span></p></CardContent></Card>
                  <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">أصناف منخفضة</p><p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-danger' : 'text-success'}`}>{lowStock.length}</p></CardContent></Card>
                </div>
                <Card>
                  <CardHeader><CardTitle className="text-base flex items-center justify-between">
                    <span>رصيد المخزون — {formatDate(appliedFrom)} إلى {formatDate(appliedTo!)}</span>
                    <Button variant="outline" size="sm" onClick={exportBalance} className="gap-1"><FileDown className="w-4 h-4" />Excel</Button>
                  </CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                      <Select value={filterCategory} onValueChange={v => setFilterCategory(v ?? '')}>
                        <SelectTrigger className="w-36"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                        <SelectContent><SelectItem value="">كل الفئات</SelectItem><SelectItem value="خضار">خضار</SelectItem><SelectItem value="فاكهة">فاكهة</SelectItem><SelectItem value="أعشاب">أعشاب</SelectItem></SelectContent>
                      </Select>
                      <Button variant={filterLowStock ? 'default' : 'outline'} size="sm" onClick={() => setFilterLowStock(v => !v)}>⚠️ منخفض فقط</Button>
                      {(filterCategory || filterLowStock) && <Button variant="ghost" size="sm" onClick={() => { setFilterCategory(''); setFilterLowStock(false) }} className="text-muted-foreground">مسح</Button>}
                    </div>
                    {isBalLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                      : filteredBalance.length === 0 ? <p className="text-center py-10 text-sm text-muted-foreground">لا توجد بيانات — أدخل الرصيد الافتتاحي أو أضف مشتريات</p>
                        : <DataTable data={filteredBalance} columns={balCols} searchPlaceholder="بحث عن صنف..." rowClassName={row => row.closing_stock_kg > 0 && row.closing_stock_kg < 10 ? 'bg-danger/5' : ''} />}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── Tab 2: Movements ────────────────────────────────────────────── */}
        <TabsContent value="movement">
          <div className="space-y-6 mt-4">
            <Card><CardContent className="pt-5">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1"><Label>من</Label><Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-40" dir="ltr" /></div>
                <div className="space-y-1"><Label>إلى</Label><Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-40" dir="ltr" /></div>
                <div className="space-y-1"><Label>الصنف</Label>
                  <Select value={reportProduct} onValueChange={v => setReportProduct(v ?? '')}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
                    <SelectContent><SelectItem value="">كل الأصناف</SelectItem>{products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>الفئة</Label>
                  <Select value={reportCategory} onValueChange={v => setReportCategory(v ?? '')}>
                    <SelectTrigger className="w-32"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                    <SelectContent><SelectItem value="">كل الفئات</SelectItem><SelectItem value="خضار">خضار</SelectItem><SelectItem value="فاكهة">فاكهة</SelectItem><SelectItem value="أعشاب">أعشاب</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1"><Label>النوع</Label>
                  <Select value={reportType} onValueChange={v => setReportType(v ?? '')}>
                    <SelectTrigger className="w-36"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
                    <SelectContent><SelectItem value="">كل الأنواع</SelectItem><SelectItem value="افتتاحي">رصيد افتتاحي</SelectItem><SelectItem value="شراء">مشتريات</SelectItem><SelectItem value="بيع">مبيعات</SelectItem><SelectItem value="هدر">هدر</SelectItem></SelectContent>
                  </Select>
                </div>
                <Button onClick={handleMovSearch} className="gap-2"><Search className="w-4 h-4" /> عرض</Button>
              </div>
            </CardContent></Card>

            {!appliedRFrom && <p className="text-center py-12 text-muted-foreground text-sm">حدد الفترة واضغط <strong>عرض</strong></p>}

            {appliedRFrom && (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center justify-between">
                  <span>حركات المخزون — {formatDate(appliedRFrom)} إلى {formatDate(appliedRTo!)} <span className="text-sm font-normal text-muted-foreground">({movements.length} حركة)</span></span>
                  <Button variant="outline" size="sm" onClick={exportMovements} className="gap-1"><FileDown className="w-4 h-4" />Excel</Button>
                </CardTitle></CardHeader>
                <CardContent>
                  {isMovLoading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                    : movements.length === 0 ? <p className="text-center text-muted-foreground py-10 text-sm">لا توجد حركات في هذه الفترة</p>
                      : <DataTable data={movements} columns={movCols} searchPlaceholder="بحث..." />}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Tab 3: جرد ──────────────────────────────────────────────────── */}
        <TabsContent value="jard">
          <div className="space-y-6 mt-4">
            {/* Date selector */}
            <Card><CardContent className="pt-5">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1">
                  <Label>تاريخ الجرد</Label>
                  <Input type="date" value={jardDate} onChange={e => { setJardDate(e.target.value); setJardInputs({}) }} className="w-44" dir="ltr" />
                </div>
                <p className="text-sm text-muted-foreground pb-1">أدخل الكميات الفعلية لكل صنف في المخزن وقت الجرد</p>
              </div>
            </CardContent></Card>

            {/* Saved جرد records for this date */}
            {(jardExisting ?? []).length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center justify-between">
                  <span>سجلات الجرد المحفوظة — {formatDate(jardDate)}</span>
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => exportToExcel(`jard-${jardDate}.xlsx`,
                    ['الصنف','الكمية (كج)','التكلفة/كج','القيمة'],
                    (jardExisting ?? []).map(j => [j.product?.name_ar ?? j.product_id, j.opening_stock_kg, j.weighted_avg_cost, j.opening_stock_kg * j.weighted_avg_cost])
                  )}><FileDown className="w-4 h-4" />Excel</Button>
                </CardTitle></CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-border bg-muted/50">
                        {['الصنف','الفئة','الكمية (كج)','التكلفة/كج','القيمة',''].map(h => (
                          <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {(jardExisting ?? []).map(j => (
                          <tr key={j.product_id} className="border-b last:border-b-0 border-border/50">
                            <td className="px-3 py-2 font-medium">{j.product?.name_ar ?? j.product_id}</td>
                            <td className="px-3 py-2 text-muted-foreground"><Badge variant="outline" className="text-xs">{j.product?.category}</Badge></td>
                            <td className="px-3 py-2">
                              {jardEditId === j.product_id ? (
                                <Input type="number" min="0" step="0.01" value={jardEditQty} onChange={e => setJardEditQty(e.target.value)} className="w-24 text-sm" dir="ltr" autoFocus />
                              ) : <span className="font-medium">{formatNumber(j.opening_stock_kg)}</span>}
                            </td>
                            <td className="px-3 py-2">{formatNumber(j.weighted_avg_cost)}</td>
                            <td className="px-3 py-2">{formatNumber(j.opening_stock_kg * j.weighted_avg_cost)}</td>
                            <td className="px-3 py-2">
                              {jardEditId === j.product_id ? (
                                <div className="flex gap-1">
                                  <Button size="sm" onClick={() => handleUpdateJard(j.product_id)} disabled={isSaving}>حفظ</Button>
                                  <Button size="sm" variant="ghost" onClick={() => { setJardEditId(null); setJardEditQty('') }}>إلغاء</Button>
                                </div>
                              ) : (
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setJardEditId(j.product_id); setJardEditQty(String(j.opening_stock_kg)) }}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:text-danger" onClick={() => handleDeleteJard(j.product_id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* New جرد input */}
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center justify-between">
                <span>إدخال جرد جديد — {formatDate(jardDate)}</span>
                <Button size="sm" onClick={handleSaveJardNew} disabled={isSaving}>
                  {isSaving ? 'جاري الحفظ...' : 'حفظ الجرد'}
                </Button>
              </CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border bg-muted/50">
                      {['الصنف','الفئة','الكمية الفعلية (كج)','م.و.م'].map(h => (
                        <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {(products ?? []).map(p => {
                        const existing = (jardExisting ?? []).find(j => j.product_id === p.id)
                        if (existing) return null
                        return (
                          <tr key={p.id} className="border-b last:border-b-0 border-border/50">
                            <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                            <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                            <td className="px-3 py-2">
                              <Input type="number" min="0" step="0.01" placeholder="0"
                                value={jardInputs[p.id] ?? ''}
                                onChange={e => setJardInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                                className="w-28 text-sm" dir="ltr" />
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{formatNumber(latestCosts?.[p.id] ?? 0)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

    </div>
  )
}
