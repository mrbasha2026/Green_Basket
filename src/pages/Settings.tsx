import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useAllProducts, useUpsertProduct } from '@/hooks/useProducts'
import { useAllCustomers, useUpsertCustomer } from '@/hooks/useCustomers'
import { useCostCategories, useUpsertCostCategory } from '@/hooks/useOverhead'
import { useCustomerPrices, useUpsertCustomerPrices } from '@/hooks/useCustomerPrices'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import type { Product, Customer, CostCategory } from '@/types'
import { Plus, Pencil } from 'lucide-react'
import { formatNumber } from '@/lib/utils'

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
  const { data: existingPrices } = useCustomerPrices(selectedCustomer || undefined)
  const { mutateAsync: upsertPrices, isPending } = useUpsertCustomerPrices()

  function handleCustomerChange(customerId: string) {
    setSelectedCustomer(customerId)
    setPrices({})
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
      <div className="flex items-end gap-4">
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
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? 'جاري الحفظ...' : 'حفظ الأسعار'}
          </Button>
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

export default function Settings() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="products">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="products">الأصناف</TabsTrigger>
          <TabsTrigger value="customers">العملاء</TabsTrigger>
          <TabsTrigger value="costs">أنواع التكاليف</TabsTrigger>
          <TabsTrigger value="prices">أسعار البيع</TabsTrigger>
        </TabsList>
        <TabsContent value="products">
          <Card>
            <CardHeader><CardTitle className="text-base">إدارة الأصناف</CardTitle></CardHeader>
            <CardContent><ProductsTab /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="customers">
          <Card>
            <CardHeader><CardTitle className="text-base">إدارة العملاء</CardTitle></CardHeader>
            <CardContent><CustomersTab /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="costs">
          <Card>
            <CardHeader><CardTitle className="text-base">أنواع التكاليف غير المباشرة</CardTitle></CardHeader>
            <CardContent><CostCategoriesTab /></CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="prices">
          <Card>
            <CardHeader><CardTitle className="text-base">أسعار البيع الافتراضية لكل عميل</CardTitle></CardHeader>
            <CardContent><DefaultPricesTab /></CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
