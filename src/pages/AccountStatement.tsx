import { useState, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { Combobox } from '@/components/ui/combobox'
import { useSalesByRange } from '@/hooks/useSales'
import { usePurchasesByRange } from '@/hooks/usePurchases'
import { useAllCustomers } from '@/hooks/useCustomers'
import { useSuppliers } from '@/hooks/useSuppliers'
import { useProducts } from '@/hooks/useProducts'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { exportToExcel } from '@/lib/excel'
import { cn } from '@/lib/utils'
import { FileDown, Printer, Users, Truck, Search, ShoppingCart, TrendingUp, Package, Trash2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Link } from 'react-router-dom'

function getMonthStart() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

type PartyType = 'customer' | 'supplier'

interface StatementRow {
  date: string
  invoice: string
  type: string
  product: string
  qty: number
  amount: number
  isReturn: boolean
}

export default function AccountStatement() {
  const [partyType, setPartyType] = useState<PartyType>('customer')
  const [partyId, setPartyId] = useState('')
  const [fromDate, setFromDate] = useState(getMonthStart())
  const [toDate, setToDate] = useState(todayISO())
  const [productFilter, setProductFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [applied, setApplied] = useState(false)
  const printRef = useRef<HTMLDivElement>(null)

  const { data: customers } = useAllCustomers()
  const { data: suppliers } = useSuppliers()
  const { data: products } = useProducts()

  const DISABLED = '9999-01-01'
  const EPOCH    = '2000-01-01'

  const qFrom = applied && partyId ? fromDate : DISABLED
  const qTo   = applied && partyId ? toDate   : DISABLED

  // يوم قبل الفترة المختارة لاحتساب الرصيد الافتتاحي
  const dayBefore = useMemo(() => {
    if (!applied || !partyId) return DISABLED
    const d = new Date(fromDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  }, [applied, partyId, fromDate])

  const { data: sales,           isLoading: sLoading } = useSalesByRange(qFrom, qTo)
  const { data: purchases,       isLoading: pLoading } = usePurchasesByRange(qFrom, qTo)
  const { data: salesBefore    }                        = useSalesByRange(applied && partyId ? EPOCH : DISABLED, dayBefore)
  const { data: purchasesBefore}                        = usePurchasesByRange(applied && partyId ? EPOCH : DISABLED, dayBefore)

  const isLoading = sLoading || pLoading

  const rows = useMemo<StatementRow[]>(() => {
    if (!applied || !partyId) return []
    const result: StatementRow[] = []

    if (partyType === 'customer') {
      ;(sales ?? []).filter(s => s.customer_id === partyId && (!productFilter || s.product_id === productFilter))
        .forEach(s => {
          const isReturn = s.transaction_type === 'مرتجع_مبيعات'
          result.push({
            date: s.date,
            invoice: s.invoice_number ?? '—',
            type: isReturn ? 'مرتجع مبيعات' : 'بيع',
            product: s.product?.name_ar ?? '—',
            qty: s.qty_kg,
            amount: s.total_amount * (isReturn ? -1 : 1),
            isReturn,
          })
        })
    } else {
      ;(purchases ?? []).filter(p => p.supplier_id === partyId && (!productFilter || p.product_id === productFilter))
        .forEach(p => {
          const isReturn = p.transaction_type === 'مرتجع_مشتريات'
          result.push({
            date: p.date,
            invoice: p.invoice_number ?? '—',
            type: isReturn ? 'مرتجع مشتريات' : 'شراء',
            product: p.product?.name_ar ?? '—',
            qty: p.total_weight ?? p.cartons_qty * p.weight_per_carton,
            amount: p.total_cost * (isReturn ? -1 : 1),
            isReturn,
          })
        })
    }

    return result
      .filter(r => !typeFilter || r.type === typeFilter)
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [applied, partyId, partyType, sales, purchases, productFilter, typeFilter])

  // الرصيد الافتتاحي = مجموع الحركات قبل الفترة المختارة
  const openingBalance = useMemo(() => {
    if (!applied || !partyId) return 0
    if (partyType === 'customer') {
      return (salesBefore ?? [])
        .filter(s => s.customer_id === partyId)
        .reduce((sum, s) => sum + s.total_amount * (s.transaction_type === 'مرتجع_مبيعات' ? -1 : 1), 0)
    } else {
      return (purchasesBefore ?? [])
        .filter(p => p.supplier_id === partyId)
        .reduce((sum, p) => sum + p.total_cost * (p.transaction_type === 'مرتجع_مشتريات' ? -1 : 1), 0)
    }
  }, [applied, partyId, partyType, salesBefore, purchasesBefore])

  // Running balance — يبدأ من الرصيد الافتتاحي
  const rowsWithBalance = useMemo(() => {
    let balance = openingBalance
    return rows.map(r => { balance += r.amount; return { ...r, balance } })
  }, [rows, openingBalance])

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows])

  const partyName = partyType === 'customer'
    ? customers?.find(c => c.id === partyId)?.name_ar ?? ''
    : suppliers?.find(s => s.id === partyId)?.name_ar ?? ''

  const customerOptions = (customers ?? []).map(c => ({ value: c.id, label: c.name_ar }))
  const supplierOptions = (suppliers ?? []).map(s => ({ value: s.id, label: s.name_ar }))
  const productOptions = (products ?? []).map(p => ({ value: p.id, label: p.name_ar }))

  function handleExportExcel() {
    exportToExcel(`كشف-حساب-${partyName}-${fromDate}.xlsx`,
      ['التاريخ', 'الفاتورة', 'النوع', 'الصنف', 'الكمية (كج)', 'المبلغ (ر.س)', 'الرصيد (ر.س)'],
      rowsWithBalance.map(r => [r.date, r.invoice, r.type, r.product, r.qty, r.amount, r.balance])
    )
    toast.success('تم تصدير Excel')
  }

  function handlePrint() {
    const el = printRef.current; if (!el) return
    const site = (() => { try { return JSON.parse(localStorage.getItem('gb_site_settings') ?? '{}') } catch { return {} } })()
    const w = window.open('', '_blank', 'width=900,height=700'); if (!w) return
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>كشف حساب</title><style>
      body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:20px;direction:rtl;color:#111}
      table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;text-align:right;border:1px solid #ddd}
      th{background:#f5f5f5;font-weight:bold}.positive{color:#16a34a}.negative{color:#dc2626}
    </style></head><body>
      <div style="background:#16a34a;color:#fff;padding:10px 14px;margin-bottom:16px;border-radius:6px">
        <p style="font-weight:bold;font-size:16px;margin:0">${site.name || 'Greenbasket'} — كشف حساب</p>
        <p style="font-size:11px;margin:3px 0 0">${partyType === 'customer' ? 'العميل' : 'المورد'}: ${partyName} | الفترة: ${fromDate} — ${toDate}</p>
      </div>
      ${el.innerHTML}
    </body></html>`)
    w.document.close(); setTimeout(() => { w.print(); w.close() }, 300)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">كشف الحساب</h1>
          <p className="text-sm text-muted-foreground">حركات العميل أو المورد مع الرصيد المتراكم</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { to: '/purchases', label: 'مشتريات', icon: ShoppingCart, color: 'bg-blue-500/10 text-blue-600 border-blue-200 hover:bg-blue-500/20' },
            { to: '/sales', label: 'مبيعات', icon: TrendingUp, color: 'bg-success/10 text-success border-success/20 hover:bg-success/20' },
            { to: '/waste', label: 'هدر', icon: Trash2, color: 'bg-warning/10 text-warning border-warning/20 hover:bg-warning/20' },
            { to: '/inventory', label: 'مخزون', icon: Package, color: 'bg-muted/60 text-foreground border-border hover:bg-muted' },
          ].map(a => (
            <Link key={a.to} to={a.to} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors ${a.color}`}>
              <a.icon className="w-3.5 h-3.5" />{a.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          {/* Party type toggle */}
          <div className="flex rounded-xl overflow-hidden border border-border w-fit">
            {([['customer', 'عملاء', Users], ['supplier', 'موردون', Truck]] as const).map(([v, l, Icon]) => (
              <button key={v} onClick={() => { setPartyType(v); setPartyId(''); setApplied(false) }}
                className={cn('flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors',
                  partyType === v ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted')}>
                <Icon className="w-4 h-4" />{l}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1 min-w-52">
              <Label className="text-xs">{partyType === 'customer' ? 'اختر العميل' : 'اختر المورد'} <span className="text-danger">*</span></Label>
              <Combobox
                options={partyType === 'customer' ? customerOptions : supplierOptions}
                value={partyId}
                onValueChange={v => { setPartyId(v); setApplied(false) }}
                placeholder={partyType === 'customer' ? 'اختر عميلاً...' : 'اختر مورداً...'}
              />
            </div>
            <div className="space-y-1 min-w-40">
              <Label className="text-xs">فلتر الصنف</Label>
              <Combobox options={[{ value: '', label: 'كل الأصناف' }, ...productOptions]} value={productFilter} onValueChange={setProductFilter} placeholder="كل الأصناف" />
            </div>
            <div className="space-y-1 min-w-36">
              <Label className="text-xs">نوع المعاملة</Label>
              <Select value={typeFilter} onValueChange={v => setTypeFilter(v ?? '')}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="كل الأنواع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">كل الأنواع</SelectItem>
                  {partyType === 'customer' ? (
                    <>
                      <SelectItem value="بيع">مبيعات</SelectItem>
                      <SelectItem value="مرتجع مبيعات">مرتجعات مبيعات</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="شراء">مشتريات</SelectItem>
                      <SelectItem value="مرتجع مشتريات">مرتجعات مشتريات</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الفترة</Label>
              <QuickDateFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} />
            </div>
            <Button className="gap-1.5 h-9" onClick={() => { if (!partyId) { toast.error('اختر عميلاً أو مورداً'); return } setApplied(true) }}>
              <Search className="w-3.5 h-3.5" />عرض
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {applied && partyId && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">{partyType === 'customer' ? 'إجمالي المبيعات' : 'إجمالي المشتريات'}</p>
              <p className="text-xl font-bold text-primary">{formatNumber(rows.filter(r => !r.isReturn).reduce((s, r) => s + r.amount, 0))} ر.س</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">المرتجعات</p>
              <p className="text-xl font-bold text-warning">{formatNumber(Math.abs(rows.filter(r => r.isReturn).reduce((s, r) => s + r.amount, 0)))} ر.س</p>
            </CardContent></Card>
            <Card><CardContent className="pt-4">
              <p className="text-xs text-muted-foreground mb-1">الصافي</p>
              <p className={cn('text-xl font-bold', totalAmount >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(totalAmount)} ر.س</p>
            </CardContent></Card>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportExcel}><FileDown className="w-3.5 h-3.5" />Excel</Button>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}><Printer className="w-3.5 h-3.5" />طباعة</Button>
          </div>

          {/* Statement table */}
          {isLoading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{partyType === 'customer' ? 'العميل' : 'المورد'}: <span className="text-primary">{partyName}</span> — {formatDate(fromDate)} إلى {formatDate(toDate)}</CardTitle>
              </CardHeader>
              <CardContent>
                <div ref={printRef} className="max-h-[600px] overflow-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/40">
                      <tr className="border-b border-border">
                        {['#', 'التاريخ', 'الفاتورة', 'النوع', 'الصنف', 'الكمية (كج)', 'المبلغ (ر.س)', 'الرصيد (ر.س)'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {openingBalance !== 0 && (
                        <tr className="border-b border-border bg-primary/5">
                          <td className="px-3 py-2 text-xs text-muted-foreground">—</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(fromDate)}</td>
                          <td className="px-3 py-2 text-xs" colSpan={4}>
                            <span className="font-medium text-muted-foreground">رصيد افتتاحي (قبل الفترة)</span>
                          </td>
                          <td className="px-3 py-2" />
                          <td className={cn('px-3 py-2 font-bold text-sm', openingBalance >= 0 ? 'text-success' : 'text-danger')}>
                            {formatNumber(openingBalance)}
                          </td>
                        </tr>
                      )}
                      {rowsWithBalance.length === 0 ? (
                        <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground text-sm">لا توجد حركات في هذه الفترة</td></tr>
                      ) : rowsWithBalance.map((row, i) => (
                        <tr key={i} className={cn('border-b border-border/40 hover:bg-muted/20', i % 2 === 1 && 'bg-muted/10', row.isReturn && 'bg-warning/5')}>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(row.date)}</td>
                          <td className="px-3 py-2"><span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{row.invoice}</span></td>
                          <td className="px-3 py-2">
                            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', row.isReturn ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success')}>{row.type}</span>
                          </td>
                          <td className="px-3 py-2 font-medium text-sm">{row.product}</td>
                          <td className="px-3 py-2 text-xs">{formatNumber(row.qty)}</td>
                          <td className={cn('px-3 py-2 font-semibold text-sm', row.amount >= 0 ? 'text-primary' : 'text-warning')}>{formatNumber(row.amount)}</td>
                          <td className={cn('px-3 py-2 font-bold text-sm', row.balance >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(row.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {rowsWithBalance.length > 0 && (
                      <tfoot>
                        <tr className="bg-muted/40 border-t-2 border-border">
                          <td colSpan={6} className="px-3 py-2.5 font-semibold text-sm">الإجمالي</td>
                          <td className={cn('px-3 py-2.5 font-bold text-base', totalAmount >= 0 ? 'text-primary' : 'text-warning')}>{formatNumber(totalAmount)}</td>
                          <td className={cn('px-3 py-2.5 font-bold text-base', totalAmount >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(totalAmount)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {!applied && (
        <div className="text-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <p className="text-sm">اختر {partyType === 'customer' ? 'عميلاً' : 'مورداً'} ثم اضغط <strong>عرض</strong></p>
        </div>
      )}
    </div>
  )
}
