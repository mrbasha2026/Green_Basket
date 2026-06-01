import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { useEarliestInventory, useUpsertInventory } from '@/hooks/useInventory'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { useSalesByRange } from '@/hooks/useSales'
import { useWasteByRange } from '@/hooks/useWaste'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useProducts } from '@/hooks/useProducts'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Product } from '@/types'
import { cn } from '@/lib/utils'
import { AlertTriangle, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

// ── Types ─────────────────────────────────────────────────────────────────────
interface InventoryBalance {
  product_id: string
  product?: Product
  opening_stock_kg: number
  purchased_weight: number
  sales_kg: number
  waste_kg: number
  closing_stock_kg: number
  weighted_avg_cost: number
  stock_value: number
}

interface MovementRow {
  id: string
  date: string
  product_id: string
  product_name: string
  type: 'شراء' | 'بيع' | 'هدر'
  qty: number
  cost_per_unit: number
  total: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function firstOfMonth() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function prevDay(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

// Placeholder date used to effectively disable a query (far future = no data)
const DISABLED_DATE = '9999-01-01'

export default function Inventory() {
  // ── Tab 1: Balance inputs & applied values ────────────────────────────────
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(todayISO())
  const [appliedFrom, setAppliedFrom] = useState<string | null>(null)
  const [appliedTo, setAppliedTo] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterLowStock, setFilterLowStock] = useState(false)

  // ── Tab 2: Movement inputs & applied values ───────────────────────────────
  const [reportFrom, setReportFrom] = useState(firstOfMonth())
  const [reportTo, setReportTo] = useState(todayISO())
  const [reportProduct, setReportProduct] = useState('')
  const [appliedReportFrom, setAppliedReportFrom] = useState<string | null>(null)
  const [appliedReportTo, setAppliedReportTo] = useState<string | null>(null)
  const [appliedReportProduct, setAppliedReportProduct] = useState('')

  // ── Opening balance dialog ─────────────────────────────────────────────────
  const [openingDialog, setOpeningDialog] = useState(false)
  const [openingDate, setOpeningDate] = useState(firstOfMonth())
  const [openingBalances, setOpeningBalances] = useState<Record<string, { qty: string; cost: string }>>({})

  // ── Search handlers ────────────────────────────────────────────────────────
  function handleBalanceSearch() {
    if (!fromDate || !toDate) return
    setAppliedFrom(fromDate)
    setAppliedTo(toDate)
  }

  function handleMovementSearch() {
    if (!reportFrom || !reportTo) return
    setAppliedReportFrom(reportFrom)
    setAppliedReportTo(reportTo)
    setAppliedReportProduct(reportProduct)
  }

  // ── Query dates (disabled when null) ──────────────────────────────────────
  const qFrom = appliedFrom ?? DISABLED_DATE
  const qTo = appliedTo ?? DISABLED_DATE
  const dayBeforeFrom = appliedFrom ? prevDay(appliedFrom) : DISABLED_DATE
  const rFrom = appliedReportFrom ?? DISABLED_DATE
  const rTo = appliedReportTo ?? DISABLED_DATE

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: earliestInventory, isLoading: earliestLoading } = useEarliestInventory()
  const { data: products } = useProducts()
  const { mutateAsync: upsertInventory, isPending: isSaving } = useUpsertInventory()

  // Pre-period data (to compute opening balance)
  const { data: purchasesBefore, isLoading: pbLoading } = usePurchasesByRange('2000-01-01', dayBeforeFrom)
  const { data: salesBefore, isLoading: sbLoading } = useSalesByRange('2000-01-01', dayBeforeFrom)
  const { data: wasteBefore, isLoading: wbLoading } = useWasteByRange('2000-01-01', dayBeforeFrom)

  // Period data
  const { data: purchases, isLoading: pLoading } = usePurchasesByRange(qFrom, qTo)
  const { data: salesData, isLoading: sLoading } = useSalesByRange(qFrom, qTo)
  const { data: wasteData, isLoading: wLoading } = useWasteByRange(qFrom, qTo)

  // Movement report data
  const { data: movPurchases, isLoading: mpLoading } = usePurchasesByRange(rFrom, rTo)
  const { data: movSales, isLoading: msLoading } = useSalesByRange(rFrom, rTo)
  const { data: movWaste, isLoading: mwLoading } = useWasteByRange(rFrom, rTo)
  const { data: latestCosts } = useLatestPurchaseCosts(appliedReportTo ?? todayISO())

  const isBalanceLoading = !!appliedFrom && (earliestLoading || pbLoading || sbLoading || wbLoading || pLoading || sLoading || wLoading)
  const isMovLoading = !!appliedReportFrom && (mpLoading || msLoading || mwLoading)

  // ── Compute رصيد أول المدة ─────────────────────────────────────────────────
  const openingBalanceMap = useMemo<Record<string, { stock: number; wac: number }>>(() => {
    if (!appliedFrom) return {}
    const result: Record<string, { stock: number; wac: number }> = {}

    // Seed with manually-entered opening balances
    earliestInventory?.forEach(inv => {
      result[inv.product_id] = { stock: inv.opening_stock_kg, wac: inv.weighted_avg_cost }
    })

    // All product IDs with any pre-period activity
    const allIds = new Set<string>([
      ...(earliestInventory?.map(i => i.product_id) ?? []),
      ...(purchasesBefore?.map(p => p.product_id) ?? []),
      ...(salesBefore?.map(s => s.product_id) ?? []),
      ...(wasteBefore?.map(w => w.product_id) ?? []),
    ])

    allIds.forEach(pid => {
      const base = result[pid] ?? { stock: 0, wac: 0 }
      const baseDate = earliestInventory?.find(i => i.product_id === pid)?.date ?? '2000-01-01'

      // Only transactions after (or on) the opening balance date
      const purch = (purchasesBefore ?? []).filter(p => p.product_id === pid && p.date >= baseDate)
      const sales = (salesBefore ?? []).filter(s => s.product_id === pid && s.date >= baseDate)
      const waste = (wasteBefore ?? []).filter(w => w.product_id === pid && w.date >= baseDate)

      const pw = purch.reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
      const pc = purch.reduce((s, p) => s + (p.total_cost ?? p.cartons_qty * p.price_per_carton), 0)
      const sk = sales.reduce((s, s2) => s + s2.qty_kg, 0)
      const wk = waste.reduce((s, w) => s + w.waste_kg, 0)

      const closing = Math.max(0, base.stock + pw - sk - wk)
      const totalIn = base.stock + pw
      const wac = totalIn > 0 ? (base.stock * base.wac + pc) / totalIn : base.wac

      result[pid] = { stock: closing, wac }
    })

    return result
  }, [appliedFrom, earliestInventory, purchasesBefore, salesBefore, wasteBefore])

  // ── Inventory balance (period) ─────────────────────────────────────────────
  const inventoryBalance = useMemo<InventoryBalance[]>(() => {
    if (!appliedFrom) return []

    const productIds = new Set<string>([
      ...Object.keys(openingBalanceMap),
      ...(purchases?.map(p => p.product_id) ?? []),
      ...(salesData?.map(s => s.product_id) ?? []),
      ...(wasteData?.map(w => w.product_id) ?? []),
    ])

    return Array.from(productIds).map(pid => {
      const ob = openingBalanceMap[pid] ?? { stock: 0, wac: 0 }
      const pw = (purchases ?? []).filter(p => p.product_id === pid).reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
      const pc = (purchases ?? []).filter(p => p.product_id === pid).reduce((s, p) => s + (p.total_cost ?? p.cartons_qty * p.price_per_carton), 0)
      const sk = (salesData ?? []).filter(s => s.product_id === pid).reduce((s, s2) => s + s2.qty_kg, 0)
      const wk = (wasteData ?? []).filter(w => w.product_id === pid).reduce((s, w) => s + w.waste_kg, 0)

      const closing = Math.max(0, ob.stock + pw - sk - wk)
      const totalIn = ob.stock + pw
      const wac = totalIn > 0 ? (ob.stock * ob.wac + pc) / totalIn : ob.wac

      const product = products?.find(p => p.id === pid)
        ?? (purchases ?? []).find(p => p.product_id === pid)?.product
        ?? (salesData ?? []).find(s => s.product_id === pid)?.product
        ?? (wasteData ?? []).find(w => w.product_id === pid)?.product

      return { product_id: pid, product, opening_stock_kg: ob.stock, purchased_weight: pw, sales_kg: sk, waste_kg: wk, closing_stock_kg: closing, weighted_avg_cost: wac, stock_value: closing * wac }
    })
      .filter(b => b.opening_stock_kg > 0 || b.purchased_weight > 0)
      .sort((a, b) => (a.product?.name_ar ?? '').localeCompare(b.product?.name_ar ?? ''))
  }, [appliedFrom, openingBalanceMap, purchases, salesData, wasteData, products])

  const filteredBalance = useMemo(() => {
    let data = inventoryBalance
    if (filterCategory) data = data.filter(b => b.product?.category === filterCategory)
    if (filterLowStock) data = data.filter(b => b.closing_stock_kg < 10)
    return data
  }, [inventoryBalance, filterCategory, filterLowStock])

  const lowStock = useMemo(() => inventoryBalance.filter(b => b.closing_stock_kg > 0 && b.closing_stock_kg < 10), [inventoryBalance])
  const totalStockValue = useMemo(() => inventoryBalance.reduce((s, b) => s + b.stock_value, 0), [inventoryBalance])

  // ── Movement rows (purchases + sales + waste combined) ────────────────────
  const movements = useMemo<MovementRow[]>(() => {
    if (!appliedReportFrom) return []
    const rows: MovementRow[] = []

    ;(movPurchases ?? []).forEach(p => {
      if (appliedReportProduct && p.product_id !== appliedReportProduct) return
      rows.push({
        id: `p_${p.id}`, date: p.date, product_id: p.product_id,
        product_name: p.product?.name_ar ?? '—',
        type: 'شراء',
        qty: p.total_weight ?? p.cartons_qty * p.weight_per_carton,
        cost_per_unit: p.cost_per_kg,
        total: p.total_cost ?? p.cartons_qty * p.price_per_carton,
      })
    })

    ;(movSales ?? []).forEach(s => {
      if (appliedReportProduct && s.product_id !== appliedReportProduct) return
      rows.push({
        id: `s_${s.id}`, date: s.date, product_id: s.product_id,
        product_name: s.product?.name_ar ?? '—',
        type: 'بيع',
        qty: s.qty_kg,
        cost_per_unit: s.price_per_kg,
        total: s.total_amount,
      })
    })

    ;(movWaste ?? []).forEach(w => {
      if (appliedReportProduct && w.product_id !== appliedReportProduct) return
      const wac = latestCosts?.[w.product_id] ?? 0
      rows.push({
        id: `w_${w.id}`, date: w.date, product_id: w.product_id,
        product_name: w.product?.name_ar ?? '—',
        type: 'هدر',
        qty: w.waste_kg,
        cost_per_unit: wac,
        total: w.waste_kg * wac,
      })
    })

    return rows.sort((a, b) => b.date.localeCompare(a.date) || a.product_name.localeCompare(b.product_name))
  }, [appliedReportFrom, movPurchases, movSales, movWaste, latestCosts, appliedReportProduct])

  // ── Columns ────────────────────────────────────────────────────────────────
  const balanceColumns = useMemo<ColumnDef<InventoryBalance>[]>(() => [
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorFn: r => r.product?.category ?? '', id: 'category', header: 'الفئة' },
    { accessorKey: 'opening_stock_kg', header: 'مخزون أول المدة', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'purchased_weight', header: '+ مشتريات', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-success">{formatNumber(v)}</span> : '—' } },
    { accessorKey: 'sales_kg', header: '− مبيعات', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-danger">{formatNumber(v)}</span> : '—' } },
    { accessorKey: 'waste_kg', header: '− هدر', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="text-warning">{formatNumber(v)}</span> : '—' } },
    {
      accessorKey: 'closing_stock_kg', header: 'رصيد المخزون',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={cn('font-bold', v <= 0 ? 'text-muted-foreground' : v < 10 ? 'text-danger' : v < 20 ? 'text-warning' : 'text-success')}>{formatNumber(v)}</span>
      },
    },
    { accessorKey: 'weighted_avg_cost', header: 'WAC (ر.س)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'stock_value', header: 'قيمة المخزون', cell: ({ getValue }) => <span className="font-medium">{formatNumber(getValue() as number)}</span> },
  ], [])

  const movColumns = useMemo<ColumnDef<MovementRow>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorKey: 'product_name', header: 'الصنف' },
    {
      accessorKey: 'type', header: 'النوع',
      cell: ({ getValue }) => {
        const t = getValue() as string
        return <Badge variant={t === 'شراء' ? 'default' : t === 'بيع' ? 'destructive' : 'secondary'}>{t}</Badge>
      },
    },
    {
      accessorKey: 'qty', header: 'الكمية (كج)',
      cell: ({ row }) => {
        const v = row.original.qty
        const color = row.original.type === 'شراء' ? 'text-success' : row.original.type === 'بيع' ? 'text-danger' : 'text-warning'
        return <span className={cn('font-medium', color)}>{formatNumber(v)}</span>
      },
    },
    { accessorKey: 'cost_per_unit', header: 'السعر/كج', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? formatNumber(v) : '—' } },
    { accessorKey: 'total', header: 'الإجمالي (ر.س)', cell: ({ getValue }) => { const v = getValue() as number; return v > 0 ? <span className="font-medium">{formatNumber(v)}</span> : '—' } },
  ], [])

  // ── Opening balance save ───────────────────────────────────────────────────
  async function handleSaveOpening() {
    const rows = Object.entries(openingBalances)
      .filter(([, v]) => parseFloat(v.qty) > 0)
      .map(([pid, v]) => {
        const qty = parseFloat(v.qty) || 0
        const cost = parseFloat(v.cost) || 0
        return { product_id: pid, date: openingDate, opening_stock_kg: qty, opening_cost_per_kg: cost, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: cost }
      })
    if (rows.length === 0) { toast.error('أدخل كمية واحدة على الأقل'); return }
    try {
      await upsertInventory(rows)
      toast.success('تم حفظ الرصيد الافتتاحي')
      setOpeningDialog(false)
      setOpeningBalances({})
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <Tabs defaultValue="current">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="current">رصيد المخزون</TabsTrigger>
            <TabsTrigger value="movement">حركات المخزون</TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => { setOpeningDate(fromDate); setOpeningBalances({}); setOpeningDialog(true) }}>
            إدخال رصيد افتتاحي
          </Button>
        </div>

        {/* ── Tab 1: Balance ───────────────────────────────────────────────── */}
        <TabsContent value="current">
          <div className="space-y-6 mt-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1">
                    <Label>من (بداية الفترة)</Label>
                    <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label>إلى</Label>
                    <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" dir="ltr" />
                  </div>
                  <Button onClick={handleBalanceSearch} className="gap-2">
                    <Search className="w-4 h-4" /> عرض
                  </Button>
                </div>
              </CardContent>
            </Card>

            {!appliedFrom && (
              <div className="text-center py-16 text-muted-foreground text-sm">
                حدد الفترة واضغط <strong>عرض</strong> لحساب رصيد المخزون
              </div>
            )}

            {appliedFrom && (
              <>
                {lowStock.length > 0 && (
                  <div className="bg-danger/10 border border-danger/30 rounded-lg p-4 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-danger mb-1">مخزون منخفض — أقل من 10 كج</p>
                      <div className="flex flex-wrap gap-2">
                        {lowStock.map(b => (
                          <span key={b.product_id} className="text-xs bg-danger/15 text-danger px-2 py-1 rounded">
                            {b.product?.name_ar} — {formatNumber(b.closing_stock_kg)} كج
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <Card><CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">إجمالي الأصناف</p>
                    <p className="text-2xl font-bold">{inventoryBalance.length}</p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">قيمة المخزون</p>
                    <p className="text-2xl font-bold text-primary">{formatNumber(totalStockValue)} <span className="text-sm font-normal">ر.س</span></p>
                  </CardContent></Card>
                  <Card><CardContent className="pt-5">
                    <p className="text-sm text-muted-foreground">أصناف تحت الحد الأدنى</p>
                    <p className={`text-2xl font-bold ${lowStock.length > 0 ? 'text-danger' : 'text-success'}`}>{lowStock.length}</p>
                  </CardContent></Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      رصيد المخزون — {formatDate(appliedFrom)} إلى {formatDate(appliedTo!)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
                      <Select value={filterCategory} onValueChange={v => setFilterCategory(v ?? '')}>
                        <SelectTrigger className="w-36"><SelectValue placeholder="كل الفئات" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">كل الفئات</SelectItem>
                          <SelectItem value="خضار">خضار</SelectItem>
                          <SelectItem value="فاكهة">فاكهة</SelectItem>
                          <SelectItem value="أعشاب">أعشاب</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant={filterLowStock ? 'default' : 'outline'} size="sm" onClick={() => setFilterLowStock(v => !v)} className="gap-2">
                        ⚠️ مخزون منخفض فقط
                      </Button>
                      {(filterCategory || filterLowStock) && (
                        <Button variant="ghost" size="sm" onClick={() => { setFilterCategory(''); setFilterLowStock(false) }} className="text-muted-foreground">مسح</Button>
                      )}
                    </div>
                    {isBalanceLoading ? (
                      <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                    ) : filteredBalance.length === 0 ? (
                      <p className="text-center py-10 text-sm text-muted-foreground">لا توجد بيانات — أدخل الرصيد الافتتاحي أو أضف مشتريات</p>
                    ) : (
                      <DataTable data={filteredBalance} columns={balanceColumns} searchPlaceholder="بحث عن صنف..."
                        rowClassName={(row) => row.closing_stock_kg < 10 && row.closing_stock_kg > 0 ? 'bg-danger/5' : ''} />
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── Tab 2: Movements ─────────────────────────────────────────────── */}
        <TabsContent value="movement">
          <div className="space-y-6 mt-4">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="space-y-1">
                    <Label>من</Label>
                    <Input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} className="w-40" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label>إلى</Label>
                    <Input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} className="w-40" dir="ltr" />
                  </div>
                  <div className="space-y-1">
                    <Label>الصنف</Label>
                    <Select value={reportProduct} onValueChange={v => setReportProduct(v ?? '')}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">كل الأصناف</SelectItem>
                        {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleMovementSearch} className="gap-2">
                    <Search className="w-4 h-4" /> عرض
                  </Button>
                </div>
              </CardContent>
            </Card>

            {!appliedReportFrom && (
              <div className="text-center py-16 text-muted-foreground text-sm">
                حدد الفترة واضغط <strong>عرض</strong> لعرض حركات المخزون
              </div>
            )}

            {appliedReportFrom && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    حركات المخزون — {formatDate(appliedReportFrom)} إلى {formatDate(appliedReportTo!)}
                    <span className="text-sm font-normal text-muted-foreground mr-2">({movements.length} حركة)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isMovLoading ? (
                    <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                  ) : movements.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10 text-sm">لا توجد حركات في هذه الفترة</p>
                  ) : (
                    <DataTable data={movements} columns={movColumns} searchPlaceholder="بحث..." />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Opening Balance Dialog ──────────────────────────────────────────── */}
      <Dialog open={openingDialog} onOpenChange={setOpeningDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>إدخال الرصيد الافتتاحي</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>تاريخ الرصيد الافتتاحي</Label>
            <Input type="date" value={openingDate} onChange={e => setOpeningDate(e.target.value)} className="w-44" dir="ltr" />
          </div>
          <p className="text-xs text-muted-foreground">أدخل كميات الأصناف الموجودة في المخزن في هذا التاريخ</p>
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-popover">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">الصنف</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">الكمية (كج)</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">التكلفة/كج</th>
                </tr>
              </thead>
              <tbody>
                {products?.map(p => (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                    <td className="px-3 py-2">
                      <Input type="number" min="0" step="0.01" placeholder="0"
                        value={openingBalances[p.id]?.qty ?? ''}
                        onChange={e => setOpeningBalances(prev => ({ ...prev, [p.id]: { qty: e.target.value, cost: prev[p.id]?.cost ?? '' } }))}
                        className="w-28 text-sm" dir="ltr" />
                    </td>
                    <td className="px-3 py-2">
                      <Input type="number" min="0" step="0.01" placeholder="0"
                        value={openingBalances[p.id]?.cost ?? ''}
                        onChange={e => setOpeningBalances(prev => ({ ...prev, [p.id]: { qty: prev[p.id]?.qty ?? '', cost: e.target.value } }))}
                        className="w-28 text-sm" dir="ltr" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={handleSaveOpening} disabled={isSaving} className="w-full">
            {isSaving ? 'جاري الحفظ...' : `حفظ الرصيد الافتتاحي — ${formatDate(openingDate)}`}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
