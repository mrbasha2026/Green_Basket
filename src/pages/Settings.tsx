import { useState, useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAllUsers, useUpsertUserRole, usePermission, type AppRole } from '@/hooks/usePermissions'
import { useAuth } from '@/hooks/useAuth'
import { useAllProducts, useUpsertProduct } from '@/hooks/useProducts'
import { useAllCustomers, useUpsertCustomer } from '@/hooks/useCustomers'
import { useCostCategories, useUpsertCostCategory } from '@/hooks/useOverhead'
import { useCustomerPrices, useUpsertCustomerPrices } from '@/hooks/useCustomerPrices'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useUpsertInventory, useInventoryDaily, useDeleteInventory } from '@/hooks/useInventory'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import type { Product, Customer, CostCategory } from '@/types'
import { Plus, Pencil, Trash2, Package, Users, DollarSign, Tags, BarChart2, UserCog, Settings as SettingsIcon } from 'lucide-react'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Products Tab
function ProductsTab() {
  const { data: products } = useAllProducts()
  const { mutateAsync: upsert, isPending } = useUpsertProduct()
  const [editProduct, setEditProduct] = useState<Partial<Product> | null>(null)
  const [open, setOpen] = useState(false)

  function openAdd() {
    setEditProduct({ name_ar: '', name_en: '', category: 'خضار' })
    setOpen(true)
  }

  function openEdit(p: Product) {
    setEditProduct({ id: p.id, name_ar: p.name_ar, name_en: p.name_en ?? '', category: p.category })
    setOpen(true)
  }

  async function handleSave() {
    if (!editProduct?.name_ar) { toast.error('اسم الصنف مطلوب'); return }
    try {
      await upsert(editProduct)
      toast.success('تم الحفظ')
      setOpen(false)
      setEditProduct(null)
    } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={openAdd}>
          <Plus className="w-4 h-4" /> إضافة صنف
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditProduct(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editProduct?.id ? 'تعديل صنف' : 'إضافة صنف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>الاسم بالعربية</Label>
              <Input value={editProduct?.name_ar ?? ''} onChange={e => setEditProduct(p => ({ ...p, name_ar: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>الاسم بالإنجليزية</Label>
              <Input value={String(editProduct?.name_en ?? '')} onChange={e => setEditProduct(p => ({ ...p, name_en: e.target.value }))} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>الفئة</Label>
              <Select
                value={editProduct?.category ?? 'خضار'}
                onValueChange={v => v && setEditProduct(p => ({ ...p, category: v as Product['category'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="خضار">خضار</SelectItem>
                  <SelectItem value="فاكهة">فاكهة</SelectItem>
                  <SelectItem value="أعشاب">أعشاب</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={isPending} className="w-full">
              {isPending ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {['الاسم','الإنجليزية','الفئة','الحالة',''].map(h => (
                <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products?.map(p => (
              <tr key={p.id} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                <td className="px-3 py-2 text-muted-foreground" dir="ltr">{p.name_en ?? '—'}</td>
                <td className="px-3 py-2"><Badge variant="outline">{p.category}</Badge></td>
                <td className="px-3 py-2">
                  <span className={`text-xs ${p.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                    {p.is_active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Customers Tab
function CustomersTab() {
  const { data: customers } = useAllCustomers()
  const { mutateAsync: upsert, isPending } = useUpsertCustomer()
  const [editCustomer, setEditCustomer] = useState<Partial<Customer> | null>(null)
  const [open, setOpen] = useState(false)

  function openEdit(c?: Customer) {
    setEditCustomer(c ? { id: c.id, name_ar: c.name_ar, type: c.type } : { name_ar: '', type: 'مستشفى' })
    setOpen(true)
  }

  async function handleSave() {
    if (!editCustomer?.name_ar) { toast.error('اسم العميل مطلوب'); return }
    try {
      await upsert(editCustomer)
      toast.success('تم الحفظ')
      setOpen(false)
      setEditCustomer(null)
    } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => openEdit()}>
          <Plus className="w-4 h-4" /> إضافة عميل
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditCustomer(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCustomer?.id ? 'تعديل عميل' : 'إضافة عميل جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>اسم العميل</Label>
              <Input value={editCustomer?.name_ar ?? ''} onChange={e => setEditCustomer(p => ({ ...p, name_ar: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>النوع</Label>
              <Select
                value={editCustomer?.type ?? 'مستشفى'}
                onValueChange={v => v && setEditCustomer(p => ({ ...p, type: v as Customer['type'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['مستشفى','فندق','مطعم','تجزئة'] as const).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={isPending} className="w-full">
              {isPending ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {['الاسم','النوع','الحالة',''].map(h => (
                <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {customers?.map(c => (
              <tr key={c.id} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium">{c.name_ar}</td>
                <td className="px-3 py-2"><Badge variant="outline">{c.type}</Badge></td>
                <td className="px-3 py-2">
                  <span className={`text-xs ${c.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                    {c.is_active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Cost Categories Tab
function CostCategoriesTab() {
  const { data: categories } = useCostCategories()
  const { mutateAsync: upsert, isPending } = useUpsertCostCategory()
  const [editCat, setEditCat] = useState<Partial<CostCategory> | null>(null)
  const [open, setOpen] = useState(false)

  function openEdit(c?: CostCategory) {
    setEditCat(c ? { id: c.id, name_ar: c.name_ar, type: c.type } : { name_ar: '', type: 'fixed' })
    setOpen(true)
  }

  async function handleSave() {
    if (!editCat?.name_ar) { toast.error('اسم الفئة مطلوب'); return }
    try {
      await upsert(editCat)
      toast.success('تم الحفظ')
      setOpen(false)
      setEditCat(null)
    } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-2" onClick={() => openEdit()}>
          <Plus className="w-4 h-4" /> إضافة فئة
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditCat(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editCat?.id ? 'تعديل فئة' : 'إضافة فئة جديدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>اسم الفئة</Label>
              <Input value={editCat?.name_ar ?? ''} onChange={e => setEditCat(p => ({ ...p, name_ar: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>النوع</Label>
              <Select
                value={editCat?.type ?? 'fixed'}
                onValueChange={v => v && setEditCat(p => ({ ...p, type: v as CostCategory['type'] }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">ثابت</SelectItem>
                  <SelectItem value="variable">متغير</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSave} disabled={isPending} className="w-full">
              {isPending ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {['الاسم','النوع','الحالة',''].map(h => (
                <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categories?.map(cat => (
              <tr key={cat.id} className="border-b border-border/50">
                <td className="px-3 py-2 font-medium">{cat.name_ar}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-1 rounded ${cat.type === 'fixed' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {cat.type === 'fixed' ? 'ثابت' : 'متغير'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs ${cat.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                    {cat.is_active ? 'نشط' : 'غير نشط'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Default Prices Tab
function DefaultPricesTab() {
  const { data: products } = useProducts()
  const { data: customers } = useCustomers()
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [bulkPrice, setBulkPrice] = useState('')
  const { data: existingPrices } = useCustomerPrices(selectedCustomer || undefined)
  const { mutateAsync: upsertPrices, isPending } = useUpsertCustomerPrices()

  function handleCustomerChange(customerId: string) {
    setSelectedCustomer(customerId)
    setPrices({})
    setBulkPrice('')
  }

  function applyBulkPrice() {
    const v = parseFloat(bulkPrice)
    if (!v || v <= 0 || !products) return
    const all: Record<string, string> = {}
    products.forEach(p => { all[p.id] = String(v) })
    setPrices(all)
  }

  // Sync existing prices into form when they load
  useEffect(() => {
    if (!selectedCustomer || !existingPrices) return
    const loaded: Record<string, string> = {}
    existingPrices.forEach(p => { loaded[p.product_id] = String(p.price_per_kg) })
    setPrices(loaded)
  }, [existingPrices, selectedCustomer])

  async function handleSave() {
    if (!selectedCustomer) { toast.error('اختر عميلاً أولاً'); return }
    const rows = Object.entries(prices)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([productId, price]) => ({
        customer_id: selectedCustomer,
        product_id: productId,
        price_per_kg: parseFloat(price),
      }))
    if (rows.length === 0) { toast.error('أدخل سعراً واحداً على الأقل'); return }
    try {
      await upsertPrices(rows)
      toast.success(`تم حفظ ${rows.length} سعر`)
    } catch {
      toast.error('حدث خطأ أثناء الحفظ')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-4 flex-wrap">
        <div className="space-y-1 flex-1 max-w-xs">
          <Label>اختر العميل لإدارة أسعاره</Label>
          <Select value={selectedCustomer} onValueChange={handleCustomerChange}>
            <SelectTrigger><SelectValue placeholder="اختر عميلاً" /></SelectTrigger>
            <SelectContent>
              {customers?.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {selectedCustomer && (
          <>
            <div className="space-y-1">
              <Label>سعر موحد لكل الأصناف</Label>
              <div className="flex gap-2">
                <Input
                  type="number" min="0" step="0.01" placeholder="0.00"
                  value={bulkPrice} onChange={e => setBulkPrice(e.target.value)}
                  className="w-32" dir="ltr"
                />
                <Button variant="outline" onClick={applyBulkPrice} disabled={!bulkPrice}>
                  تطبيق على الكل
                </Button>
              </div>
            </div>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? 'جاري الحفظ...' : 'حفظ الأسعار'}
            </Button>
          </>
        )}
      </div>

      {!selectedCustomer && (
        <p className="text-sm text-muted-foreground text-center py-8">اختر عميلاً لعرض وتعديل أسعار البيع الافتراضية</p>
      )}

      {selectedCustomer && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-3 py-2 text-right text-muted-foreground">الصنف</th>
                <th className="px-3 py-2 text-right text-muted-foreground">الفئة</th>
                <th className="px-3 py-2 text-right text-muted-foreground">سعر البيع (ر.س/كج)</th>
                <th className="px-3 py-2 text-right text-muted-foreground">السعر المحفوظ</th>
              </tr>
            </thead>
            <tbody>
              {products?.map(p => {
                const saved = existingPrices?.find(ep => ep.product_id === p.id)
                return (
                  <tr key={p.id} className="border-b border-border/50">
                    <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                    <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        value={prices[p.id] ?? ''}
                        onChange={e => setPrices(prev => ({ ...prev, [p.id]: e.target.value }))}
                        className="w-28 text-sm"
                        dir="ltr"
                      />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {saved ? formatNumber(saved.price_per_kg) : '—'}
                    </td>
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

// Opening Balance Tab
function OpeningBalanceTab() {
  const { data: products } = useProducts()
  const { data: latestCosts } = useLatestPurchaseCosts()
  const [date, setDate] = useState(() => {
    const d = new Date(todayISO() + 'T12:00:00')
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [balances, setBalances] = useState<Record<string, { qty: string; cost: string }>>({})
  const [editId, setEditId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const [editCost, setEditCost] = useState('')
  const { data: existing } = useInventoryDaily(date)
  const { mutateAsync: upsert, isPending: isSaving } = useUpsertInventory()
  const { mutateAsync: del } = useDeleteInventory()

  async function handleSave() {
    const rows = Object.entries(balances)
      .filter(([, v]) => parseFloat(v.qty) > 0)
      .map(([pid, v]) => {
        const qty = parseFloat(v.qty) || 0
        const cost = parseFloat(v.cost) || (latestCosts?.[pid] ?? 0)
        return { product_id: pid, date, opening_stock_kg: qty, opening_cost_per_kg: cost, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: cost }
      })
    if (rows.length === 0) { toast.error('أدخل كمية واحدة على الأقل'); return }
    try { await upsert(rows); toast.success(`تم حفظ ${rows.length} صنف`); setBalances({}) }
    catch { toast.error('حدث خطأ') }
  }

  async function handleUpdate(pid: string) {
    const qty = parseFloat(editQty); const cost = parseFloat(editCost)
    if (isNaN(qty) || qty < 0) return
    try {
      await upsert([{ product_id: pid, date, opening_stock_kg: qty, opening_cost_per_kg: cost || 0, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: qty, weighted_avg_cost: cost || 0 }])
      toast.success('تم التعديل'); setEditId(null)
    } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Label>تاريخ الرصيد الافتتاحي</Label>
        <Input type="date" value={date} onChange={e => { setDate(e.target.value); setBalances({}) }} className="w-48" dir="ltr" />
        <p className="text-xs text-muted-foreground">يُدخل الرصيد الافتتاحي مرة واحدة فقط في بداية استخدام النظام</p>
      </div>

      {(existing ?? []).length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 border-b border-border">
            <p className="text-sm font-medium">الأرصدة المحفوظة — {formatDate(date)}</p>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border">
              {['الصنف','الفئة','الكمية (كج)','التكلفة/كج',''].map(h => (
                <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(existing ?? []).map(j => (
                <tr key={j.product_id} className="border-b last:border-b-0 border-border/50">
                  <td className="px-3 py-2 font-medium">{j.product?.name_ar ?? j.product_id}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{j.product?.category}</Badge></td>
                  <td className="px-3 py-2">
                    {editId === j.product_id
                      ? <Input type="number" min="0" step="0.01" value={editQty} onChange={e => setEditQty(e.target.value)} className="w-24 text-sm" dir="ltr" autoFocus />
                      : <span className="font-medium">{formatNumber(j.opening_stock_kg)}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {editId === j.product_id
                      ? <Input type="number" min="0" step="0.01" value={editCost} onChange={e => setEditCost(e.target.value)} className="w-24 text-sm" dir="ltr" />
                      : formatNumber(j.weighted_avg_cost)}
                  </td>
                  <td className="px-3 py-2">
                    {editId === j.product_id ? (
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => handleUpdate(j.product_id)} disabled={isSaving}>حفظ</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>إلغاء</Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditId(j.product_id); setEditQty(String(j.opening_stock_kg)); setEditCost(String(j.weighted_avg_cost)) }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:text-danger" onClick={() => del({ product_id: j.product_id, date }).then(() => toast.success('تم الحذف'))}>
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
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/50 px-3 py-2 border-b border-border flex items-center justify-between">
          <p className="text-sm font-medium">إضافة أصناف جديدة</p>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'جاري الحفظ...' : 'حفظ الأرصدة'}
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border">
            {['الصنف','الفئة','الكمية (كج)','التكلفة/كج'].map(h => (
              <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(products ?? []).map(p => {
              const isExisting = (existing ?? []).some(j => j.product_id === p.id)
              if (isExisting) return null
              return (
                <tr key={p.id} className="border-b last:border-b-0 border-border/50">
                  <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.01" placeholder="0"
                      value={balances[p.id]?.qty ?? ''}
                      onChange={e => setBalances(prev => ({ ...prev, [p.id]: { ...prev[p.id], qty: e.target.value, cost: prev[p.id]?.cost ?? String(latestCosts?.[p.id] ?? '') } }))}
                      className="w-28 text-sm" dir="ltr" />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.01" placeholder={String(latestCosts?.[p.id] ?? '0')}
                      value={balances[p.id]?.cost ?? ''}
                      onChange={e => setBalances(prev => ({ ...prev, [p.id]: { ...prev[p.id], cost: e.target.value, qty: prev[p.id]?.qty ?? '' } }))}
                      className="w-28 text-sm" dir="ltr" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Site Settings Tab
const SITE_SETTINGS_KEY = 'gb_site_settings'
interface SiteSettings { name: string; tagline: string; phone: string; address: string; logo: string }
const defaultSite: SiteSettings = { name: 'Greenbasket', tagline: 'نظام إدارة المتجر', phone: '', address: '', logo: '' }

function SiteSettingsTab() {
  const [settings, setSettings] = useState<SiteSettings>(() => {
    try { return { ...defaultSite, ...JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) ?? '{}') } }
    catch { return defaultSite }
  })
  const [saved, setSaved] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  function handleSave() {
    localStorage.setItem(SITE_SETTINGS_KEY, JSON.stringify(settings))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setSettings(s => ({ ...s, logo: String(ev.target?.result ?? '') }))
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-center gap-6">
        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex items-center justify-center overflow-hidden bg-muted/40 cursor-pointer" onClick={() => logoRef.current?.click()}>
          {settings.logo
            ? <img src={settings.logo} alt="logo" className="w-full h-full object-contain" />
            : <span className="text-xs text-muted-foreground text-center px-2">اضغط لرفع الشعار</span>
          }
        </div>
        <div>
          <p className="text-sm font-medium">شعار المنشأة</p>
          <p className="text-xs text-muted-foreground">صورة PNG/JPG بحجم مناسب</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => logoRef.current?.click()}>تغيير الشعار</Button>
        </div>
        <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />
      </div>

      {([
        { label: 'اسم المنشأة', key: 'name' as keyof SiteSettings, placeholder: 'Greenbasket' },
        { label: 'الوصف / الشعار', key: 'tagline' as keyof SiteSettings, placeholder: 'نظام إدارة المتجر' },
        { label: 'رقم الهاتف', key: 'phone' as keyof SiteSettings, placeholder: '05xxxxxxxx', dir: 'ltr' as const },
        { label: 'العنوان', key: 'address' as keyof SiteSettings, placeholder: 'المدينة، الحي...' },
      ]).map(f => (
        <div key={f.key} className="space-y-1">
          <Label>{f.label}</Label>
          <Input
            value={settings[f.key]}
            onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            dir={f.dir}
          />
        </div>
      ))}

      <Button onClick={handleSave} className="gap-2">
        {saved ? '✓ تم الحفظ' : 'حفظ الإعدادات'}
      </Button>
    </div>
  )
}

// Users Tab
function UsersTab() {
  const { data: users, isLoading } = useAllUsers()
  const { mutateAsync: upsertRole, isPending } = useUpsertUserRole()
  const canEdit = usePermission('users.edit')
  const { session } = useAuth()

  const ROLE_LABELS: Record<AppRole, string> = {
    admin: 'مدير',
    manager: 'مشرف',
    viewer: 'مشاهد',
  }

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">جاري التحميل...</p>

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          أنت في وضع المشاهدة فقط — تغيير الأدوار يتطلب صلاحية مدير
        </div>
      )}
      <div className="text-xs text-muted-foreground space-y-0.5 p-3 bg-muted/30 rounded-lg border border-border/50">
        <p><strong>مدير:</strong> صلاحيات كاملة + إدارة المستخدمين والإعدادات</p>
        <p><strong>مشرف:</strong> إضافة وتعديل المشتريات والمبيعات والمخزون</p>
        <p><strong>مشاهد:</strong> عرض فقط بدون تعديل</p>
      </div>
      {(users ?? []).length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">لا توجد بيانات مستخدمين</p>
          {session?.user && (
            <Button
              onClick={() => upsertRole({
                id: session.user.id,
                email: session.user.email ?? '',
                role: 'admin',
                name: session.user.user_metadata?.name ?? session.user.email ?? 'مدير',
              })}
              disabled={isPending}
              className="gap-2"
            >
              {isPending ? 'جاري...' : 'سجّل نفسك مديراً للنظام'}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">تأكد من تشغيل SQL الخاص بجدول user_profiles في Supabase</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50 border-b border-border">
              {['الاسم','البريد الإلكتروني','الدور',''].map(h => (
                <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(users ?? []).map(u => (
                <tr key={u.id} className="border-b last:border-b-0 border-border/50">
                  <td className="px-3 py-2 font-medium">{u.name ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground" dir="ltr">{u.email}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={u.role === 'admin' ? 'text-primary' : u.role === 'manager' ? 'text-warning' : 'text-muted-foreground'}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <Select value={u.role} onValueChange={v => upsertRole({ id: u.id, role: v as AppRole, email: u.email, name: u.name })}>
                        <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">مدير</SelectItem>
                          <SelectItem value="manager">مشرف</SelectItem>
                          <SelectItem value="viewer">مشاهد</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {isPending && <p className="text-xs text-muted-foreground">جاري الحفظ...</p>}
    </div>
  )
}

// ── Settings sections definition ───────────────────────────────────────────
interface Section { id: string; label: string; icon: React.ElementType; title: string; content: ReactNode }

export default function Settings() {
  const [active, setActive] = useState('products')

  const sections: Section[] = [
    { id: 'products',  label: 'الأصناف',           icon: Package,      title: 'إدارة الأصناف',                      content: <ProductsTab /> },
    { id: 'customers', label: 'العملاء',            icon: Users,        title: 'إدارة العملاء',                       content: <CustomersTab /> },
    { id: 'costs',     label: 'التكاليف',           icon: DollarSign,   title: 'أنواع التكاليف غير المباشرة',          content: <CostCategoriesTab /> },
    { id: 'prices',    label: 'أسعار البيع',        icon: Tags,         title: 'أسعار البيع الافتراضية لكل عميل',      content: <DefaultPricesTab /> },
    { id: 'opening',   label: 'الرصيد الافتتاحي',  icon: BarChart2,    title: 'الرصيد الافتتاحي للمخزون',            content: <OpeningBalanceTab /> },
    { id: 'users',     label: 'المستخدمون',         icon: UserCog,      title: 'إدارة المستخدمين والصلاحيات',          content: <UsersTab /> },
    { id: 'site',      label: 'بيانات الموقع',      icon: SettingsIcon, title: 'بيانات المنشأة والموقع',               content: <SiteSettingsTab /> },
  ]

  const current = sections.find(s => s.id === active) ?? sections[0]

  return (
    <div className="flex gap-0 min-h-[600px] rounded-xl border border-border overflow-hidden bg-card">
      {/* Sidebar */}
      <nav className="w-52 shrink-0 border-l border-border bg-muted/30 p-2 space-y-0.5">
        <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">الإعدادات</p>
        {sections.map(s => (
          <button
            key={s.id}
            onClick={() => setActive(s.id)}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
              active === s.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <s.icon className="w-4 h-4 shrink-0" />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 min-w-0 p-6">
        <h2 className="text-base font-semibold text-foreground mb-5 pb-3 border-b border-border">{current.title}</h2>
        {current.content}
      </div>
    </div>
  )
}
