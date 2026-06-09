import React, { useState, useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { usePermission } from '@/hooks/usePermissions'
import { useAllUsers, useUpsertUserProfile, useCreateUser, useAllRoles, useRolePermissions, useCreateRole, useDeleteRole } from '@/hooks/useRoles'
import { useAuth } from '@/hooks/useAuth'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useSiteSettings, useUpsertSiteSettings } from '@/hooks/useSiteSettings'
import { RoleEditor } from '@/components/permissions/RoleEditor'
import { Building2, UserCog, Settings as SettingsIcon, Download, Archive, Shield, Plus, Trash2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
              <SelectContent>
                <SelectItem value="SAR">ريال سعودي (SAR)</SelectItem>
                <SelectItem value="USD">دولار (USD)</SelectItem>
                <SelectItem value="EUR">يورو (EUR)</SelectItem>
              </SelectContent>
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

// ── Users Tab ──────────────────────────────────────────────────────────────────
function UsersTab() {
  const { data: users, isLoading } = useAllUsers()
  const { data: roles } = useAllRoles()
  const { mutateAsync: upsertProfile } = useUpsertUserProfile()
  const { mutateAsync: createUser, isPending: creating } = useCreateUser()
  const canEdit = usePermission('settings.users', 'edit')
  const canAdd = usePermission('settings.users', 'add')
  const { session } = useAuth()

  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ email: '', name: '', password: '', role_id: '' })
  const [showPassword, setShowPassword] = useState(false)
  const bootstrapped = useRef(false)

  // تسجيل تلقائي كمدير عند فتح التبويب إذا لم يكن هناك مستخدمون
  useEffect(() => {
    if (bootstrapped.current) return
    if (isLoading || !users || users.length > 0) return
    if (!session?.user || !roles || roles.length === 0) return
    const adminRole = roles.find(r => r.is_system)
    if (!adminRole) return
    bootstrapped.current = true
    upsertProfile({
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.user_metadata?.name ?? 'مدير',
      role_id: adminRole.id,
    }).catch(() => { bootstrapped.current = false })
  }, [isLoading, users, session, roles, upsertProfile])

  async function handleCreate() {
    if (!createForm.email || !createForm.password || !createForm.role_id) return
    try {
      await createUser(createForm)
      toast.success('تم إنشاء المستخدم بنجاح')
      setShowCreate(false)
      setCreateForm({ email: '', name: '', password: '', role_id: '' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'حدث خطأ'
      toast.error(msg)
    }
  }

  async function handleRegisterSelf() {
    if (!session?.user) return
    const adminRole = roles?.find(r => r.is_system)
    if (!adminRole) return
    try {
      await upsertProfile({ id: session.user.id, email: session.user.email ?? '', name: session.user.user_metadata?.name ?? 'مدير', role_id: adminRole.id })
      toast.success('تم تسجيلك مديراً للنظام')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'فشل تسجيل المستخدم')
    }
  }

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">جاري التحميل...</p>

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="text-sm text-warning bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          أنت في وضع المشاهدة فقط
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">المستخدمون</h3>
        {canAdd && (
          <Button size="sm" className="gap-1" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />إضافة مستخدم
          </Button>
        )}
      </div>

      {(users ?? []).length === 0 ? (
        <div className="text-center py-8 space-y-3">
          <p className="text-sm text-muted-foreground">لا توجد بيانات مستخدمين</p>
          {session?.user && roles && roles.length > 0 && (
            <Button onClick={handleRegisterSelf}>سجّل نفسك مديراً للنظام</Button>
          )}
          <p className="text-xs text-muted-foreground">تأكد من تشغيل migrations/permissions.sql في Supabase</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                {['الاسم', 'البريد الإلكتروني', 'الدور', ''].map(h => (
                  <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(users ?? []).map(u => (
                <tr key={u.id} className="border-b last:border-b-0 border-border/50 hover:bg-muted/20">
                  <td className="px-3 py-2 font-medium">{u.name ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground text-xs" dir="ltr">{u.email}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{u.role?.name ?? '—'}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <Select
                        value={u.role_id ?? ''}
                        onValueChange={v => upsertProfile({ id: u.id, role_id: v, email: u.email, name: u.name })}
                      >
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="اختر دوراً" /></SelectTrigger>
                        <SelectContent>
                          {(roles ?? []).map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
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

      {/* Create User Dialog */}
      <Dialog open={showCreate} onOpenChange={v => { setShowCreate(v); if (!v) setCreateForm({ email: '', name: '', password: '', role_id: '' }) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>إضافة مستخدم جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">الاسم</Label>
              <Input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المستخدم" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">البريد الإلكتروني</Label>
              <Input value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} placeholder="user@example.com" dir="ltr" className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">كلمة المرور</Label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  placeholder="كلمة المرور"
                  dir="ltr"
                  className="h-9 pl-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  {showPassword ? 'إخفاء' : 'إظهار'}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الدور</Label>
              <Select value={createForm.role_id} onValueChange={v => setCreateForm(f => ({ ...f, role_id: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="اختر دوراً" /></SelectTrigger>
                <SelectContent>
                  {(roles ?? []).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={creating || !createForm.email || !createForm.password || !createForm.role_id}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء المستخدم'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Roles Tab ──────────────────────────────────────────────────────────────────
function RolesTab() {
  const { data: roles, isLoading } = useAllRoles()
  const canEdit = usePermission('settings.roles', 'edit')
  const { mutateAsync: createRole, isPending: creating } = useCreateRole()
  const { mutateAsync: deleteRole } = useDeleteRole()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')

  const selectedRole = roles?.find(r => r.id === selectedId) ?? roles?.[0] ?? null
  const { data: rolePerms } = useRolePermissions(selectedRole?.id)

  useEffect(() => {
    if (!selectedId && roles && roles.length > 0) setSelectedId(roles[0].id)
  }, [roles, selectedId])

  async function handleCreate() {
    if (!newRoleName.trim()) return
    const role = await createRole({ name: newRoleName.trim(), description: newRoleDesc.trim() || undefined })
    toast.success('تم إنشاء الدور')
    setSelectedId(role.id)
    setShowCreate(false)
    setNewRoleName('')
    setNewRoleDesc('')
  }

  async function handleDelete(id: string) {
    await deleteRole(id)
    toast.success('تم حذف الدور')
    setSelectedId(null)
  }

  if (isLoading) return <p className="text-sm text-muted-foreground py-4">جاري التحميل...</p>

  return (
    <div className="flex gap-4 h-full">
      {/* قائمة الأدوار */}
      <div className="w-44 shrink-0 space-y-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-muted-foreground">الأدوار</span>
          {canEdit && (
            <button onClick={() => setShowCreate(true)} className="text-primary hover:text-primary/80">
              <Plus className="w-4 h-4" />
            </button>
          )}
        </div>
        {(roles ?? []).map(role => (
          <div
            key={role.id}
            className={cn(
              'flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors',
              selectedId === role.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
            )}
            onClick={() => setSelectedId(role.id)}
          >
            <span className="truncate">{role.name}</span>
            {!role.is_system && canEdit && (
              <button
                onClick={e => { e.stopPropagation(); handleDelete(role.id) }}
                className={cn('shrink-0', selectedId === role.id ? 'text-primary-foreground/70 hover:text-primary-foreground' : 'text-muted-foreground hover:text-destructive')}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}

        {/* Create Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>إنشاء دور جديد</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">اسم الدور</Label>
                <Input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="مثال: مدير مبيعات" className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الوصف (اختياري)</Label>
                <Input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="وصف مختصر..." className="h-9" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button onClick={handleCreate} disabled={creating || !newRoleName.trim()}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* محرر الصلاحيات */}
      <div className="flex-1 min-w-0">
        {selectedRole && rolePerms ? (
          <RoleEditor role={selectedRole} permissions={rolePerms} />
        ) : (
          <p className="text-sm text-muted-foreground">اختر دوراً من القائمة</p>
        )}
      </div>
    </div>
  )
}

const DAILY_STOCKTAKE_KEY = 'gb_daily_stocktake_count'

// ── System Settings Tab ────────────────────────────────────────────────────────
function SystemTab() {
  const [theme, setTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  const [dailyCount, setDailyCount] = useState(() => {
    const saved = localStorage.getItem(DAILY_STOCKTAKE_KEY)
    return saved ? String(parseInt(saved, 10) || 5) : '5'
  })

  function applyTheme(t: string) {
    setTheme(t)
    document.documentElement.classList.toggle('dark', t === 'dark')
    localStorage.setItem('gb_theme', t)
  }

  function saveDailyCount() {
    const n = Math.max(1, Math.min(20, parseInt(dailyCount, 10) || 5))
    localStorage.setItem(DAILY_STOCKTAKE_KEY, String(n))
    setDailyCount(String(n))
    // Reset today's stocktake so new count takes effect tomorrow
    toast.success(`تم الحفظ — سيُطبّق العدد الجديد (${n} أصناف) من الغد`)
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="text-base font-semibold mb-4">الجرد اليومي العشوائي</h3>
        <div className="flex items-end gap-3 p-4 bg-muted/30 rounded-xl border border-border">
          <div className="space-y-1 flex-1">
            <Label className="text-xs">عدد الأصناف المجردة يومياً</Label>
            <Input
              type="number"
              min="1"
              max="20"
              value={dailyCount}
              onChange={e => setDailyCount(e.target.value)}
              className="w-24 h-9"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">الحد: 1–20 صنف يومياً</p>
          </div>
          <Button onClick={saveDailyCount} className="h-9">حفظ</Button>
        </div>
      </div>
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
    const a = document.createElement('a')
    a.href = url; a.download = `greenbasket-backup-${new Date().toISOString().split('T')[0]}.json`; a.click()
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
type Section = 'company' | 'users' | 'roles' | 'system' | 'backup'
interface SidebarSection { id: Section; label: string; icon: React.ElementType; group?: string }

const SECTIONS: SidebarSection[] = [
  { id: 'company', label: 'إعدادات الشركة', icon: Building2, group: 'الإعدادات العامة' },
  { id: 'system', label: 'إعدادات النظام', icon: SettingsIcon, group: 'الإعدادات العامة' },
  { id: 'backup', label: 'النسخ الاحتياطي والـ SQL', icon: Archive, group: 'الإعدادات العامة' },
  { id: 'users', label: 'إدارة المستخدمين', icon: UserCog, group: 'الصلاحيات' },
  { id: 'roles', label: 'إدارة الأدوار', icon: Shield, group: 'الصلاحيات' },
]

const CONTENT: Record<Section, ReactNode> = {
  company: <CompanyTab />,
  system: <SystemTab />,
  backup: <BackupTab />,
  users: <UsersTab />,
  roles: <RolesTab />,
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
