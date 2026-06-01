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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useSales, useUpsertSales } from '@/hooks/useSales'
import { useInventoryDaily } from '@/hooks/useInventory'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useCustomerPrices } from '@/hooks/useCustomerPrices'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { Sale, SaleFormRow } from '@/types'
import { cn } from '@/lib/utils'
import { exportToExcel, downloadTemplate, parseExcelFile } from '@/lib/excel'
import { FileDown, Upload } from 'lucide-react'

const emptyRow = (): SaleFormRow => ({
  product_id: '',
  qty_kg: 0,
  purchase_price_per_kg: 0,
  price_per_kg: 0,
})

export default function Sales() {
  const [step, setStep] = useState(0)
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayISO())
  const [rows, setRows] = useState<SaleFormRow[]>([emptyRow()])
  const [importDialog, setImportDialog] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSource, setFilterSource] = useState('')

  const { data: products } = useProducts()
  const { data: customers } = useCustomers()
  const { data: inventory } = useInventoryDaily(selectedDate)
  const { data: latestCosts } = useLatestPurchaseCosts(selectedDate)
  const { data: defaultPrices } = useCustomerPrices(selectedCustomer || undefined)
  const { data: sales, isLoading } = useSales(filterCustomer ? { customerId: filterCustomer } : undefined)
  const { mutateAsync: upsert, isPending } = useUpsertSales()

  function getWAC(productId: string): number {
    return inventory?.find(i => i.product_id === productId)?.weighted_avg_cost
      || latestCosts?.[productId]
      || 0
  }

  function updateRow(i: number, field: keyof SaleFormRow, value: string | number) {
    setRows(prev => prev.map((r, idx) => {
      if (idx !== i) return r
      const updated = { ...r, [field]: value }
      if (field === 'product_id') {
        const wacValue = getWAC(value as string)
        updated.wac = wacValue
        updated.purchase_price_per_kg = wacValue
        const defaultPrice = defaultPrices?.find(p => p.product_id === value)?.price_per_kg
        if (defaultPrice && defaultPrice > 0) {
          updated.price_per_kg = defaultPrice
        }
      }
      return updated
    }))
  }

  async function handleDownloadSalesTemplate() {
    await downloadTemplate('sales-template.xlsx',
      ['التاريخ','اسم العميل','اسم الصنف','الكمية(كج)','سعر البيع'],
      [['2024-01-01','عميل 1','طماطم','100','5.5'],['2024-01-01','عميل 1','خيار','80','4']]
    )
  }

  async function handleImportSalesFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !products || !customers) return
    setIsImporting(true)
    try {
      const parsed = await parseExcelFile(file)
      const valid = parsed.filter(r => r['اسم العميل'] && r['اسم الصنف'] && r['الكمية(كج)'])
      if (valid.length === 0) { toast.error('لا توجد بيانات صالحة في الملف'); return }
      const toInsert = valid.map(r => {
        const productName = String(r['اسم الصنف'] ?? '')
        const customerName = String(r['اسم العميل'] ?? '')
        const prod = products.find(p => p.name_ar === productName || p.name_en === productName)
        const cust = customers.find(c => c.name_ar === customerName)
        const date = String(r['التاريخ'] ?? todayISO())
        const qty = Number(r['الكمية(كج)'] ?? 0)
        const price = Number(r['سعر البيع'] ?? 0)
        if (!prod || !cust) return null
        return {
          product_id: prod.id, customer_id: cust.id, date,
          qty_kg: qty, price_per_kg: price,
          purchase_price_per_kg: latestCosts?.[prod.id] ?? 0,
          source: 'web' as const,
        }
      }).filter(Boolean) as Parameters<typeof upsert>[0]
      if (toInsert.length === 0) { toast.error('تأكد من مطابقة أسماء الأصناف والعملاء'); return }
      await upsert(toInsert)
      toast.success(`تم استيراد ${toInsert.length} سجل`)
      setImportDialog(false)
    } catch { toast.error('حدث خطأ أثناء الاستيراد') }
    finally { setIsImporting(false); if (importRef.current) importRef.current.value = '' }
  }

  async function handleSubmit() {
    const valid = rows.filter(r => r.product_id && r.qty_kg > 0)
    if (!selectedCustomer) { toast.error('اختر عميلاً'); return }
    if (valid.length === 0) { toast.error('أضف صنفاً واحداً على الأقل'); return }
    try {
      await upsert(valid.map(r => ({
        product_id: r.product_id,
        customer_id: selectedCustomer,
        date: selectedDate,
        qty_kg: r.qty_kg,
        purchase_price_per_kg: r.wac ?? getWAC(r.product_id),
        price_per_kg: r.price_per_kg,
        source: 'web' as const,
      })))
      toast.success('تم حفظ المبيعات بنجاح')
      setStep(0)
      setRows([emptyRow()])
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  const columns = useMemo<ColumnDef<Sale>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.customer?.name_ar ?? '', id: 'customer', header: 'العميل' },
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorKey: 'qty_kg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'price_per_kg', header: 'سعر البيع', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_amount', header: 'الإجمالي', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      id: 'margin',
      header: 'الهامش',
      cell: ({ row }) => {
        const margin = row.original.total_amount - row.original.total_purchase
        const marginPct = row.original.total_amount > 0
          ? (margin / row.original.total_amount) * 100 : 0
        return (
          <span className={margin >= 0 ? 'text-success' : 'text-danger'}>
            {formatNumber(margin)} ({marginPct.toFixed(1)}%)
          </span>
        )
      },
    },
    { accessorKey: 'source', header: 'المصدر', cell: ({ getValue }) => getValue() === 'web' ? 'يدوي' : 'Sheets' },
  ], [])

  const filteredSales = useMemo(() => {
    let data = sales ?? []
    if (filterProduct) data = data.filter(s => s.product_id === filterProduct)
    if (filterDateFrom) data = data.filter(s => s.date >= filterDateFrom)
    if (filterDateTo) data = data.filter(s => s.date <= filterDateTo)
    if (filterSource) data = data.filter(s => s.source === filterSource)
    return data
  }, [sales, filterProduct, filterDateFrom, filterDateTo, filterSource])

  function clearFilters() {
    setFilterCustomer(''); setFilterProduct(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterSource('')
  }

  const hasFilters = filterCustomer || filterProduct || filterDateFrom || filterDateTo || filterSource

  const totalAmount = rows.reduce((s, r) => s + r.qty_kg * r.price_per_kg, 0)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>إدخال مبيعات جديدة</CardTitle>
        </CardHeader>
        <CardContent>
          <StepWizard
            currentStep={step}
            onNext={() => setStep(s => s + 1)}
            onBack={() => setStep(s => s - 1)}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
            canNext={step === 0 ? (!!selectedCustomer && !!selectedDate) : rows.some(r => r.product_id && r.qty_kg > 0)}
            steps={[
              {
                label: 'اختيار العميل والتاريخ',
                component: (
                  <div className="grid grid-cols-2 gap-4 max-w-sm">
                    <div className="space-y-2">
                      <Label>العميل</Label>
                      <Select value={selectedCustomer} onValueChange={v => { setSelectedCustomer(v ?? ''); setRows([emptyRow()]) }}>
                        <SelectTrigger>
                          <SelectValue placeholder="اختر العميل" />
                        </SelectTrigger>
                        <SelectContent>
                          {customers?.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>التاريخ</Label>
                      <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} dir="ltr" />
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
                            {['الصنف','الكمية(كج)','التكلفة/كج','سعر البيع','الإجمالي','هامش ريال','هامش%'].map(h => (
                              <th key={h} className="px-3 py-2 text-right font-medium text-muted-foreground">{h}</th>
                            ))}
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((r, i) => {
                            const wac = getWAC(r.product_id)
                            const margin = r.qty_kg * (r.price_per_kg - wac)
                            const marginPct = r.qty_kg * r.price_per_kg > 0
                              ? (margin / (r.qty_kg * r.price_per_kg)) * 100 : 0
                            return (
                              <tr key={i} className="border-b border-border/50">
                                <td className="px-2 py-1.5">
                                  <Select value={r.product_id} onValueChange={v => updateRow(i, 'product_id', v ?? '')}>
                                    <SelectTrigger className="w-36 text-sm">
                                      <SelectValue placeholder="اختر" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {products?.map(p => (
                                        <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input type="number" min="0" step="0.01" value={r.qty_kg || ''} onChange={e => updateRow(i, 'qty_kg', parseFloat(e.target.value) || 0)} className="w-20 text-sm" dir="ltr" />
                                </td>
                                <td className="px-2 py-1.5 text-muted-foreground min-w-16">
                                  {wac > 0 ? formatNumber(wac) : <span className="text-xs">—</span>}
                                </td>
                                <td className="px-2 py-1.5">
                                  <Input type="number" min="0" step="0.01" value={r.price_per_kg || ''} onChange={e => updateRow(i, 'price_per_kg', parseFloat(e.target.value) || 0)} className="w-20 text-sm" dir="ltr" />
                                </td>
                                <td className="px-2 py-1.5 font-medium text-foreground">
                                  {formatNumber(r.qty_kg * r.price_per_kg)}
                                </td>
                                <td className={cn('px-2 py-1.5 font-medium', margin >= 0 ? 'text-success' : 'text-danger')}>
                                  {formatNumber(margin)}
                                </td>
                                <td className={cn('px-2 py-1.5', marginPct >= 0 ? 'text-success' : 'text-danger')}>
                                  {marginPct.toFixed(1)}%
                                </td>
                                <td className="px-2 py-1.5">
                                  <Button variant="ghost" size="icon" onClick={() => setRows(prev => prev.filter((_, idx) => idx !== i))} className="text-danger h-7 w-7">×</Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between">
                      <Button variant="outline" size="sm" onClick={() => setRows(prev => [...prev, emptyRow()])}>+ إضافة صنف</Button>
                      {totalAmount > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-lg">
                          <span className="text-sm text-muted-foreground">الإجمالي:</span>
                          <span className="font-bold text-primary">{formatNumber(totalAmount)} ر.س</span>
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                label: 'مراجعة وحفظ',
                component: (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      العميل: {customers?.find(c => c.id === selectedCustomer)?.name_ar} — {formatDate(selectedDate)}
                    </p>
                    <div className="rounded-lg border border-border overflow-hidden text-sm">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border">
                            {['الصنف','الكمية','سعر البيع','الإجمالي'].map(h => (
                              <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.filter(r => r.product_id && r.qty_kg > 0).map((r, i) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-3 py-2">{products?.find(p => p.id === r.product_id)?.name_ar}</td>
                              <td className="px-3 py-2">{formatNumber(r.qty_kg)}</td>
                              <td className="px-3 py-2">{formatNumber(r.price_per_kg)}</td>
                              <td className="px-3 py-2 font-medium">{formatNumber(r.qty_kg * r.price_per_kg)}</td>
                            </tr>
                          ))}
                          <tr className="bg-muted/30 font-medium">
                            <td className="px-3 py-2" colSpan={3}>الإجمالي</td>
                            <td className="px-3 py-2 text-primary">
                              {formatNumber(rows.reduce((s, r) => s + r.qty_kg * r.price_per_kg, 0))}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>سجل المبيعات</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1" onClick={handleDownloadSalesTemplate}>
                <FileDown className="w-4 h-4" /> نموذج Excel
              </Button>
              <Button variant="outline" size="sm" className="gap-1" onClick={() => setImportDialog(true)}>
                <Upload className="w-4 h-4" /> استيراد Excel
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Import dialog */}
          <Dialog open={importDialog} onOpenChange={setImportDialog}>
            <DialogContent>
              <DialogHeader><DialogTitle>استيراد مبيعات من Excel</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">يجب أن يحتوي الملف على الأعمدة: <strong>التاريخ، اسم العميل، اسم الصنف، الكمية(كج)، سعر البيع</strong></p>
                <Button variant="outline" size="sm" onClick={handleDownloadSalesTemplate} className="gap-1">
                  <FileDown className="w-4 h-4" /> تحميل نموذج فارغ
                </Button>
                <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportSalesFile} />
                <Button onClick={() => importRef.current?.click()} disabled={isImporting} className="w-full gap-2">
                  <Upload className="w-4 h-4" /> {isImporting ? 'جاري الاستيراد...' : 'اختر ملف Excel'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-3 bg-muted/30 rounded-lg border border-border/50">
            <Select value={filterCustomer} onValueChange={v => setFilterCustomer(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="كل العملاء" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل العملاء</SelectItem>
                {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterProduct} onValueChange={v => setFilterProduct(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="كل الأصناف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل الأصناف</SelectItem>
                {products?.map(p => <SelectItem key={p.id} value={p.id}>{p.name_ar}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterSource} onValueChange={v => setFilterSource(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="كل المصادر" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">كل المصادر</SelectItem>
                <SelectItem value="web">يدوي</SelectItem>
                <SelectItem value="google_sheet">Sheets</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">من</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="text-xs h-9" dir="ltr" />
            </div>
            <div className="flex items-center gap-1">
              <Label className="text-xs shrink-0">إلى</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="text-xs h-9" dir="ltr" />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                مسح الفلاتر
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable
              data={filteredSales}
              columns={columns}
              searchPlaceholder="بحث في المبيعات..."
              onExportExcel={async () => {
                await exportToExcel('sales.xlsx',
                  ['التاريخ','العميل','الصنف','الكمية(كج)','سعر البيع','الإجمالي','الهامش','المصدر'],
                  filteredSales.map(s => [
                    s.date,
                    s.customer?.name_ar ?? '',
                    s.product?.name_ar ?? '',
                    s.qty_kg,
                    s.price_per_kg,
                    s.total_amount,
                    s.total_amount - s.total_purchase,
                    s.source === 'web' ? 'يدوي' : 'Sheets',
                  ])
                )
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
