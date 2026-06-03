import { useState, useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAllUsers, useUpsertUserRole, usePermission, type AppRole } from '@/hooks/usePermissions'
import { useAuth } from '@/hooks/useAuth'
import { useAllProducts, useUpsertProduct } from '@/hooks/useProducts'
import { useCostCategories, useUpsertCostCategory } from '@/hooks/useOverhead'
import { useCustomerPrices, useUpsertCustomerPrices } from '@/hooks/useCustomerPrices'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useUpsertInventory, useInventoryDaily, useDeleteInventory } from '@/hooks/useInventory'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useSiteSettings, useUpsertSiteSettings } from '@/hooks/useSiteSettings'
import type { Product, CostCategory } from '@/types'
import {
  Building2, Package, DollarSign, Tags, UserCog,
  Settings as SettingsIcon, Download, Archive, Pencil, Trash2, Plus, Layers,
} from 'lucide-react'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────────
type Section =
  | 'company'
  | 'users'
  | 'system'
  | 'backup'

// ── Company Settings ───────────────────────────────────────────────────────────
function CompanyTab() {
  const { data: saved } = useSiteSettings()
  const { mutateAsync: upsert, isPending } = useUpsertSiteSettings()
  const [form, setForm] = useState({ name: '', tagline: '', phone: '', address: '', tax_number: '', vat_rate: '15', currency: 'SAR', invoice_prefix_sales: 'SIM', invoice_prefix_purchases: 'PIM', invoice_prefix_sales_sheet: 'SIG', invoice_prefix_purchases_sheet: 'PIG', invoice_prefix_stocktake: 'STK', invoice_prefix_returns_sales: 'RTN-S', invoice_prefix_returns_purchases: 'RTN-P', payment_terms: '', logo: '' })
  const logoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (saved) setForm(f => ({ ...f, ...Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, String(v ?? '')])) }))
  }, [saved])

  async function handleSave() {
    try {
      await upsert({ ...form, vat_rate: parseFloat(form.vat_rate) || 15 })
      toast.success('تم حفظ الإعدادات')
    } catch { toast.error('حدث خطأ') }
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setForm(f => ({ ...f, logo: String(ev.target?.result ?? '') }))
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-base font-semibold mb-4">إعدادات المنشأة</h3>
        {/* Logo */}
        <div className="flex items-center gap-5 mb-6 p-4 bg-muted/30 rounded-xl border border-border">
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-background cursor-pointer shrink-0" onClick={() => logoRef.current?.click()}>
            {form.logo ? <img src={form.logo} alt="logo" className="w-full h-full object-contain" /> : <span className="text-xs text-muted-foreground text-center px-2">اضغط لرفع الشعار</span>}
          </div>
          <div><p className="text-sm font-medium mb-1">شعار المنشأة</p><p className="text-xs text-muted-foreground mb-2">PNG أو JPG</p><Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>تغيير الشعار</Button></div>
          <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'اسم المنشأة', key: 'name', placeholder: 'Greenbasket' },
            { label: 'الوصف / الشعار', key: 'tagline', placeholder: 'نظام إدارة المتجر' },
            { label: 'رقم الهاتف', key: 'phone', placeholder: '05xxxxxxxx', dir: 'ltr' as const },
            { label: 'الرقم الضريبي', key: 'tax_number', placeholder: '310xxxxxxxxx', dir: 'ltr' as const },
            { label: 'العنوان', key: 'address', placeholder: 'المدينة، الحي...', span: 2 },
          ].map(f => (
            <div key={f.key} className={cn('space-y-1', f.span === 2 && 'col-span-2')}>
              <Label className="text-xs">{f.label}</Label>
              <Input value={(form as Record<string, string>)[f.key] ?? ''} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} dir={f.dir} className="h-9" />
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-4">إعدادات الفواتير</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label className="text-xs">بادئة مبيعات يدوية</Label>
            <Input value={form.invoice_prefix_sales} onChange={e => setForm(p => ({ ...p, invoice_prefix_sales: e.target.value }))} placeholder="SIM" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">بادئة مشتريات يدوية</Label>
            <Input value={form.invoice_prefix_purchases} onChange={e => setForm(p => ({ ...p, invoice_prefix_purchases: e.target.value }))} placeholder="PIM" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">بادئة مبيعات Sheets</Label>
            <Input value={form.invoice_prefix_sales_sheet} onChange={e => setForm(p => ({ ...p, invoice_prefix_sales_sheet: e.target.value }))} placeholder="SIG" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">بادئة مشتريات Sheets</Label>
            <Input value={form.invoice_prefix_purchases_sheet} onChange={e => setForm(p => ({ ...p, invoice_prefix_purchases_sheet: e.target.value }))} placeholder="PIG" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">بادئة الجرد</Label>
            <Input value={form.invoice_prefix_stocktake} onChange={e => setForm(p => ({ ...p, invoice_prefix_stocktake: e.target.value }))} placeholder="STK" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">بادئة مرتجعات المبيعات</Label>
            <Input value={form.invoice_prefix_returns_sales} onChange={e => setForm(p => ({ ...p, invoice_prefix_returns_sales: e.target.value }))} placeholder="RTN-S" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">بادئة مرتجعات المشتريات</Label>
            <Input value={form.invoice_prefix_returns_purchases} onChange={e => setForm(p => ({ ...p, invoice_prefix_returns_purchases: e.target.value }))} placeholder="RTN-P" dir="ltr" className="h-9 font-mono" /></div>
          <div className="space-y-1"><Label className="text-xs">شروط الدفع الافتراضية</Label>
            <Input value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} placeholder="مثال: 30 يوم" className="h-9" /></div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-4">إعدادات الضرائب</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1"><Label className="text-xs">نسبة ضريبة القيمة المضافة (%)</Label>
            <Input type="number" min="0" max="100" step="0.1" value={form.vat_rate} onChange={e => setForm(p => ({ ...p, vat_rate: e.target.value }))} dir="ltr" className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">العملة</Label>
            <Select value={form.currency} onValueChange={v => v && setForm(p => ({ ...p, currency: v }))}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="SAR">ريال سعودي (SAR)</SelectItem><SelectItem value="USD">دولار (USD)</SelectItem><SelectItem value="EUR">يورو (EUR)</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={isPending} className="gap-2">
        {isPending ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
      </Button>
    </div>
  )
}

// ── Products Tab ───────────────────────────────────────────────────────────────
function ProductsTab() {
  const { data: products } = useAllProducts()
  const { mutateAsync: upsert, isPending } = useUpsertProduct()
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null)
  const [open, setOpen] = useState(false)

  async function handleSave() {
    if (!editProduct?.name_ar) { toast.error('اسم الصنف مطلوب'); return }
    try { await upsert(editProduct); toast.success('تم الحفظ'); setOpen(false); setEditProduct(null) } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{products?.length ?? 0} صنف مسجّل</p>
        <Button size="sm" className="gap-2" onClick={() => { setEditProduct({ name_ar: '', name_en: '', category: 'خضار' }); setOpen(true) }}>
          <Plus className="w-3.5 h-3.5" />إضافة صنف
        </Button>
      </div>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditProduct(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{editProduct?.id ? 'تعديل صنف' : 'إضافة صنف جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>الاسم بالعربية</Label><Input value={editProduct?.name_ar ?? ''} onChange={e => setEditProduct(p => ({ ...p, name_ar: e.target.value }))} /></div>
            <div className="space-y-1"><Label>الاسم بالإنجليزية</Label><Input value={String(editProduct?.name_en ?? '')} onChange={e => setEditProduct(p => ({ ...p, name_en: e.target.value }))} dir="ltr" /></div>
            <div className="space-y-1"><Label>الفئة</Label>
              <Select value={editProduct?.category ?? 'خضار'} onValueChange={v => v && setEditProduct(p => ({ ...p, category: v as Product['category'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="خضار">خضار</SelectItem><SelectItem value="فاكهة">فاكهة</SelectItem><SelectItem value="أعشاب">أعشاب</SelectItem></SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={isPending} className="w-full">{isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/30 border-b border-border">{['الاسم','الإنجليزية','الفئة','الحالة',''].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>
            {products?.map((p, i) => (
              <tr key={p.id} className={cn('border-b border-border/50 hover:bg-muted/20', i % 2 === 1 && 'bg-muted/10')}>
                <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                <td className="px-3 py-2 text-muted-foreground text-xs" dir="ltr">{p.name_en ?? '—'}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                <td className="px-3 py-2"><span className={`text-xs font-medium ${p.is_active ? 'text-success' : 'text-muted-foreground'}`}>{p.is_active ? 'نشط' : 'موقوف'}</span></td>
                <td className="px-3 py-2"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditProduct({ id: p.id, name_ar: p.name_ar, name_en: p.name_en ?? '', category: p.category }); setOpen(true) }}><Pencil className="w-3 h-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Opening Balance Tab ────────────────────────────────────────────────────────
function OpeningBalanceTab() {
  const { data: products } = useProducts()
  const { data: latestCosts } = useLatestPurchaseCosts()
  const [date, setDate] = useState(() => { const d = new Date(todayISO() + 'T12:00:00'); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` })
  const [balances, setBalances] = useState<Record<string, { qty: string; cost: string }>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState(''); const [editCost, setEditCost] = useState('')
  const { data: existing } = useInventoryDaily(date)
  const { mutateAsync: upsert, isPending: isSaving } = useUpsertInventory()
  const { mutateAsync: del } = useDeleteInventory()

  async function handleSave() {
    const rows = Object.entries(balances).filter(([, v]) => parseFloat(v.qty) > 0).map(([pid, v]) => {
      const qty = parseFloat(v.qty) || 0; const cost = parseFloat(v.cost) || (latestCosts?.[pid] ?? 0)
      return { product_id: pid, date, opening_stock_kg: qty, opening_cost_per_kg: cost, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: cost }
    })
    if (rows.length === 0) { toast.error('أدخل كمية واحدة على الأقل'); return }
    try { await upsert(rows); toast.success(`تم حفظ ${rows.length} صنف`); setBalances({}) } catch { toast.error('حدث خطأ') }
  }

  async function handleUpdate(pid: string) {
    const qty = parseFloat(editQty); const cost = parseFloat(editCost); if (isNaN(qty) || qty < 0) return
    try {
      await upsert([{ product_id: pid, date, opening_stock_kg: qty, opening_cost_per_kg: cost || 0, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: cost || 0 }])
      toast.success('تم التعديل'); setEditId(null)
    } catch { toast.error('حدث خطأ') }
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
                          ? <div className="flex gap-1"><Button size="sm" className="h-7" onClick={() => handleUpdate(j.product_id)} disabled={isSaving}>حفظ</Button><Button size="sm" variant="ghost" className="h-7" onClick={() => setEditId(null)}>إلغاء</Button></div>
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
                {(products ?? []).map(p => {
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

// ── Customer Prices Tab ────────────────────────────────────────────────────────
function DefaultPricesTab() {
  const { data: products } = useProducts()
  const { data: customers } = useCustomers()
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [bulkPrice, setBulkPrice] = useState('')
  const { data: existingPrices } = useCustomerPrices(selectedCustomer || undefined)
  const { mutateAsync: upsertPrices, isPending } = useUpsertCustomerPrices()

  useEffect(() => {
    if (!selectedCustomer || !existingPrices) return
    const loaded: Record<string, string> = {}
    existingPrices.forEach(p => { loaded[p.product_id] = String(p.price_per_kg) })
    setPrices(loaded)
  }, [existingPrices, selectedCustomer])

  async function handleSave() {
    if (!selectedCustomer) { toast.error('اختر عميلاً أولاً'); return }
    const rows = Object.entries(prices).filter(([, v]) => parseFloat(v) > 0).map(([productId, price]) => ({ customer_id: selectedCustomer, product_id: productId, price_per_kg: parseFloat(price) }))
    if (rows.length === 0) { toast.error('أدخل سعراً واحداً على الأقل'); return }
    try { await upsertPrices(rows); toast.success(`تم حفظ ${rows.length} سعر`) } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 flex-wrap p-4 bg-muted/30 rounded-xl border border-border">
        <div className="space-y-1 min-w-48">
          <Label className="text-xs">العميل</Label>
          <Select value={selectedCustomer} onValueChange={v => { setSelectedCustomer(v); setPrices({}) }}>
            <SelectTrigger className="h-9"><SelectValue placeholder="اختر عميلاً" /></SelectTrigger>
            <SelectContent>{customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {selectedCustomer && <>
          <div className="space-y-1">
            <Label className="text-xs">سعر موحد</Label>
            <div className="flex gap-2"><Input type="number" min="0" step="0.01" placeholder="0.00" value={bulkPrice} onChange={e => setBulkPrice(e.target.value)} className="w-28 h-9" dir="ltr" /><Button variant="outline" className="h-9" onClick={() => { const v = parseFloat(bulkPrice); if (!v || !products) return; const all: Record<string, string> = {}; products.forEach(p => { all[p.id] = String(v) }); setPrices(all) }}>تطبيق على الكل</Button></div>
          </div>
          <Button onClick={handleSave} disabled={isPending} className="h-9">{isPending ? 'جاري الحفظ...' : 'حفظ الأسعار'}</Button>
        </>}
      </div>

      {!selectedCustomer ? <p className="text-sm text-muted-foreground text-center py-8">اختر عميلاً لعرض وتعديل أسعار البيع الافتراضية</p> : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border">{['الصنف','الفئة','سعر البيع (ر.س/كج)','السعر المحفوظ'].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {products?.map(p => {
                const saved = existingPrices?.find(ep => ep.product_id === p.id)
                return (
                  <tr key={p.id} className="border-b last:border-b-0 border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                    <td className="px-3 py-2"><Input type="number" min="0" step="0.01" placeholder="0.00" value={prices[p.id] ?? ''} onChange={e => setPrices(prev => ({ ...prev, [p.id]: e.target.value }))} className="w-28 h-8 text-sm" dir="ltr" /></td>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{saved ? formatNumber(saved.price_per_kg) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Cost Categories Tab ────────────────────────────────────────────────────────
function CostCategoriesTab() {
  const { data: categories } = useCostCategories()
  const { mutateAsync: upsert, isPending } = useUpsertCostCategory()
  const [editCat, setEditCat] = useState<Partial<CostCategory> | null>(null)
  const [open, setOpen] = useState(false)

  async function handleSave() {
    if (!editCat?.name_ar) { toast.error('اسم الفئة مطلوب'); return }
    try { await upsert(editCat); toast.success('تم الحفظ'); setOpen(false); setEditCat(null) } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => { setEditCat({ name_ar: '', type: 'fixed' }); setOpen(true) }}><Plus className="w-3.5 h-3.5" />إضافة فئة</Button>
      </div>
      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditCat(null) }}>
        <DialogContent><DialogHeader><DialogTitle>{editCat?.id ? 'تعديل فئة' : 'إضافة فئة جديدة'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>اسم الفئة</Label><Input value={editCat?.name_ar ?? ''} onChange={e => setEditCat(p => ({ ...p, name_ar: e.target.value }))} /></div>
            <div className="space-y-1"><Label>النوع</Label>
              <Select value={editCat?.type ?? 'fixed'} onValueChange={v => v && setEditCat(p => ({ ...p, type: v as CostCategory['type'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fixed">ثابت</SelectItem><SelectItem value="variable">متغير</SelectItem></SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={isPending} className="w-full">{isPending ? 'جاري الحفظ...' : 'حفظ'}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="bg-muted/30 border-b border-border">{['الاسم','النوع','الحالة',''].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
          <tbody>
            {categories?.map(cat => (
              <tr key={cat.id} className="border-b last:border-b-0 border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{cat.name_ar}</td>
                <td className="px-3 py-2"><span className={cn('text-xs px-2 py-0.5 rounded font-medium', cat.type === 'fixed' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning')}>{cat.type === 'fixed' ? 'ثابت' : 'متغير'}</span></td>
                <td className="px-3 py-2"><span className={`text-xs font-medium ${cat.is_active ? 'text-success' : 'text-muted-foreground'}`}>{cat.is_active ? 'نشط' : 'موقوف'}</span></td>
                <td className="px-3 py-2"><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditCat({ id: cat.id, name_ar: cat.name_ar, type: cat.type }); setOpen(true) }}><Pencil className="w-3 h-3" /></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Users Tab ──────────────────────────────────────────────────────────────────
function UsersTab() {
  const { data: users, isLoading } = useAllUsers()
  const { mutateAsync: upsertRole, isPending } = useUpsertUserRole()
  const canEdit = usePermission('users.edit')
  const { session } = useAuth()
  const ROLE_LABELS: Record<AppRole, string> = { admin: 'مدير', manager: 'مشرف', viewer: 'مشاهد' }

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">جاري التحميل...</p>

  return (
    <div className="space-y-4">
      {!canEdit && <div className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">أنت في وضع المشاهدة فقط — تغيير الأدوار يتطلب صلاحية مدير</div>}
      <div className="text-xs text-muted-foreground space-y-0.5 p-3 bg-muted/30 rounded-lg border border-border/50">
        <p><strong>مدير:</strong> صلاحيات كاملة + إدارة المستخدمين والإعدادات</p>
        <p><strong>مشرف:</strong> إضافة وتعديل المشتريات والمبيعات والمخزون</p>
        <p><strong>مشاهد:</strong> عرض فقط بدون تعديل</p>
      </div>
      {(users ?? []).length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">لا توجد بيانات مستخدمين</p>
          {session?.user && <Button onClick={() => upsertRole({ id: session.user.id, email: session.user.email ?? '', role: 'admin', name: session.user.user_metadata?.name ?? session.user.email ?? 'مدير' })} disabled={isPending}>{isPending ? 'جاري...' : 'سجّل نفسك مديراً للنظام'}</Button>}
          <p className="text-xs text-muted-foreground">تأكد من تشغيل SQL الخاص بجدول user_profiles في Supabase</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border">{['الاسم','البريد الإلكتروني','الدور',''].map(h => <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {(users ?? []).map(u => (
                <tr key={u.id} className="border-b last:border-b-0 border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{u.name ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs" dir="ltr">{u.email}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className={u.role === 'admin' ? 'text-primary' : u.role === 'manager' ? 'text-warning' : 'text-muted-foreground'}>{ROLE_LABELS[u.role]}</Badge></td>
                  <td className="px-3 py-2">
                    {canEdit && <Select value={u.role} onValueChange={v => upsertRole({ id: u.id, role: v as AppRole, email: u.email, name: u.name })}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="admin">مدير</SelectItem><SelectItem value="manager">مشرف</SelectItem><SelectItem value="viewer">مشاهد</SelectItem></SelectContent>
                    </Select>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── System Settings Tab ────────────────────────────────────────────────────────
function SystemTab() {
  const [theme, setTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light')

  function applyTheme(t: string) {
    setTheme(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
    localStorage.setItem('gb_theme', t)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-base font-semibold mb-4">المظهر</h3>
        <div className="grid grid-cols-2 gap-3">
          {[{ v: 'light', label: 'فاتح' }, { v: 'dark', label: 'داكن' }].map(t => (
            <button key={t.v} onClick={() => applyTheme(t.v)}
              className={cn('p-4 rounded-xl border-2 text-center transition-colors font-medium text-sm', theme === t.v ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted')}>
              {t.v === 'light' ? '☀️' : '🌙'} {t.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-base font-semibold mb-4">معلومات النظام</h3>
        <div className="space-y-2 text-sm">
          {[['الإصدار', 'v1.0.0'], ['المنطقة الزمنية', 'Asia/Riyadh'], ['تنسيق التاريخ', 'يوم/شهر/سنة']].map(([k, v]) => (
            <div key={k} className="flex justify-between p-3 bg-muted/30 rounded-lg border border-border/50">
              <span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Backup Tab ─────────────────────────────────────────────────────────────────
function BackupTab() {
  const { data: products } = useProducts()
  const { data: customers } = useCustomers()

  async function handleExportJSON() {
    const data = { products: products ?? [], customers: customers ?? [], exported_at: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `greenbasket-backup-${new Date().toISOString().split('T')[0]}.json`; a.click()
    URL.revokeObjectURL(url)
    toast.success('تم تصدير النسخة الاحتياطية')
  }

  return (
    <div className="space-y-5 max-w-lg">
      <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Download className="w-4 h-4" />تصدير البيانات</h3>
        <p className="text-xs text-muted-foreground">تصدير الأصناف والعملاء كملف JSON للنسخ الاحتياطي</p>
        <Button variant="outline" className="gap-2" onClick={handleExportJSON}>
          <Archive className="w-4 h-4" />تصدير نسخة احتياطية (JSON)
        </Button>
      </div>

      <div className="p-4 bg-warning/10 border border-warning/30 rounded-xl space-y-2">
        <p className="text-sm font-semibold text-warning">ملاحظة</p>
        <p className="text-xs text-muted-foreground">بيانات المبيعات والمشتريات محفوظة في Supabase ولا يمكن تصديرها بالكامل من هنا. استخدم Supabase Dashboard لتصدير جداول قاعدة البيانات كاملةً.</p>
      </div>

      <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3">
        <h3 className="text-sm font-semibold">SQL — جدول الإعدادات في Supabase</h3>
        <p className="text-xs text-muted-foreground">شغّل هذا الـ SQL مرة واحدة في Supabase SQL Editor لتفعيل حفظ الإعدادات:</p>
        <pre className="text-xs bg-background border border-border rounded-lg p-3 overflow-auto font-mono text-muted-foreground whitespace-pre-wrap">
{`CREATE TABLE IF NOT EXISTS site_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO site_settings (id, data)
VALUES ('default', '{}')
ON CONFLICT DO NOTHING;`}
        </pre>
      </div>
    </div>
  )
}

// ── Main Settings ──────────────────────────────────────────────────────────────
interface SidebarSection { id: Section; label: string; icon: React.ElementType; group?: string }

const SECTIONS: SidebarSection[] = [
  { id: 'company', label: 'إعدادات الشركة', icon: Building2, group: 'الإعدادات العامة' },
  { id: 'system', label: 'إعدادات النظام', icon: SettingsIcon, group: 'الإعدادات العامة' },
  { id: 'backup', label: 'النسخ الاحتياطي والـ SQL', icon: Archive, group: 'الإعدادات العامة' },
  { id: 'users', label: 'إدارة المستخدمين', icon: UserCog, group: 'الصلاحيات' },
]

const CONTENT: Record<Section, ReactNode> = {
  company: <CompanyTab />,
  system: <SystemTab />,
  backup: <BackupTab />,
  users: <UsersTab />,
}

export default function Settings() {
  const [active, setActive] = useState<Section>('company')
  const groups = [...new Set(SECTIONS.map(s => s.group ?? ''))]

  return (
    <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '620px' }}>
      {/* Sidebar */}
      <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
        <div className="p-4 border-b border-border">
          <p className="text-sm font-bold">الإعدادات</p>
        </div>
        <div className="flex-1 p-2 overflow-y-auto space-y-4">
          {groups.map(group => (
            <div key={group}>
              <p className="text-xs font-semibold text-muted-foreground px-3 py-1.5 uppercase tracking-wide">{group}</p>
              <div className="space-y-0.5">
                {SECTIONS.filter(s => (s.group ?? '') === group).map(s => (
                  <button key={s.id} onClick={() => setActive(s.id)}
                    className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                      active === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                    <s.icon className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-auto p-6">
        {CONTENT[active]}
      </div>
    </div>
  )
}
