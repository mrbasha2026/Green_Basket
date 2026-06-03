import { useMemo, useState } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAllCustomers, useUpsertCustomer } from '@/hooks/useCustomers'
import { useSalesByRange } from '@/hooks/useSales'
import { formatNumber, formatDate, todayISO, getChartStyle } from '@/lib/utils'
import { exportToExcel } from '@/lib/excel'
import type { Customer } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Pencil, FileDown, TrendingUp, Users, ShoppingBag } from 'lucide-react'

export function CustomersDashboard() {
  const today = todayISO()
  const ninetyAgo = new Date(today + 'T12:00:00')
  ninetyAgo.setDate(ninetyAgo.getDate() - 90)
  const fromDate = ninetyAgo.toISOString().split('T')[0]

  const { data: customers, isLoading: cLoading } = useAllCustomers()
  const { data: sales, isLoading: sLoading } = useSalesByRange(fromDate, today)
  const { mutateAsync: upsert, isPending } = useUpsertCustomer()

  const [editCustomer, setEditCustomer] = useState<Partial<Customer> | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [search, setSearch] = useState('')

  const isLoading = cLoading || sLoading

  const customerStats = useMemo(() => {
    const stats = new Map<string, {
      totalRevenue: number; totalCost: number; days: Set<string>
      productCounts: Map<string, number>; lastDate: string
    }>()
    sales?.forEach(s => {
      const ex = stats.get(s.customer_id) ?? { totalRevenue: 0, totalCost: 0, days: new Set<string>(), productCounts: new Map<string, number>(), lastDate: '' }
      ex.totalRevenue += s.total_amount
      ex.totalCost += s.total_purchase
      ex.days.add(s.date)
      const pName = s.product?.name_ar ?? s.product_id
      ex.productCounts.set(pName, (ex.productCounts.get(pName) ?? 0) + s.qty_kg)
      if (!ex.lastDate || s.date > ex.lastDate) ex.lastDate = s.date
      stats.set(s.customer_id, ex)
    })
    return (customers ?? []).map(c => {
      const st = stats.get(c.id)
      const topProducts = Array.from(st?.productCounts.entries() ?? []).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n])=>n)
      return { ...c, totalRevenue: st?.totalRevenue??0, grossProfit:(st?.totalRevenue??0)-(st?.totalCost??0), activeDays: st?.days.size??0, avgDailyRevenue: st?(st.totalRevenue/Math.max(st.days.size,1)):0, topProducts, lastDate: st?.lastDate??'' }
    }).sort((a,b)=>b.totalRevenue-a.totalRevenue)
  }, [customers, sales])

  const filtered = useMemo(() =>
    search ? customerStats.filter(c => c.name_ar.toLowerCase().includes(search.toLowerCase())) : customerStats,
    [customerStats, search]
  )

  const barData = useMemo(() =>
    customerStats.slice(0,8).map(c => ({ name: c.name_ar, 'الإيراد': Math.round(c.totalRevenue), 'الربح': Math.round(c.grossProfit) })),
    [customerStats]
  )

  async function handleSave() {
    if (!editCustomer?.name_ar) return
    try {
      await upsert(editCustomer)
      setDialogOpen(false); setEditCustomer(null)
    } catch { /* handled by toast */ }
  }

  if (isLoading) return (
    <div className="p-5 space-y-4">
      <div className="grid grid-cols-2 gap-3">{[...Array(4)].map((_,i)=><Skeleton key={i} className="h-36"/>)}</div>
    </div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-auto">
      {/* Action bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background/50 shrink-0">
        <div className="flex items-center gap-2">
          <Input placeholder="بحث عن عميل..." value={search} onChange={e=>setSearch(e.target.value)} className="h-8 w-48 text-sm" />
          <span className="text-xs text-muted-foreground">{filtered.length} عميل</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 h-8"
            onClick={()=>exportToExcel(customerStats.map(c=>({'الاسم':c.name_ar,'النوع':c.type,'الإيراد (90 يوم)':c.totalRevenue,'الربح':c.grossProfit,'آخر طلب':c.lastDate})),'customers-report')}>
            <FileDown className="w-3.5 h-3.5"/>تصدير
          </Button>
          <Button size="sm" className="gap-1.5 h-8" onClick={()=>{setEditCustomer({name_ar:'',type:'مطعم',is_active:true});setDialogOpen(true)}}>
            <Plus className="w-3.5 h-3.5"/>إضافة عميل
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 space-y-5">
        {/* Customer cards */}
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30"/>
            <p className="text-sm">لا يوجد عملاء{search ? ` يطابق "${search}"` : ' بعد'}</p>
            {!search && <Button size="sm" className="mt-3 gap-1" onClick={()=>{setEditCustomer({name_ar:'',type:'مطعم',is_active:true});setDialogOpen(true)}}><Plus className="w-3.5 h-3.5"/>إضافة أول عميل</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map(c => (
              <Card key={c.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground truncate">{c.name_ar}</p>
                      <p className="text-xs text-muted-foreground">{c.type}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Badge className={cn('text-xs',c.is_active?'bg-success/10 text-success':'bg-muted text-muted-foreground')}>{c.is_active?'نشط':'غير نشط'}</Badge>
                      <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={()=>{setEditCustomer({id:c.id,name_ar:c.name_ar,type:c.type,is_active:c.is_active});setDialogOpen(true)}}>
                        <Pencil className="w-3 h-3"/>
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-1.5 text-sm border-t border-border pt-2">
                    <div className="flex justify-between"><span className="text-muted-foreground">الإيراد (90 يوم)</span><span className="font-medium">{formatNumber(c.totalRevenue)} ر.س</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">متوسط يومي</span><span>{formatNumber(c.avgDailyRevenue)} ر.س</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">الربح المباشر</span><span className={c.grossProfit>=0?'text-success':'text-danger'}>{formatNumber(c.grossProfit)} ر.س</span></div>
                    {c.lastDate && <div className="flex justify-between"><span className="text-muted-foreground">آخر طلب</span><span className="text-xs">{formatDate(c.lastDate)}</span></div>}
                  </div>
                  {c.topProducts.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">أكثر الأصناف طلباً:</p>
                      <div className="flex flex-wrap gap-1">
                        {c.topProducts.map((p,i)=><span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{p}</span>)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Bar chart */}
        {customerStats.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">مقارنة الإيرادات والأرباح (آخر 90 يوم)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                {(() => { const cs = getChartStyle(); return (
                <BarChart data={barData} margin={{top:5,right:10,left:10,bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={cs.gridStroke}/>
                  <XAxis dataKey="name" tick={{fontSize:10, fill: cs.tickColor}}/>
                  <YAxis tick={{fontSize:11, fill: cs.tickColor}} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                  <Tooltip contentStyle={cs.tooltipStyle} formatter={(v:number,n:string)=>[`${formatNumber(v)} ر.س`,n]}/>
                  <Bar dataKey="الإيراد" fill="#2563eb" radius={[3,3,0,0]}/>
                  <Bar dataKey="الربح" fill="#16a34a" radius={[3,3,0,0]}/>
                </BarChart>
                )})()}
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* All sales */}
        {(sales ?? []).length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">جميع المبيعات — آخر 90 يوم ({sales?.length} سجل)</CardTitle>
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs"
                  onClick={()=>exportToExcel((sales??[]).map(s=>({'التاريخ':s.date,'الصنف':s.product?.name_ar??'','العميل':s.customer?.name_ar??'','الكمية(كج)':s.qty_kg,'السعر':s.price_per_kg,'الإجمالي':s.total_amount,'الربح':s.total_amount-s.total_purchase})),'sales-90days')}>
                  <FileDown className="w-3 h-3"/>تصدير Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-72">
                <table className="w-full text-sm">
                  <thead className="sticky top-0"><tr className="bg-muted/50 border-b border-border">{['التاريخ','العميل','الصنف','الكمية(كج)','السعر','الإجمالي'].map(h=><th key={h} className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {(sales??[]).slice(0,100).map((s,i)=>(
                      <tr key={s.id} className={cn('border-b border-border/40',i%2===1?'bg-muted/10':'')}>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDate(s.date)}</td>
                        <td className="px-3 py-1.5 font-medium text-xs">{s.customer?.name_ar??'—'}</td>
                        <td className="px-3 py-1.5 text-xs">{s.product?.name_ar??'—'}</td>
                        <td className="px-3 py-1.5 text-xs">{formatNumber(s.qty_kg)}</td>
                        <td className="px-3 py-1.5 text-xs">{formatNumber(s.price_per_kg)}</td>
                        <td className="px-3 py-1.5 text-xs font-semibold">{formatNumber(s.total_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(sales?.length ?? 0) > 100 && <p className="text-xs text-center text-muted-foreground p-3">يعرض أول 100 من {sales?.length} سجل — صدّر Excel للاطلاع على الكل</p>}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={v=>{setDialogOpen(v);if(!v)setEditCustomer(null)}}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editCustomer?.id?'تعديل عميل':'إضافة عميل جديد'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>الاسم <span className="text-danger">*</span></Label>
              <Input value={editCustomer?.name_ar??''} onChange={e=>setEditCustomer(p=>({...p,name_ar:e.target.value}))}/></div>
            <div className="space-y-1"><Label>النوع</Label>
              <Select value={editCustomer?.type??'مطعم'} onValueChange={v=>setEditCustomer(p=>({...p,type:v as Customer['type']}))}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{(['مطعم','فندق','مستشفى','تجزئة'] as const).map(t=><SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select></div>
            {editCustomer?.id && (
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={editCustomer?.is_active??true} onChange={e=>setEditCustomer(p=>({...p,is_active:e.target.checked}))} className="h-4 w-4"/>
                <Label htmlFor="is_active" className="cursor-pointer">نشط</Label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={()=>setDialogOpen(false)}>إلغاء</Button>
            <Button size="sm" disabled={isPending||!editCustomer?.name_ar} onClick={handleSave}>{isPending?'جاري الحفظ...':'حفظ'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
