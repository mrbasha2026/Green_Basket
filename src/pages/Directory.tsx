import { useState, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DataTable } from '@/components/tables/DataTable'
import { useAllCustomers, useUpsertCustomer } from '@/hooks/useCustomers'
import { useAllProducts, useUpsertProduct, useToggleProductActive, useProductAliases } from '@/hooks/useProducts'
import { usePermission } from '@/hooks/usePermissions'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { Customer, Product } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'
import { Plus, Pencil, Eye, EyeOff, UserX, UserCheck, X, Users, BookMarked } from 'lucide-react'

type CustomerType = 'مستشفى' | 'فندق' | 'مطعم' | 'تجزئة'
type ProductCategory = 'خضار' | 'فاكهة' | 'أعشاب'

// ── Aliases manager — component منفصل لاستخدام hook بشكل صحيح ──────────────
function AliasesSection({ productId }: { productId: string }) {
  const qc = useQueryClient()
  const { data: aliases, isLoading } = useProductAliases(productId)
  const [newAlias, setNewAlias] = useState('')

  async function addAlias() {
    const alias = newAlias.trim().toUpperCase()
    if (!alias) return
    const { error } = await supabase
      .from('product_aliases')
      .upsert({ alias, product_id: productId }, { onConflict: 'alias' })
    if (error) { toast.error('حدث خطأ أثناء الإضافة'); return }
    qc.invalidateQueries({ queryKey: ['product_aliases', productId] })
    setNewAlias('')
  }

  async function removeAlias(id: string) {
    const { error } = await supabase.from('product_aliases').delete().eq('id', id)
    if (error) { toast.error('حدث خطأ أثناء الحذف'); return }
    qc.invalidateQueries({ queryKey: ['product_aliases', productId] })
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">الأسماء البديلة (من الـ Sheet)</Label>
      <div className="min-h-[28px]">
        {isLoading ? (
          <Skeleton className="h-7 w-40" />
        ) : aliases && aliases.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {aliases.map(a => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-xs font-mono"
              >
                {a.alias}
                <button
                  onClick={() => removeAlias(a.id)}
                  className="text-muted-foreground hover:text-danger transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">لا توجد أسماء بديلة</p>
        )}
      </div>
      <div className="flex gap-2">
        <Input
          value={newAlias}
          onChange={e => setNewAlias(e.target.value)}
          placeholder="اسم بديل جديد..."
          className="h-7 text-xs font-mono"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
        />
        <Button size="sm" variant="outline" onClick={addAlias} className="h-7 text-xs shrink-0">
          إضافة
        </Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Directory() {
  const canAdd    = usePermission('directory', 'add')
  const canEdit   = usePermission('directory', 'edit')
  const canDelete = usePermission('directory', 'delete')

  // ── Data ────────────────────────────────────────────────────────────────────
  const { data: allCustomers, isLoading: customersLoading } = useAllCustomers()
  const { data: allProducts,  isLoading: productsLoading  } = useAllProducts()
  const { mutateAsync: upsertCustomer, isPending: savingCustomer } = useUpsertCustomer()
  const { mutateAsync: upsertProduct,  isPending: savingProduct  } = useUpsertProduct()
  const { mutateAsync: toggleProduct } = useToggleProductActive()

  // ── Customers tab state ──────────────────────────────────────────────────────
  const [cSearch,   setCSearch]   = useState('')
  const [cType,     setCType]     = useState('all')
  const [cInactive, setCInactive] = useState(false)
  const [cDialog,   setCDialog]   = useState(false)
  const [cEdit,     setCEdit]     = useState<Customer | null>(null)
  const [cForm, setCForm] = useState<{ name_ar: string; type: CustomerType; is_active: boolean }>(
    { name_ar: '', type: 'مطعم', is_active: true }
  )

  // ── Products tab state ───────────────────────────────────────────────────────
  const [pSearch,   setPSearch]   = useState('')
  const [pCat,      setPCat]      = useState('all')
  const [pInactive, setPInactive] = useState(false)
  const [pDialog,   setPDialog]   = useState(false)
  const [pEdit,     setPEdit]     = useState<Product | null>(null)
  const [pForm, setPForm] = useState<{
    name_ar: string; name_en: string; category: ProductCategory
    unit: string; sort_order: number; is_active: boolean
  }>({ name_ar: '', name_en: '', category: 'خضار', unit: 'كج', sort_order: 0, is_active: true })

  // ── Filtered data ────────────────────────────────────────────────────────────
  const filteredCustomers = useMemo(() => (allCustomers ?? []).filter(c => {
    if (!cInactive && !c.is_active) return false
    if (cType !== 'all' && c.type !== cType) return false
    if (cSearch && !c.name_ar.includes(cSearch)) return false
    return true
  }), [allCustomers, cSearch, cType, cInactive])

  const filteredProducts = useMemo(() => (allProducts ?? []).filter(p => {
    if (!pInactive && !p.is_active) return false
    if (pCat !== 'all' && p.category !== pCat) return false
    if (pSearch && !p.name_ar.includes(pSearch) && !(p.name_en?.toLowerCase().includes(pSearch.toLowerCase()))) return false
    return true
  }), [allProducts, pSearch, pCat, pInactive])

  // ── Customer handlers ────────────────────────────────────────────────────────
  function openAddCustomer() {
    setCEdit(null)
    setCForm({ name_ar: '', type: 'مطعم', is_active: true })
    setCDialog(true)
  }
  function openEditCustomer(c: Customer) {
    setCEdit(c)
    setCForm({ name_ar: c.name_ar, type: c.type, is_active: c.is_active })
    setCDialog(true)
  }
  async function saveCustomer() {
    if (!cForm.name_ar.trim()) { toast.error('الاسم مطلوب'); return }
    try {
      await upsertCustomer({ ...(cEdit ? { id: cEdit.id } : {}), ...cForm })
      toast.success(cEdit ? 'تم تحديث العميل' : 'تمت إضافة العميل')
      setCDialog(false)
    } catch { toast.error('حدث خطأ') }
  }

  // ── Product handlers ─────────────────────────────────────────────────────────
  function openAddProduct() {
    setPEdit(null)
    setPForm({ name_ar: '', name_en: '', category: 'خضار', unit: 'كج', sort_order: (allProducts?.length ?? 0) + 1, is_active: true })
    setPDialog(true)
  }
  function openEditProduct(p: Product) {
    setPEdit(p)
    setPForm({ name_ar: p.name_ar, name_en: p.name_en ?? '', category: p.category, unit: p.unit, sort_order: p.sort_order, is_active: p.is_active })
    setPDialog(true)
  }
  async function saveProduct() {
    if (!pForm.name_ar.trim()) { toast.error('الاسم بالعربية مطلوب'); return }
    try {
      await upsertProduct({ ...(pEdit ? { id: pEdit.id } : {}), ...pForm })
      toast.success(pEdit ? 'تم تحديث الصنف' : 'تمت إضافة الصنف')
      setPDialog(false)
    } catch { toast.error('حدث خطأ') }
  }

  // ── Table columns ────────────────────────────────────────────────────────────
  const customerCols: ColumnDef<Customer>[] = [
    {
      accessorKey: 'name_ar',
      header: 'الاسم',
    },
    {
      accessorKey: 'type',
      header: 'النوع',
      cell: ({ getValue }) => (
        <Badge variant="outline" className="text-xs font-normal">{getValue() as string}</Badge>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'الحالة',
      cell: ({ getValue }) => (
        <Badge variant={getValue() ? 'default' : 'secondary'} className="text-xs">
          {getValue() ? 'نشط' : 'موقوف'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="flex gap-1 justify-end">
            {canEdit && (
              <Button size="icon-sm" variant="ghost" title="تعديل" onClick={() => openEditCustomer(c)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon-sm" variant="ghost"
                title={c.is_active ? 'إيقاف' : 'تفعيل'}
                className={c.is_active ? 'text-muted-foreground hover:text-danger' : 'text-muted-foreground hover:text-success'}
                onClick={() => {
                  if (confirm(`هل تريد ${c.is_active ? 'إيقاف' : 'تفعيل'} العميل "${c.name_ar}"؟`))
                    upsertCustomer({ id: c.id, is_active: !c.is_active })
                }}
              >
                {c.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  const CAT_COLORS: Record<string, string> = {
    خضار: 'text-success',
    فاكهة: 'text-orange-500',
    أعشاب: 'text-emerald-600',
  }

  const productCols: ColumnDef<Product>[] = [
    {
      accessorKey: 'sort_order',
      header: '#',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">{getValue() as number}</span>
      ),
    },
    { accessorKey: 'name_ar', header: 'الاسم بالعربية' },
    {
      accessorKey: 'name_en',
      header: 'الرمز',
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-muted-foreground">{(getValue() as string | null) ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'category',
      header: 'الفئة',
      cell: ({ getValue }) => (
        <span className={cn('text-sm font-medium', CAT_COLORS[getValue() as string] ?? '')}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'unit',
      header: 'الوحدة',
      cell: ({ getValue }) => (
        <span className="text-xs text-muted-foreground">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: 'is_active',
      header: 'الحالة',
      cell: ({ getValue }) => (
        <Badge variant={getValue() ? 'default' : 'secondary'} className="text-xs">
          {getValue() ? 'نشط' : 'موقوف'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="flex gap-1 justify-end">
            {canEdit && (
              <Button size="icon-sm" variant="ghost" title="تعديل" onClick={() => openEditProduct(p)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button
                size="icon-sm" variant="ghost"
                title={p.is_active ? 'إيقاف' : 'تفعيل'}
                className={p.is_active ? 'text-muted-foreground hover:text-warning' : 'text-muted-foreground hover:text-success'}
                onClick={() => {
                  if (confirm(`هل تريد ${p.is_active ? 'إيقاف' : 'تفعيل'} الصنف "${p.name_ar}"؟`))
                    toggleProduct({ id: p.id, is_active: !p.is_active })
                }}
              >
                {p.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <BookMarked className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold leading-none">الفهرس</h1>
          <p className="text-sm text-muted-foreground mt-0.5">مراجعة وإدارة العملاء والأصناف</p>
        </div>
      </div>

      <Tabs defaultValue="customers">
        <TabsList>
          <TabsTrigger value="customers">
            <Users className="w-4 h-4" />
            العملاء
            {!customersLoading && (
              <Badge variant="secondary" className="text-xs h-4 px-1.5 mr-1">
                {allCustomers?.length ?? 0}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="products">
            <BookMarked className="w-4 h-4" />
            الأصناف
            {!productsLoading && (
              <Badge variant="secondary" className="text-xs h-4 px-1.5 mr-1">
                {allProducts?.length ?? 0}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Customers ──────────────────────────────────────────────────────── */}
        <TabsContent value="customers" className="mt-3">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2 items-center bg-muted/30 border border-border rounded-lg px-3 py-2.5 mb-4">
                <Input
                  placeholder="بحث بالاسم..."
                  value={cSearch}
                  onChange={e => setCSearch(e.target.value)}
                  className="h-8 w-48 text-sm bg-background"
                />
                <Select value={cType} onValueChange={setCType}>
                  <SelectTrigger className="h-8 w-36 text-xs bg-background">
                    <SelectValue placeholder="كل الأنواع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأنواع</SelectItem>
                    {(['مستشفى', 'فندق', 'مطعم', 'تجزئة'] as CustomerType[]).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={cInactive ? 'default' : 'outline'}
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setCInactive(v => !v)}
                >
                  {cInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  الموقوفون
                </Button>
                {canAdd && (
                  <Button size="sm" className="h-8 text-xs gap-1.5 mr-auto" onClick={openAddCustomer}>
                    <Plus className="w-3.5 h-3.5" />إضافة عميل
                  </Button>
                )}
              </div>
              {customersLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <DataTable
                  data={filteredCustomers}
                  columns={customerCols}
                  showSearch={false}
                  defaultPageSize={20}
                  searchPlaceholder="بحث..."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Products ───────────────────────────────────────────────────────── */}
        <TabsContent value="products" className="mt-3">
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-2 items-center bg-muted/30 border border-border rounded-lg px-3 py-2.5 mb-4">
                <Input
                  placeholder="بحث بالاسم أو الرمز..."
                  value={pSearch}
                  onChange={e => setPSearch(e.target.value)}
                  className="h-8 w-48 text-sm bg-background"
                />
                <Select value={pCat} onValueChange={setPCat}>
                  <SelectTrigger className="h-8 w-36 text-xs bg-background">
                    <SelectValue placeholder="كل الفئات" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفئات</SelectItem>
                    {(['خضار', 'فاكهة', 'أعشاب'] as ProductCategory[]).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={pInactive ? 'default' : 'outline'}
                  className="h-8 text-xs gap-1.5"
                  onClick={() => setPInactive(v => !v)}
                >
                  {pInactive ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  الموقوفون
                </Button>
                {canAdd && (
                  <Button size="sm" className="h-8 text-xs gap-1.5 mr-auto" onClick={openAddProduct}>
                    <Plus className="w-3.5 h-3.5" />إضافة صنف
                  </Button>
                )}
              </div>
              {productsLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <DataTable
                  data={filteredProducts}
                  columns={productCols}
                  showSearch={false}
                  defaultPageSize={20}
                  searchPlaceholder="بحث..."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Customer dialog ─────────────────────────────────────────────────── */}
      <Dialog open={cDialog} onOpenChange={open => !open && setCDialog(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{cEdit ? 'تعديل عميل' : 'إضافة عميل جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs">الاسم <span className="text-danger">*</span></Label>
              <Input
                value={cForm.name_ar}
                onChange={e => setCForm(f => ({ ...f, name_ar: e.target.value }))}
                placeholder="اسم العميل"
                onKeyDown={e => e.key === 'Enter' && saveCustomer()}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">النوع</Label>
              <Select value={cForm.type} onValueChange={v => v && setCForm(f => ({ ...f, type: v as CustomerType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['مستشفى', 'فندق', 'مطعم', 'تجزئة'] as CustomerType[]).map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={cForm.is_active}
                onCheckedChange={v => setCForm(f => ({ ...f, is_active: v }))}
              />
              <span className="text-xs">نشط</span>
            </label>
          </div>
          <DialogFooter>
            <Button onClick={saveCustomer} disabled={savingCustomer}>
              {savingCustomer ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Product dialog ──────────────────────────────────────────────────── */}
      <Dialog open={pDialog} onOpenChange={open => !open && setPDialog(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{pEdit ? 'تعديل صنف' : 'إضافة صنف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">الاسم بالعربية <span className="text-danger">*</span></Label>
                <Input
                  value={pForm.name_ar}
                  onChange={e => setPForm(f => ({ ...f, name_ar: e.target.value }))}
                  placeholder="اسم الصنف"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الاسم بالإنجليزية</Label>
                <Input
                  dir="ltr"
                  value={pForm.name_en}
                  onChange={e => setPForm(f => ({ ...f, name_en: e.target.value }))}
                  placeholder="english name"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الفئة</Label>
                <Select value={pForm.category} onValueChange={v => v && setPForm(f => ({ ...f, category: v as ProductCategory }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['خضار', 'فاكهة', 'أعشاب'] as ProductCategory[]).map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الوحدة</Label>
                <Input
                  value={pForm.unit}
                  onChange={e => setPForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="كج"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الترتيب</Label>
                <Input
                  type="number"
                  value={pForm.sort_order}
                  onChange={e => setPForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Checkbox
                checked={pForm.is_active}
                onCheckedChange={v => setPForm(f => ({ ...f, is_active: v }))}
              />
              <span className="text-xs">نشط</span>
            </label>
            {pEdit && (
              <div className="pt-2 border-t border-border">
                <AliasesSection productId={pEdit.id} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={saveProduct} disabled={savingProduct}>
              {savingProduct ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
