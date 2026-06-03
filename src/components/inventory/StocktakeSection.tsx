import { useState, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  useStocktakeSessions, useStocktakeItems,
  useCreateStocktakeSession, useUpdateStocktakeSession, useDeleteStocktakeSession,
  useUpsertStocktakeItems, useDeleteStocktakeItem, useApproveStocktake,
  type StocktakeSession, type StocktakeItem,
} from '@/hooks/useStocktake'
import { useInventoryUpTo } from '@/hooks/useInventory'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useProducts } from '@/hooks/useProducts'
import { parseExcelFile, exportToExcel } from '@/lib/excel'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Eye, FileDown, Upload, CheckCircle, ClipboardList, ArrowRight } from 'lucide-react'

// ── Session list ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: StocktakeSession['status'] }) {
  const map = { draft: ['مسودة', 'bg-muted text-muted-foreground'], completed: ['مكتمل', 'bg-primary/15 text-primary'], approved: ['معتمد', 'bg-success/15 text-success'] } as const
  const [label, cls] = map[status]
  return <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', cls)}>{label}</span>
}

// ── Session Detail (edit/view) ─────────────────────────────────────────────────
function SessionDetail({
  session, onBack,
}: { session: StocktakeSession; onBack: () => void }) {
  const { data: items, isLoading } = useStocktakeItems(session.id)
  const { data: products } = useProducts()
  const { data: latestCosts } = useLatestPurchaseCosts()
  const { data: expectedBalances } = useInventoryUpTo(session.date)
  const { mutateAsync: upsertItems, isPending: isSaving } = useUpsertStocktakeItems()
  const { mutateAsync: deleteItem } = useDeleteStocktakeItem()
  const { mutateAsync: approve, isPending: isApproving } = useApproveStocktake()
  const { mutateAsync: updateSession } = useUpdateStocktakeSession()
  const importRef = useRef<HTMLInputElement>(null)

  // Local actual qty inputs
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [deleteId, setDeleteId] = useState<{ id: string; session_id: string } | null>(null)
  const [approveDialog, setApproveDialog] = useState(false)

  const isReadonly = session.status === 'approved'

  // Merge items with products
  const itemMap = useMemo(() => {
    const m = new Map<string, StocktakeItem>()
    items?.forEach(i => m.set(i.product_id, i))
    return m
  }, [items])

  const getExpected = (pid: string) =>
    expectedBalances?.find(b => b.product_id === pid)?.closing_stock_kg ?? 0

  async function handleSave() {
    const rows = (products ?? []).flatMap(p => {
      const v = inputs[p.id]
      if (!v && !itemMap.has(p.id)) return []
      const actual_qty = v !== undefined ? (v === '' ? null : parseFloat(v)) : (itemMap.get(p.id)?.actual_qty ?? null)
      return [{
        session_id: session.id,
        product_id: p.id,
        system_qty: getExpected(p.id),
        actual_qty,
        notes: notes[p.id] ?? itemMap.get(p.id)?.notes ?? null,
      }]
    })
    if (rows.length === 0) { toast.error('لا توجد بيانات للحفظ'); return }
    try {
      await upsertItems(rows)
      if (session.status === 'draft') {
        await updateSession({ id: session.id, status: 'completed' })
      }
      toast.success('تم حفظ الجرد')
      setInputs({})
    } catch { toast.error('حدث خطأ') }
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file || !products) return
    try {
      const parsed = await parseExcelFile(file)
      const newInputs: Record<string, string> = {}
      const newNotes: Record<string, string> = {}
      parsed.forEach(row => {
        const nameAr = String(row['اسم الصنف'] ?? '').trim()
        const qty = row['الكمية الفعلية']
        const note = row['ملاحظة']
        const prod = products.find(p => p.name_ar.trim() === nameAr)
        if (prod && qty !== undefined && qty !== '') {
          newInputs[prod.id] = String(qty)
          if (note) newNotes[prod.id] = String(note)
        }
      })
      setInputs(prev => ({ ...prev, ...newInputs }))
      setNotes(prev => ({ ...prev, ...newNotes }))
      toast.success(`تم استيراد ${Object.keys(newInputs).length} صنف`)
    } catch { toast.error('خطأ في قراءة الملف') }
    finally { if (importRef.current) importRef.current.value = '' }
  }

  async function handleApprove() {
    if (!items) return
    try {
      await approve({ session, items })
      toast.success('تم اعتماد الجرد وتحديث المخزون')
      setApproveDialog(false)
    } catch { toast.error('حدث خطأ') }
  }

  const productRows = (products ?? []).map(p => {
    const item = itemMap.get(p.id)
    const inputVal = inputs[p.id]
    const actualQty = inputVal !== undefined ? (inputVal === '' ? null : parseFloat(inputVal)) : (item?.actual_qty ?? null)
    const systemQty = getExpected(p.id)
    const diff = actualQty !== null ? actualQty - systemQty : null
    const wac = latestCosts?.[p.id] ?? 0
    const diffValue = diff !== null ? diff * wac : null
    return { p, item, inputVal: inputVal ?? (item?.actual_qty !== null && item?.actual_qty !== undefined ? String(item.actual_qty) : ''), systemQty, actualQty, diff, diffValue, wac }
  })

  const totalDiff = productRows.reduce((s, r) => s + (r.diffValue ?? 0), 0)
  const counted = productRows.filter(r => r.actualQty !== null).length
  const discrepancies = productRows.filter(r => r.diff !== null && r.diff !== 0).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
            <ArrowRight className="w-3.5 h-3.5" />عودة
          </Button>
          <div>
            <h2 className="font-bold text-base">{session.session_number}</h2>
            <p className="text-xs text-muted-foreground">{formatDate(session.date)} {session.responsible && `— ${session.responsible}`}</p>
          </div>
          <StatusBadge status={session.status} />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
            onClick={() => exportToExcel(`jard-template-${session.date}.xlsx`, ['اسم الصنف','الفئة','الرصيد الدفتري','الكمية الفعلية','ملاحظة'], (products??[]).map(p=>[p.name_ar,p.category,getExpected(p.id),'','']))}>
            <FileDown className="w-3.5 h-3.5"/>ورقة عدّ
          </Button>
          {!isReadonly && <>
            <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel}/>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => importRef.current?.click()}>
              <Upload className="w-3.5 h-3.5"/>استيراد Excel
            </Button>
            <Button size="sm" className="gap-1.5 h-8" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
            {session.status === 'completed' && (
              <Button size="sm" variant="outline" className="gap-1.5 h-8 text-success border-success/40 hover:bg-success/10" onClick={() => setApproveDialog(true)}>
                <CheckCircle className="w-3.5 h-3.5"/>اعتماد الجرد
              </Button>
            )}
          </>}
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs"
            onClick={() => exportToExcel(`jard-${session.session_number}.xlsx`, ['الصنف','الفئة','الرصيد الدفتري','الكمية الفعلية','الفرق','قيمة الفرق','ملاحظة'], productRows.map(r=>[r.p.name_ar,r.p.category,r.systemQty,r.actualQty??'',r.diff??'',r.diffValue??'',r.item?.notes??'']))}>
            <FileDown className="w-3.5 h-3.5"/>تصدير
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">تم جرده</p><p className="text-xl font-bold">{counted} / {(products??[]).length}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">بها فروقات</p><p className={cn('text-xl font-bold', discrepancies > 0 ? 'text-warning' : 'text-success')}>{discrepancies} صنف</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">إجمالي الفروقات</p><p className={cn('text-xl font-bold', totalDiff < 0 ? 'text-danger' : totalDiff > 0 ? 'text-success' : 'text-muted-foreground')}>{formatNumber(totalDiff)} ر.س</p></CardContent></Card>
      </div>

      {/* Table */}
      {isLoading ? <Skeleton className="h-64"/> : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border">
              {['الصنف','الفئة','الرصيد الدفتري','الكمية الفعلية','الفرق','قيمة الفرق (ر.س)','ملاحظة',''].map(h =>
                <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {productRows.map(({ p, item, inputVal, systemQty, diff, diffValue }) => (
                <tr key={p.id} className={cn('border-b border-border/50 hover:bg-muted/20',
                  diff !== null && Math.abs(diff) >= 5 ? 'bg-danger/5' : diff !== null && diff !== 0 ? 'bg-warning/5' : '')}>
                  <td className="px-3 py-2 font-medium text-sm">{p.name_ar}</td>
                  <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                  <td className="px-3 py-2 text-muted-foreground font-medium">{systemQty > 0 ? formatNumber(systemQty) : <span className="text-xs text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2 w-28">
                    {isReadonly
                      ? <span className={cn('font-semibold', item?.actual_qty !== null ? 'text-primary' : 'text-muted-foreground')}>{item?.actual_qty !== null && item?.actual_qty !== undefined ? formatNumber(item.actual_qty) : '—'}</span>
                      : <Input type="number" min="0" step="0.01" placeholder="أدخل..." value={inputVal}
                          onChange={e => setInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="h-8 text-sm w-28" dir="ltr" />}
                  </td>
                  <td className={cn('px-3 py-2 font-semibold text-sm', diff === null ? 'text-muted-foreground' : diff === 0 ? 'text-success' : diff > 0 ? 'text-success' : 'text-danger')}>
                    {diff !== null ? (diff >= 0 ? '+' : '') + formatNumber(diff) : '—'}
                  </td>
                  <td className={cn('px-3 py-2 font-medium text-sm', diffValue === null ? 'text-muted-foreground' : diffValue >= 0 ? 'text-success' : 'text-danger')}>
                    {diffValue !== null ? (diffValue >= 0 ? '+' : '') + formatNumber(diffValue) : '—'}
                  </td>
                  <td className="px-3 py-2 w-36">
                    {isReadonly
                      ? <span className="text-xs text-muted-foreground">{item?.notes ?? '—'}</span>
                      : <Input placeholder="ملاحظة..." value={notes[p.id] ?? item?.notes ?? ''}
                          onChange={e => setNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="h-8 text-xs w-36" />}
                  </td>
                  <td className="px-3 py-2">
                    {item && !isReadonly && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:bg-danger/10"
                        onClick={() => setDeleteId({ id: item.id, session_id: session.id })}>
                        <Trash2 className="w-3 h-3"/>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete item dialog */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>حذف بند الجرد</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذا البند من الجرد؟</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={async () => { if (deleteId) { await deleteItem(deleteId); setDeleteId(null) } }}>حذف</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Approve dialog */}
      <Dialog open={approveDialog} onOpenChange={setApproveDialog}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>اعتماد الجرد</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم تحديث كميات المخزون بناءً على الكميات الفعلية المُدخلة. لا يمكن التراجع.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setApproveDialog(false)}>إلغاء</Button>
            <Button size="sm" className="bg-success text-white hover:bg-success/90" disabled={isApproving} onClick={handleApprove}>
              {isApproving ? 'جاري الاعتماد...' : 'اعتماد وتحديث المخزون'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Main StocktakeSection ──────────────────────────────────────────────────────
export function StocktakeSection() {
  const { data: sessions, isLoading } = useStocktakeSessions()
  const { mutateAsync: createSession, isPending: isCreating } = useCreateStocktakeSession()
  const { mutateAsync: deleteSession } = useDeleteStocktakeSession()
  const [newDialog, setNewDialog] = useState(false)
  const [newDate, setNewDate] = useState(todayISO())
  const [newResponsible, setNewResponsible] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [selectedSession, setSelectedSession] = useState<StocktakeSession | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  if (selectedSession) {
    return <SessionDetail session={selectedSession} onBack={() => setSelectedSession(null)} />
  }

  async function handleCreate() {
    try {
      const session = await createSession({ date: newDate, responsible: newResponsible || undefined, notes: newNotes || undefined })
      setNewDialog(false)
      setNewDate(todayISO()); setNewResponsible(''); setNewNotes('')
      setSelectedSession(session)
      toast.success(`تم إنشاء جرد ${session.session_number}`)
    } catch { toast.error('حدث خطأ') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold">جلسات الجرد</h2>
          <p className="text-xs text-muted-foreground">{sessions?.length ?? 0} جلسة مسجّلة</p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setNewDialog(true)}>
          <Plus className="w-3.5 h-3.5"/>جرد جديد
        </Button>
      </div>

      {/* Sessions table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12"/>)}</div>
      ) : (sessions ?? []).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30"/>
          <p className="text-sm">لا توجد جلسات جرد بعد</p>
          <Button size="sm" className="mt-3 gap-1.5" onClick={() => setNewDialog(true)}><Plus className="w-3.5 h-3.5"/>بدء أول جرد</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border">
              {['رقم الجرد','التاريخ','المسؤول','الحالة','الملاحظات','الإجراءات'].map(h =>
                <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>
              )}
            </tr></thead>
            <tbody>
              {(sessions ?? []).map((s, i) => (
                <tr key={s.id} className={cn('border-b border-border/50 hover:bg-muted/20', i % 2 === 1 && 'bg-muted/10')}>
                  <td className="px-3 py-2.5"><span className="font-mono font-medium text-primary text-sm">{s.session_number}</span></td>
                  <td className="px-3 py-2.5 text-muted-foreground text-sm">{formatDate(s.date)}</td>
                  <td className="px-3 py-2.5 text-sm">{s.responsible ?? '—'}</td>
                  <td className="px-3 py-2.5"><StatusBadge status={s.status}/></td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-48 truncate">{s.notes ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedSession(s)}>
                        <Eye className="w-3.5 h-3.5"/>
                      </Button>
                      {s.status !== 'approved' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10" onClick={() => setDeleteId(s.id)}>
                          <Trash2 className="w-3.5 h-3.5"/>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New session dialog */}
      <Dialog open={newDialog} onOpenChange={setNewDialog}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>جرد جديد</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label className="text-xs">تاريخ الجرد</Label>
              <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} dir="ltr" className="h-9"/></div>
            <div className="space-y-1"><Label className="text-xs">المسؤول (اختياري)</Label>
              <Input value={newResponsible} onChange={e => setNewResponsible(e.target.value)} placeholder="اسم المسؤول" className="h-9"/></div>
            <div className="space-y-1"><Label className="text-xs">ملاحظات</Label>
              <Input value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="..." className="h-9"/></div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setNewDialog(false)}>إلغاء</Button>
            <Button size="sm" disabled={isCreating} onClick={handleCreate}>{isCreating ? 'جاري الإنشاء...' : 'إنشاء'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete session dialog */}
      <Dialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>حذف الجرد</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">هل تريد حذف هذه الجلسة وجميع بنودها؟</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" size="sm" onClick={async () => { if (deleteId) { await deleteSession(deleteId); setDeleteId(null); toast.success('تم الحذف') } }}>حذف</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
