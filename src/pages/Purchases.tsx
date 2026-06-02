import { useState, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { StepWizard } from '@/components/forms/StepWizard'
import { DataTable } from '@/components/tables/DataTable'
import { useProducts } from '@/hooks/useProducts'
import { usePurchases, useUpsertPurchases, useDeletePurchase } from '@/hooks/usePurchases'
import { calcCostPerKg } from '@/lib/calculations'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Purchase, PurchaseFormRow } from '@/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { exportToExcel, downloadTemplate, parseExcelFile } from '@/lib/excel'
import { FileDown, Upload, Printer, Trash2 } from 'lucide-react'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'

// ── Invoice Preview Component ─────────────────────────────────────────────────
function PurchaseInvoicePreview({
  rows, products, date, invoiceType, transportCost,
}: {
  rows: PurchaseFormRow[]
  products: import('@/types').Product[]
  date: string
  invoiceType: 'مع_فاتورة' | 'بدون_فاتورة'
  transportCost: number
}) {
  const site = (() => { try { return JSON.parse(localStorage.getItem('gb_site_settings') ?? '{}') } catch { return {} } })()
  const subtotal = rows.reduce((s, r) => s + r.cartons_qty * r.price_per_carton, 0)
  const grandTotal = subtotal + transportCost

  function handlePrint() {
    const el = document.getElementById('purchase-invoice-print')
    if (!el) return
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) return
    w.document.write(`
      <html dir="rtl"><head><meta charset="utf-8">
      <style>
        body { font-family: Tahoma, Arial, sans-serif; font-size: 12px; margin: 20px; direction: rtl; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 7px 10px; text-align: right; border: 1px solid #ddd; }
        th { background: #f5f5f5; font-weight: bold; }
        .header { display: flex; justify-content: space-between; margin-bottom: 16px; padding: 12px; border: 2px solid #16a34a; border-radius: 6px; }
        .totals td { border: none; }
        .totals .grand { font-weight: bold; font-size: 14px; color: #16a34a; border-top: 2px solid #16a34a; }
        @media print { @page { size: A4; margin: 15mm; } }
      </style></head><body>
      ${el.innerHTML}
      </body></html>
    `)
    w.document.close()
    w.focus()
    setTimeout(() => { w.print(); w.close() }, 300)
  }

  return (
    <div className="space-y-4">
      {/* Invoice */}
      <div id="purchase-invoice-print" className="border-2 border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-primary/5 border-b border-border p-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            {site.logo && <img src={site.logo} alt="logo" className="w-12 h-12 object-contain rounded-lg" />}
            <div>
              <p className="font-bold text-base text-foreground">{site.name || 'Greenbasket'}</p>
              {site.phone && <p className="text-xs text-muted-foreground">{site.phone}</p>}
              {site.address && <p className="text-xs text-muted-foreground">{site.address}</p>}
            </div>
          </div>
          <div className="text-left">
            <p className="text-lg font-bold text-primary">فاتورة مشتريات</p>
            <p className="text-sm text-muted-foreground mt-1">التاريخ: {formatDate(date)}</p>
            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', invoiceType === 'مع_فاتورة' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning')}>
              {invoiceType === 'مع_فاتورة' ? 'مع فاتورة' : 'بدون فاتورة'}
            </span>
          </div>
        </div>

        {/* Items table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                {['#','الصنف','كراتين','وزن/كرتون (كج)','السعر/كرتون (ر.س)','الوزن الكلي (كج)','الإجمالي (ر.س)'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const product = products.find(p => p.id === r.product_id)
                const lineCost = r.cartons_qty * r.price_per_carton
                const lineWeight = r.cartons_qty * r.weight_per_carton
                return (
                  <tr key={i} className={cn('border-b border-border/50', i % 2 === 1 ? 'bg-muted/20' : '')}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{product?.name_ar}</td>
                    <td className="px-3 py-2">{formatNumber(r.cartons_qty)}</td>
                    <td className="px-3 py-2">{formatNumber(r.weight_per_carton)}</td>
                    <td className="px-3 py-2">{formatNumber(r.price_per_carton)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatNumber(lineWeight)}</td>
                    <td className="px-3 py-2 font-semibold text-foreground">{formatNumber(lineCost)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-border bg-muted/20 p-4">
          <div className="flex justify-end">
            <div className="w-64 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span className="font-medium">{formatNumber(subtotal)} ر.س</span>
              </div>
              {transportCost > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">مصاريف النقل</span>
                  <span className="font-medium">{formatNumber(transportCost)} ر.س</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 font-bold text-base">
                <span>الإجمالي الكلي</span>
                <span className="text-primary">{formatNumber(grandTotal)} ر.س</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print button */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="gap-2" onClick={handlePrint}>
          <Printer className="w-4 h-4" /> طباعة الفاتورة
        </Button>
      </div>
    </div>
  )
}

const emptyRow = (): PurchaseFormRow => ({
  product_id: '',
  cartons_qty: 0,
  price_per_carton: 0,
  weight_per_carton: 0,
  waste_kg: 0,
})

export default function Purchases() {
  const [step, setStep] = useState(0)
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [invoiceType, setInvoiceType] = useState<'مع_فاتورة' | 'بدون_فاتورة'>('مع_فاتورة')
  const [transportCost, setTransportCost] = useState(0)
  const [rows, setRows] = useState<PurchaseFormRow[]>([emptyRow()])
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterInvoice, setFilterInvoice] = useState('')
  const [importDialog, setImportDialog] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  const { data: products } = useProducts()
  const { data: purchases, isLoading } = usePurchases()
  const { mutateAsync: upsert, isPending } = useUpsertPurchases()
  const { mutateAsync: deletePurchase, isPending: isDeleting } = useDeletePurchase()

  async function handleDownloadTemplate() {
    await downloadTemplate('purchases-template.xlsx',
      ['اسم الصنف','كراتين','السعر/كرتون','وزن/كرتون(كج)'],
      [['طماطم','10','50','15'],['خيار','5','40','12']]
    )
  }

  function findProduct(name: string) {
    const n = name.trim().toLowerCase()
    return products?.find(p =>
      p.name_ar.trim().toLowerCase() === n ||
      (p.name_en ?? '').trim().toLowerCase() === n
    )
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !products) return
    setIsImporting(true)
    try {
      const parsed = await parseExcelFile(file)
      const valid = parsed.filter(r => r['اسم الصنف'] && r['كراتين'])
      if (valid.length === 0) { toast.error('لا توجد بيانات صالحة في الملف'); return }

      const unmatched = valid.filter(r => !findProduct(String(r['اسم الصنف'] ?? '')))
      if (unmatched.length > 0) {
        toast.warning(`لم يُطابَق ${unmatched.length} صنف: ${unmatched.map(r => r['اسم الصنف']).join('، ')}`)
      }

      const toInsert = valid.flatMap(r => {
        const productName = String(r['اسم الصنف'] ?? '')
        const prod = findProduct(productName)
        if (!prod) return []
        const cartons = Number(r['كراتين'] ?? 0)
        const price = Number(r['السعر/كرتون'] ?? 0)
        const weight = Number(r['وزن/كرتون(كج)'] ?? 0)
        return [{
          product_id: prod.id,
          date: selectedDate,
          cartons_qty: cartons, price_per_carton: price, weight_per_carton: weight,
          waste_kg: 0,
          cost_per_kg: calcCostPerKg(cartons * price, cartons * weight, 0),
          source: 'web' as const, notes: invoiceType,
        }]
      })
      if (toInsert.length === 0) { toast.error('لم يُطابَق أي صنف — تأكد من الأسماء'); return }
      await upsert(toInsert)
      toast.success(`تم استيراد ${toInsert.length} سجل`)
      setImportDialog(false)
    } catch { toast.error('حدث خطأ أثناء الاستيراد') }
    finally { setIsImporting(false); if (importRef.current) importRef.current.value = '' }
  }

  function updateRow(i: number, field: keyof PurchaseFormRow, value: string | number) {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  function addRow() {
    setRows(prev => [...prev, emptyRow()])
  }

  function removeRow(i: number) {
    setRows(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.product_id && r.cartons_qty > 0)
    if (valid.length === 0) {
      toast.error('أضف صنفاً واحداً على الأقل')
      return
    }
    try {
      const totalWeight = valid.reduce((s, r) => s + r.cartons_qty * r.weight_per_carton, 0)
      await upsert(valid.map(r => {
        const weight = r.cartons_qty * r.weight_per_carton
        const cost = r.cartons_qty * r.price_per_carton
        const transportShare = totalWeight > 0 ? (weight / totalWeight) * transportCost : 0
        return {
          product_id: r.product_id,
          date: selectedDate,
          cartons_qty: r.cartons_qty,
          price_per_carton: r.price_per_carton,
          weight_per_carton: r.weight_per_carton,
          waste_kg: 0,
          cost_per_kg: calcCostPerKg(cost + transportShare, weight, 0),
          source: 'web' as const,
          notes: invoiceType,
        }
      }))
      toast.success('تم حفظ المشتريات بنجاح')
      setStep(0)
      setRows([emptyRow()])
      setTransportCost(0)
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  const filteredPurchases = useMemo(() => {
    let data = purchases ?? []
    if (filterProduct) data = data.filter(p => p.product_id === filterProduct)
    if (filterSource) data = data.filter(p => p.source === filterSource)
    if (filterDateFrom) data = data.filter(p => p.date >= filterDateFrom)
    if (filterDateTo) data = data.filter(p => p.date <= filterDateTo)
    if (filterInvoice) data = data.filter(p => p.notes === filterInvoice)
    return data
  }, [purchases, filterProduct, filterSource, filterDateFrom, filterDateTo, filterInvoice])

  const columns = useMemo<ColumnDef<Purchase>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.product?.name_ar ?? r.product_id, header: 'الصنف', id: 'product' },
    { accessorKey: 'cartons_qty', header: 'كراتين', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'price_per_carton', header: 'السعر/كرتون', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_cost', header: 'إجمالي التكلفة', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_weight', header: 'إجمالي الوزن (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'cost_per_kg', header: 'تكلفة/كج', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'source', header: 'المصدر', cell: ({ getValue }) => getValue() === 'web' ? 'يدوي' : 'Sheets' },
    {
      id: 'invoice',
      header: 'الفاتورة',
      cell: ({ row }) => {
        if (row.original.source !== 'web') return <span className="text-muted-foreground">—</span>
        return row.original.notes === 'مع_فاتورة' ? (
          <span className="text-xs bg-success/15 text-success px-2 py-0.5 rounded">مع فاتورة</span>
        ) : row.original.notes === 'بدون_فاتورة' ? (
          <span className="text-xs bg-warning/15 text-warning px-2 py-0.5 rounded">بدون فاتورة</span>
        ) : <span className="text-muted-foreground">—</span>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost" size="icon"
          className="h-7 w-7 text-danger hover:text-danger hover:bg-danger/10"
          onClick={() => setDeleteId(row.original.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      ),
    },
  ], [setDeleteId])

  const hasFilters = filterDateFrom || filterDateTo || filterProduct || filterSource || filterInvoice

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إدخال مشتريات جديدة</CardTitle>
        </CardHeader>
        <CardContent>
          <StepWizard
            currentStep={step}
            onNext={() => setStep(s => s + 1)}
            onBack={() => setStep(s => s - 1)}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
            canNext={step === 0 ? !!selectedDate : rows.some(r => r.product_id && r.cartons_qty > 0)}
            steps={[
              {
                label: 'اختيار التاريخ',
                component: (
                  <div className="space-y-4 max-w-sm">
                    <div className="space-y-2">
                      <Label>تاريخ الشراء</Label>
                      <Input
                        type="date"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        dir="ltr"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>نوع الشراء</Label>
                      <div className="flex gap-2">
                        {(['مع_فاتورة', 'بدون_فاتورة'] as const).map(t => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setInvoiceType(t)}
                            className={cn(
                              'flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',
                              invoiceType === t
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border bg-background text-muted-foreground hover:bg-muted/60'
                            )}
                          >
                            {t === 'مع_فاتورة' ? 'مع فاتورة' : 'بدون فاتورة'}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>مصاريف النقل (ر.س) — تُوزَّع على الأصناف بنسبة الوزن</Label>
                      <Input
                        type="number" min="0" step="0.01" placeholder="0"
                        value={transportCost || ''}
                        onChange={e => setTransportCost(parseFloat(e.target.value) || 0)}
                        dir="ltr"
                      />
                      {transportCost > 0 && (
                        <p className="text-xs text-primary">سيتم توزيع {transportCost} ر.س على تكلفة الأصناف بنسبة أوزانها</p>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                label: 'إدخال الأصناف',
                component: (
                  <div className="space-y-3">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            {['الصنف','كراتين','السعر/كرتون','وزن/كرتون','تكلفة/كج','الإجمالي (ر.س)'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-medium text-muted-foreground">{h}</th>
                            ))}
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const totalCost = r.cartons_qty * r.price_per_carton
                            const totalWeight = r.cartons_qty * r.weight_per_carton
                            const costPerKg = calcCostPerKg(totalCost, totalWeight, 0)
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="px-2 py-1.5">
                                  <Combobox
                                    className="w-44"
                                    options={(products ?? []).map(p => ({ value: p.id, label: p.name_ar, sub: p.category }))}
                                    value={r.product_id}
                                    onValueChange={v => updateRow(i, 'product_id', v)}
                                    placeholder="اختر صنف"
                                    searchPlaceholder="بحث عن صنف..."
                                  />
                                </td>
                                {(['cartons_qty','price_per_carton','weight_per_carton'] as const).map(field => (
                                  <td key={field} className="px-2 py-1.5">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={r[field] || ''}
                                      onChange={e => updateRow(i, field, parseFloat(e.target.value) || 0)}
                                      className="w-24 text-sm"
                                      dir="ltr"
                                    />
                                  </td>
                                ))}
                                <td className="px-2 py-1.5 text-primary font-medium w-24">
                                  {formatNumber(costPerKg)}
                                </td>
                                <td className="px-2 py-1.5 font-semibold text-foreground w-28">
                                  {totalCost > 0 ? formatNumber(totalCost) : <span className="text-muted-foreground">—</span>}
                                </td>
                                <td className="px-2 py-1.5">
                                  <Button
                                    variant="ghost" size="icon"
                                    onClick={() => removeRow(i)}
                                    className="text-danger hover:text-danger h-7 w-7"
                                  >×</Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={addRow}>+ إضافة صنف</Button>
                        <Button variant="outline" size="sm" className="gap-1" onClick={() => setImportDialog(true)}>
                          <Upload className="w-4 h-4" /> استيراد من Excel
                        </Button>
                      </div>
                      {rows.some(r => r.cartons_qty > 0 && r.price_per_carton > 0) && (
                        <div className="flex items-center gap-3 px-3 py-1.5 bg-primary/10 rounded-lg">
                          <span className="text-sm text-muted-foreground">الإجمالي الكلي:</span>
                          <span className="font-bold text-primary">
                            {formatNumber(rows.reduce((s, r) => s + r.cartons_qty * r.price_per_carton, 0))} ر.س
                          </span>
                          {transportCost > 0 && (
                            <span className="text-xs text-muted-foreground">+ {formatNumber(transportCost)} نقل</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                label: 'مراجعة وحفظ',
                component: (
                  <PurchaseInvoicePreview
                    rows={rows.filter(r => r.product_id && r.cartons_qty > 0)}
                    products={products ?? []}
                    date={selectedDate}
                    invoiceType={invoiceType}
                    transportCost={transportCost}
                  />
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">سجل المشتريات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Import dialog */}
          <Dialog open={importDialog} onOpenChange={setImportDialog}>
            <DialogContent>
              <DialogHeader><DialogTitle>استيراد مشتريات من Excel</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">يجب أن يحتوي الملف على الأعمدة: <strong>اسم الصنف، كراتين، السعر/كرتون، وزن/كرتون(كج)</strong> — التاريخ يؤخذ من الخطوة الأولى</p>
                <Button variant="outline" size="sm" onClick={handleDownloadTemplate} className="gap-1">
                  <FileDown className="w-4 h-4" /> تحميل نموذج فارغ
                </Button>
                <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportFile} />
                <Button onClick={() => importRef.current?.click()} disabled={isImporting} className="w-full gap-2">
                  <Upload className="w-4 h-4" /> {isImporting ? 'جاري الاستيراد...' : 'اختر ملف Excel'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          {/* Filters */}
          <div className="space-y-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <QuickDateFilter
              dateFrom={filterDateFrom}
              dateTo={filterDateTo}
              onDateFromChange={setFilterDateFrom}
              onDateToChange={setFilterDateTo}
            />
            <div className="flex flex-wrap gap-3">
              <Select value={filterProduct} onValueChange={v => setFilterProduct(v ?? '')}>
                <SelectTrigger className="w-40"><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">كل الأصناف</SelectItem>
                  {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterSource} onValueChange={v => setFilterSource(v ?? '')}>
                <SelectTrigger className="w-36"><SelectValue placeholder="كل المصادر" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">كل المصادر</SelectItem>
                  <SelectItem value="web">يدوي</SelectItem>
                  <SelectItem value="google_sheet">Sheets</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterInvoice} onValueChange={v => setFilterInvoice(v ?? '')}>
                <SelectTrigger className="w-44"><SelectValue placeholder="كل أنواع الفاتورة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">الكل</SelectItem>
                  <SelectItem value="مع_فاتورة">مع فاتورة</SelectItem>
                  <SelectItem value="بدون_فاتورة">بدون فاتورة</SelectItem>
                </SelectContent>
              </Select>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setFilterDateFrom(''); setFilterDateTo(''); setFilterProduct('')
                  setFilterSource(''); setFilterInvoice('')
                }} className="text-muted-foreground">مسح الفلاتر</Button>
              )}
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable
              data={filteredPurchases}
              columns={columns}
              searchPlaceholder="بحث في المشتريات..."
              onExportExcel={async () => {
                await exportToExcel('purchases.xlsx',
                  ['التاريخ','الصنف','كراتين','السعر/كرتون','إجمالي التكلفة','الوزن(كج)','تكلفة/كج','المصدر','الفاتورة'],
                  filteredPurchases.map(p => [
                    p.date,
                    p.product?.name_ar ?? '',
                    p.cartons_qty,
                    p.price_per_carton,
                    p.total_cost ?? 0,
                    p.total_weight ?? 0,
                    p.cost_per_kg,
                    p.source === 'web' ? 'يدوي' : 'Sheets',
                    p.notes === 'مع_فاتورة' ? 'مع فاتورة' : p.notes === 'بدون_فاتورة' ? 'بدون فاتورة' : '',
                  ])
                )
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>تأكيد الحذف</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button
              variant="destructive"
              disabled={isDeleting}
              onClick={async () => {
                if (!deleteId) return
                try { await deletePurchase(deleteId); toast.success('تم الحذف'); setDeleteId(null) }
                catch { toast.error('حدث خطأ أثناء الحذف') }
              }}
            >
              {isDeleting ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
