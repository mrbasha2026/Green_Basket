import { useState, useMemo, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet } from '@/components/ui/sheet'
import { Combobox } from '@/components/ui/combobox'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { SuppliersDashboard } from '@/components/suppliers/SuppliersDashboard'
import { useProducts } from '@/hooks/useProducts'
import { usePurchases, useUpsertPurchases, useDeletePurchase, useDeletePurchasesByInvoice, nextPurchaseInvoiceNumber, getOrCreateDailyPurchaseInvoice } from '@/hooks/usePurchases'
import { useSuppliers } from '@/hooks/useSuppliers'
import { calcCostPerKg } from '@/lib/calculations'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { exportToExcel, parseExcelFile } from '@/lib/excel'
import type { Purchase, PurchaseFormRow } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Printer, Upload, FileDown, RotateCcw, FileText, Eye, Pencil, Truck, List } from 'lucide-react'
import { DataTable } from '@/components/tables/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermissions'

// ── Invoice group type ────────────────────────────────────────────────────────
interface InvoiceGroup {
  key: string; invoice_number: string | null; supplier_name: string; supplier_id: string | null
  supplier_ref: string | null; date: string; total_cost: number; transaction_type: string | null; source: string; items: Purchase[]
}

function groupPurchases(data: Purchase[]): InvoiceGroup[] {
  const map = new Map<string,InvoiceGroup>()
  data.forEach(p => {
    const k = p.invoice_number ?? `single-${p.id}`
    if (!map.has(k)) map.set(k,{key:k,invoice_number:p.invoice_number,supplier_name:p.supplier?.name_ar??'—',supplier_id:p.supplier_id??null,supplier_ref:p.supplier_ref??null,date:p.date,total_cost:0,transaction_type:p.transaction_type,source:p.source,items:[]})
    const g=map.get(k)!; g.total_cost+=p.total_cost; g.items.push(p); if(p.date>g.date) g.date=p.date
  })
  return Array.from(map.values()).sort((a,b)=>b.date.localeCompare(a.date))
}

// ── Invoice Detail Sheet ──────────────────────────────────────────────────────
function InvoiceDetailSheet({ group, open, onClose, products }: {
  group: InvoiceGroup|null; open: boolean; onClose: ()=>void; products: import('@/types').Product[]
}) {
  if (!group) return null
  const g = group
  const site = (() => { try { return JSON.parse(localStorage.getItem('gb_site_settings')??'{}') } catch { return {} } })()
  function handlePrint() {
    const el=document.getElementById('inv-detail-print'); if(!el) return
    const w=window.open('','_blank','width=800,height=600'); if(!w) return
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:20px;direction:rtl;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;text-align:right;border:1px solid #ddd}th{background:#f5f5f5;font-weight:bold}</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close(); setTimeout(()=>{w.print();w.close()},300)
  }
  function handleExcel() {
    exportToExcel(g.items.map(p=>({'رقم الفاتورة':p.invoice_number??'—','الصنف':products.find(pr=>pr.id===p.product_id)?.name_ar??p.product_id,'التاريخ':p.date,'كراتين':p.cartons_qty,'السعر/كرتون':p.price_per_carton,'وزن/كرتون':p.weight_per_carton,'إجمالي الوزن(كج)':p.total_weight,'إجمالي التكلفة(ر.س)':p.total_cost,'تكلفة/كج':p.cost_per_kg})),`فاتورة-${g.invoice_number??g.date}`)
    toast.success('تم تصدير Excel')
  }
  return (
    <Sheet open={open} onClose={onClose} title={`تفاصيل — ${g.invoice_number??'(بدون رقم)'}`}
      footer={<div className="flex gap-2 justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={handleExcel}><FileDown className="w-4 h-4"/>Excel</Button><Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}><Printer className="w-4 h-4"/>طباعة</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4 border border-border">
          <div><span className="text-muted-foreground">رقم الفاتورة: </span><span className="font-mono font-medium">{group.invoice_number??'—'}</span></div>
          <div><span className="text-muted-foreground">التاريخ: </span><span className="font-medium">{formatDate(group.date)}</span></div>
          <div><span className="text-muted-foreground">المورد: </span><span className="font-medium">{group.supplier_name}</span></div>
          {group.supplier_ref&&<div><span className="text-muted-foreground">رقم المرجع: </span><span className="font-medium">{group.supplier_ref}</span></div>}
          <div><span className="text-muted-foreground">الإجمالي: </span><span className="font-bold text-primary text-base">{formatNumber(group.total_cost)} ر.س</span></div>
        </div>
        <div id="inv-detail-print">
          <div style={{background:'#16a34a',color:'#fff',padding:'10px 14px',marginBottom:'12px',borderRadius:'6px'}}>
            <p style={{fontWeight:'bold',fontSize:'15px',margin:0}}>{site.name||'Greenbasket'} — فاتورة مشتريات</p>
            <p style={{fontSize:'11px',margin:'3px 0 0'}}>رقم: {group.invoice_number} | {formatDate(group.date)} | المورد: {group.supplier_name}</p>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">{['#','الصنف','كراتين','وزن/كرتون','السعر/كرتون','الوزن الكلي','تكلفة/كج','الإجمالي'].map(h=><th key={h} className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>
                {group.items.map((p,i)=>(
                  <tr key={p.id} className={cn('border-b border-border/50',i%2===1&&'bg-muted/20')}>
                    <td className="px-3 py-2 text-muted-foreground text-xs">{i+1}</td>
                    <td className="px-3 py-2 font-medium">{products.find(pr=>pr.id===p.product_id)?.name_ar??'—'}</td>
                    <td className="px-3 py-2">{formatNumber(p.cartons_qty)}</td>
                    <td className="px-3 py-2">{formatNumber(p.weight_per_carton)}</td>
                    <td className="px-3 py-2">{formatNumber(p.price_per_carton)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatNumber(p.total_weight)}</td>
                    <td className="px-3 py-2 text-primary text-xs">{formatNumber(p.cost_per_kg)}</td>
                    <td className="px-3 py-2 font-semibold">{formatNumber(p.total_cost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="bg-primary/5 font-bold border-t-2 border-primary/20"><td className="px-3 py-2.5" colSpan={7}>الإجمالي الكلي</td><td className="px-3 py-2.5 text-primary text-base">{formatNumber(group.total_cost)} ر.س</td></tr></tfoot>
            </table>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

// ── Purchase Drawer ───────────────────────────────────────────────────────────
const emptyRow = (): PurchaseFormRow => ({product_id:'',cartons_qty:0,price_per_carton:0,weight_per_carton:0,waste_kg:0})

function PurchaseDrawer({ open, onClose, editGroup }: { open: boolean; onClose: ()=>void; editGroup?: InvoiceGroup|null }) {
  const {data:products}=useProducts(); const {data:suppliers}=useSuppliers()
  const {mutateAsync:upsert,isPending}=useUpsertPurchases(); const {mutateAsync:deleteByInvoice,isPending:isDeleting}=useDeletePurchasesByInvoice()
  const drawerImportRef=useRef<HTMLInputElement>(null)
  const isEdit=!!editGroup
  const [invoiceNumber,setInvoiceNumber]=useState(''); const [date,setDate]=useState(todayISO())
  const [invoiceType,setInvoiceType]=useState<'مع_فاتورة'|'بدون_فاتورة'>('مع_فاتورة')
  const [supplierId,setSupplierId]=useState(''); const [supplierRef,setSupplierRef]=useState('')
  const [transportCost,setTransportCost]=useState(0); const [rows,setRows]=useState<PurchaseFormRow[]>([emptyRow()])
  const [transactionType,setTransactionType]=useState<'شراء'|'مرتجع_مشتريات'>('شراء')

  useEffect(()=>{
    if(!open) return
    if(isEdit&&editGroup){
      setDate(editGroup.date);setSupplierId(editGroup.supplier_id??'');setSupplierRef(editGroup.supplier_ref??'');setTransportCost(0)
      setTransactionType((editGroup.transaction_type as 'شراء'|'مرتجع_مشتريات')??'شراء');setInvoiceType(editGroup.supplier_id?'مع_فاتورة':'بدون_فاتورة')
      setInvoiceNumber(editGroup.invoice_number??'');setRows(editGroup.items.map(p=>({product_id:p.product_id,cartons_qty:p.cartons_qty,price_per_carton:p.price_per_carton,weight_per_carton:p.weight_per_carton,waste_kg:p.waste_kg})))
    } else {
      setDate(todayISO());setInvoiceType('مع_فاتورة');setSupplierId('');setSupplierRef('');setTransportCost(0);setRows([emptyRow()]);setTransactionType('شراء')
      nextPurchaseInvoiceNumber('PIM').then(setInvoiceNumber).catch(()=>setInvoiceNumber('PIM-00001'))
    }
  },[open,isEdit,editGroup])

  useEffect(()=>{
    if(invoiceType==='بدون_فاتورة'&&!isEdit){const def=suppliers?.find(s=>s.is_default);if(def)setSupplierId(def.id)}
    else if(invoiceType==='مع_فاتورة'&&!isEdit) setSupplierId('')
  },[invoiceType,suppliers,isEdit])

  function findProductLocal(name:string){const n=name.trim().toLowerCase();return products?.find(p=>p.name_ar.trim().toLowerCase()===n||(p.name_en??'').trim().toLowerCase()===n)}

  async function handleDrawerImport(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0]; if(!file||!products) return
    try{
      const parsed=await parseExcelFile(file); const newRows:PurchaseFormRow[]=[]; const unmatched:string[]=[]
      parsed.filter(r=>r['اسم الصنف']&&Number(r['كراتين'])>0&&Number(r['السعر/كرتون'])>0).forEach(r=>{
        const prod=findProductLocal(String(r['اسم الصنف']??''))
        if(!prod){unmatched.push(String(r['اسم الصنف']));return}
        const cartons=Number(r['كراتين']??0); const price=Number(r['السعر/كرتون']??0)
        if(cartons<=0||price<=0) return
        newRows.push({product_id:prod.id,cartons_qty:cartons,price_per_carton:price,weight_per_carton:Number(r['وزن/كرتون(كج)']??0),waste_kg:0})
      })
      if(unmatched.length>0) toast.warning(`لم يُطابَق: ${unmatched.join('، ')}`)
      if(newRows.length>0){setRows(prev=>[...prev.filter(r=>r.product_id),...newRows]);toast.success(`تم إضافة ${newRows.length} صنف`)}
    }catch{toast.error('خطأ في قراءة الملف')}
    finally{if(drawerImportRef.current)drawerImportRef.current.value=''}
  }

  function updateRow(i:number,field:keyof PurchaseFormRow,val:string|number){setRows(prev=>prev.map((r,idx)=>idx===i?{...r,[field]:val}:r))}
  const subtotal=rows.reduce((s,r)=>s+r.cartons_qty*r.price_per_carton,0)
  const grandTotal=subtotal+transportCost
  const totalWeight=rows.reduce((s,r)=>s+r.cartons_qty*r.weight_per_carton,0)
  const [applyVat,setApplyVat]=useState(false)
  const siteSettings=(()=>{try{return JSON.parse(localStorage.getItem('gb_site_settings')??'{}')}catch{return{}}})()

  async function handleSubmit(){
    const valid=rows.filter(r=>r.product_id&&r.cartons_qty>0)
    if(valid.length===0){toast.error('أضف صنفاً واحداً على الأقل');return}
    if(invoiceType==='مع_فاتورة'&&!supplierId){toast.error('اختر المورد');return}
    try{
      let invNum=invoiceNumber
      if(!isEdit) invNum=await getOrCreateDailyPurchaseInvoice(date,'PIM')
      if(isEdit&&editGroup?.invoice_number) await deleteByInvoice(editGroup.invoice_number)
      await upsert(valid.map(r=>{const w=r.cartons_qty*r.weight_per_carton;const c=r.cartons_qty*r.price_per_carton;const ts=totalWeight>0?(w/totalWeight)*transportCost:0;return{product_id:r.product_id,date,cartons_qty:r.cartons_qty,price_per_carton:r.price_per_carton,weight_per_carton:r.weight_per_carton,waste_kg:0,cost_per_kg:calcCostPerKg(c+ts,w,0),source:'web' as const,notes:invoiceType,invoice_number:invNum,supplier_id:supplierId||null,supplier_ref:supplierRef||null,transaction_type:transactionType}}))
      toast.success(isEdit?`تم تعديل ${invNum}`:`تم حفظ ${invNum}`); onClose()
    }catch{toast.error('حدث خطأ أثناء الحفظ')}
  }

  function handlePrint(){
    const el=document.getElementById('drawer-purchase-print');if(!el)return
    const w=window.open('','_blank','width=800,height=600');if(!w)return
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:20px;direction:rtl;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;text-align:right;border:1px solid #ddd}th{background:#f5f5f5;font-weight:bold}</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close();setTimeout(()=>{w.print();w.close()},300)
  }

  const site=(()=>{try{return JSON.parse(localStorage.getItem('gb_site_settings')??'{}')}catch{return{}}})()
  const supplierOptions=(suppliers??[]).map(s=>({value:s.id,label:s.name_ar}))
  const productOptions=(products??[]).map(p=>({value:p.id,label:p.name_ar,sub:p.category}))

  return (
    <Sheet open={open} onClose={onClose} width="680px"
      title={`${isEdit?'تعديل':'فاتورة'} مشتريات — ${invoiceNumber}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm space-y-0.5">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">الإجمالي قبل ض.ق.م:</span>
              <span className="font-bold text-primary text-base">{formatNumber(grandTotal)} ر.س</span>
              <button onClick={()=>setApplyVat(v=>!v)} className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium',applyVat?'bg-warning/15 text-warning border-warning/30':'bg-muted text-muted-foreground border-border hover:bg-muted/80')}>
                {applyVat?`ض.ق.م ${Number(siteSettings.vat_rate??15)}% مطبقة`:`إضافة ض.ق.م ${Number(siteSettings.vat_rate??15)}%`}
              </button>
            </div>
            {applyVat&&<div className="flex gap-4 text-xs"><span className="text-muted-foreground">الضريبة: <span className="text-warning font-medium">{formatNumber(grandTotal*(Number(siteSettings.vat_rate??15)/100))} ر.س</span></span><span className="font-bold text-success">الإجمالي مع الضريبة: {formatNumber(grandTotal*(1+Number(siteSettings.vat_rate??15)/100))} ر.س</span></div>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="w-4 h-4"/>طباعة</Button>
            <Button onClick={handleSubmit} disabled={isPending||isDeleting} className="gap-1.5">{(isPending||isDeleting)?'جاري الحفظ...':isEdit?'حفظ التعديلات':'حفظ الفاتورة'}</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-2">
          {(['شراء','مرتجع_مشتريات'] as const).map(t=>(
            <button key={t} type="button" onClick={()=>setTransactionType(t)} className={cn('flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',transactionType===t?t==='شراء'?'border-primary bg-primary/10 text-primary':'border-warning bg-warning/10 text-warning':'border-border bg-background text-muted-foreground hover:bg-muted/60')}>
              {t==='شراء'?'شراء':'مرتجع مشتريات'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>التاريخ</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} dir="ltr"/></div>
          <div className="space-y-1.5"><Label>نوع الشراء</Label>
            <div className="flex gap-2 h-9">
              {(['مع_فاتورة','بدون_فاتورة'] as const).map(t=>(
                <button key={t} type="button" onClick={()=>setInvoiceType(t)} className={cn('flex-1 rounded-lg border text-xs font-medium transition-colors',invoiceType===t?'border-primary bg-primary/10 text-primary':'border-border bg-background text-muted-foreground hover:bg-muted/60')}>
                  {t==='مع_فاتورة'?'مع فاتورة':'بدون فاتورة'}
                </button>
              ))}
            </div>
          </div>
        </div>
        {invoiceType==='مع_فاتورة'&&(
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>المورد <span className="text-danger">*</span></Label><Combobox options={supplierOptions} value={supplierId} onValueChange={setSupplierId} placeholder="اختر مورد..."/></div>
            <div className="space-y-1.5"><Label>رقم مرجع المورد</Label><Input placeholder="INV-2026-001" value={supplierRef} onChange={e=>setSupplierRef(e.target.value)} dir="ltr"/></div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>مصاريف النقل (ر.س)</Label>
          <Input type="number" min="0" step="0.01" placeholder="0" dir="ltr" value={transportCost||''} onChange={e=>setTransportCost(parseFloat(e.target.value)||0)}/>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>الأصناف</Label>
            <div className="flex items-center gap-2">
              <input ref={drawerImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleDrawerImport}/>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={()=>drawerImportRef.current?.click()}><Upload className="w-3 h-3"/>استيراد Excel</Button>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={()=>{
                const rows=(products??[]).map(p=>[p.name_ar,'','',''])
                exportToExcel(`قالب-مشتريات.xlsx`,['اسم الصنف','كراتين','السعر/كرتون','وزن/كرتون(كج)'],rows)
                toast.success('تم تحميل القالب')
              }}><FileDown className="w-3 h-3"/>قالب</Button>
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">{['الصنف','كراتين','وزن/كرتون','السعر/كرتون','الإجمالي',''].map(h=><th key={h} className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r,i)=>{
                  const lt=r.cartons_qty*r.price_per_carton
                  return (
                    <tr key={i} className="border-b border-border/50 last:border-b-0">
                      <td className="px-2 py-1.5 w-48"><Combobox options={productOptions} value={r.product_id} onValueChange={v=>updateRow(i,'product_id',v)} placeholder="اختر صنف"/></td>
                      {(['cartons_qty','weight_per_carton','price_per_carton'] as const).map(field=>(
                        <td key={field} className="px-2 py-1.5 w-24"><Input type="number" min="0" step="0.01" dir="ltr" value={r[field]||''} className="h-8 text-sm w-full" onChange={e=>updateRow(i,field,parseFloat(e.target.value)||0)}/></td>
                      ))}
                      <td className="px-2 py-1.5 font-semibold w-24">{lt>0?formatNumber(lt):<span className="text-muted-foreground">—</span>}</td>
                      <td className="px-2 py-1.5 w-8">{rows.length>1&&<button type="button" onClick={()=>setRows(prev=>prev.filter((_,idx)=>idx!==i))} className="text-danger hover:bg-danger/10 rounded p-1"><Trash2 className="w-3.5 h-3.5"/></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={()=>setRows(prev=>[...prev,emptyRow()])} className="gap-1.5"><Plus className="w-3.5 h-3.5"/>إضافة صنف</Button>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-4 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي</span><span className="font-medium">{formatNumber(subtotal)} ر.س</span></div>
          {transportCost>0&&<div className="flex justify-between"><span className="text-muted-foreground">مصاريف النقل</span><span className="font-medium">{formatNumber(transportCost)} ر.س</span></div>}
          <div className="flex items-center justify-between border-t border-border pt-1.5">
            <div className="flex items-center gap-3">
              <span className="font-bold text-base">الإجمالي</span>
              <button onClick={()=>setApplyVat(v=>!v)} className={cn('text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors',applyVat?'bg-warning/15 text-warning border-warning/30':'bg-muted text-muted-foreground border-border hover:bg-muted/80')}>
                {applyVat?`ض.ق.م ${Number(siteSettings.vat_rate??15)}% مطبقة`:`إضافة ض.ق.م`}
              </button>
            </div>
            <div className="text-left">
              <p className="font-bold text-primary text-base">{formatNumber(grandTotal+(applyVat?grandTotal*(Number(siteSettings.vat_rate??15)/100):0))} ر.س</p>
              {applyVat&&<p className="text-xs text-warning">يشمل ضريبة {formatNumber(grandTotal*(Number(siteSettings.vat_rate??15)/100))} ر.س</p>}
            </div>
          </div>
        </div>
        <div id="drawer-purchase-print" style={{display:'none'}}>
          <div style={{background:'#16a34a',color:'#fff',padding:'10px 14px',marginBottom:'12px',borderRadius:'6px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <div><p style={{fontWeight:'bold',fontSize:'15px',margin:0}}>{site.name||'Greenbasket'}</p></div>
              <div style={{textAlign:'left'}}><p style={{fontWeight:'bold',fontSize:'14px',margin:0}}>فاتورة مشتريات</p><p style={{fontSize:'11px',margin:'2px 0 0',opacity:0.85}}>رقم: {invoiceNumber} | {formatDate(date)}</p>{supplierId&&<p style={{fontSize:'11px',margin:'2px 0 0',opacity:0.85}}>المورد: {suppliers?.find(s=>s.id===supplierId)?.name_ar}</p>}</div>
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
            <thead><tr style={{background:'#f1f5f9'}}>{['#','الصنف','كراتين','وزن/كرتون','السعر/كرتون','الوزن الكلي','الإجمالي'].map(h=><th key={h} style={{padding:'6px 8px',border:'1px solid #e2e8f0',textAlign:'right'}}>{h}</th>)}</tr></thead>
            <tbody>{rows.filter(r=>r.product_id&&r.cartons_qty>0).map((r,i)=>(<tr key={i}><td style={{padding:'5px 8px',border:'1px solid #e2e8f0',color:'#64748b'}}>{i+1}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0',fontWeight:600}}>{products?.find(p=>p.id===r.product_id)?.name_ar}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0'}}>{r.cartons_qty}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0'}}>{r.weight_per_carton}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(r.price_per_carton)}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(r.cartons_qty*r.weight_per_carton)}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0',fontWeight:600}}>{formatNumber(r.cartons_qty*r.price_per_carton)}</td></tr>))}</tbody>
            <tfoot>
              {transportCost>0&&<tr><td colSpan={5} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>مصاريف النقل</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(transportCost)} ر.س</td></tr>}
              {applyVat ? (<>
                <tr><td colSpan={5} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>المجموع قبل الضريبة</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(grandTotal)} ر.س</td></tr>
                <tr style={{background:'#fef3c7'}}><td colSpan={5} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#d97706',fontWeight:'bold'}}>ضريبة القيمة المضافة ({Number(siteSettings.vat_rate??15)}%)</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#d97706',fontWeight:'bold'}}>{formatNumber(grandTotal*(Number(siteSettings.vat_rate??15)/100))} ر.س</td></tr>
                <tr style={{background:'#dcfce7',fontWeight:'bold'}}><td colSpan={5} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>الإجمالي شامل الضريبة</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>{formatNumber(grandTotal+(grandTotal*(Number(siteSettings.vat_rate??15)/100)))} ر.س</td></tr>
              </>) : (
                <tr style={{background:'#dcfce7',fontWeight:'bold'}}><td colSpan={5} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>الإجمالي</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>{formatNumber(grandTotal)} ر.س</td></tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>
    </Sheet>
  )
}

// ── Records Table (individual items) ─────────────────────────────────────────
function PurchaseRecordsSection({ purchases, products, isLoading }: {
  purchases: Purchase[]; products: import('@/types').Product[]; isLoading: boolean
}) {
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterType, setFilterType] = useState<'all'|'purchase'|'return'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const { mutateAsync: deletePurchase } = useDeletePurchase()
  const canDelete = usePermission('purchases', 'delete')
  const canExport = usePermission('purchases', 'export')

  const filtered = useMemo(() => {
    let data = purchases
    if (filterType === 'purchase') data = data.filter(p => p.transaction_type !== 'مرتجع_مشتريات')
    if (filterType === 'return') data = data.filter(p => p.transaction_type === 'مرتجع_مشتريات')
    if (filterProduct) data = data.filter(p => p.product_id === filterProduct)
    if (filterDateFrom) data = data.filter(p => p.date >= filterDateFrom)
    if (filterDateTo) data = data.filter(p => p.date <= filterDateTo)
    return data
  }, [purchases, filterType, filterProduct, filterDateFrom, filterDateTo])

  const productOptions = products.map(p => ({ value: p.id, label: p.name_ar }))

  async function handleExport() {
    exportToExcel(filtered.map(p => ({
      'التاريخ': p.date, 'النوع': p.transaction_type === 'مرتجع_مشتريات' ? 'مرتجع' : 'شراء',
      'الصنف': products.find(pr => pr.id === p.product_id)?.name_ar ?? '',
      'المورد': p.supplier?.name_ar ?? '—', 'رقم الفاتورة': p.invoice_number ?? '—',
      'كراتين': p.cartons_qty, 'وزن/كرتون (كج)': p.weight_per_carton,
      'السعر/كرتون (ر.س)': p.price_per_carton, 'الوزن الكلي (كج)': p.total_weight,
      'التكلفة/كج': p.cost_per_kg, 'إجمالي التكلفة (ر.س)': p.total_cost,
    })), 'سجل-الحركات')
    toast.success('تم تصدير Excel')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border bg-background/50 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <QuickDateFilter from={filterDateFrom} to={filterDateTo} onFromChange={setFilterDateFrom} onToChange={setFilterDateTo}/>
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(['all','purchase','return'] as const).map(t=>(
              <button key={t} onClick={()=>setFilterType(t)}
                className={cn('px-3 py-1.5 font-medium transition-colors',filterType===t?'bg-primary text-primary-foreground':'bg-background text-muted-foreground hover:bg-muted')}>
                {t==='all'?'الكل':t==='purchase'?'مشتريات':'مرتجعات'}
              </button>
            ))}
          </div>
          <div className="w-44"><Combobox options={[{value:'',label:'كل الأصناف'},...productOptions]} value={filterProduct} onValueChange={setFilterProduct} placeholder="كل الأصناف"/></div>
          {(filterDateFrom||filterDateTo||filterProduct||filterType!=='all')&&<Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={()=>{setFilterDateFrom('');setFilterDateTo('');setFilterProduct('');setFilterType('all')}}>مسح</Button>}
        </div>
        <div className="flex items-center gap-2">
          {canDelete && selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-primary font-medium">{selectedIds.size} محدد</span>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-danger border-danger/30 hover:bg-danger/10"
                onClick={async () => { for (const id of selectedIds) { await deletePurchase(id) } setSelectedIds(new Set()); toast.success(`تم حذف ${selectedIds.size} سجل`) }}>
                <Trash2 className="w-3 h-3"/>حذف المحدد
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>إلغاء</Button>
            </div>
          )}
          <span className="text-xs text-muted-foreground">{filtered.length} سجل</span>
          {canExport && <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={handleExport}><FileDown className="w-3 h-3"/>تصدير Excel</Button>}
        </div>
      </div>

      {/* Columns */}
      {(() => {
        const columns: ColumnDef<Purchase>[] = [
          {
            id: 'select',
            header: () => (
              <input type="checkbox" className="rounded"
                checked={filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))}
                onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(p => p.id)) : new Set())}
              />
            ),
            cell: ({ row }) => (
              <input type="checkbox" className="rounded" checked={selectedIds.has(row.original.id)}
                onChange={e => setSelectedIds(prev => { const n=new Set(prev); e.target.checked?n.add(row.original.id):n.delete(row.original.id); return n })}
              />
            ),
            enableSorting: false,
          },
          { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(getValue() as string)}</span> },
          { accessorKey: 'transaction_type', header: 'النوع', cell: ({ getValue }) => {
            const isRet = getValue() === 'مرتجع_مشتريات'
            return <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', isRet?'bg-warning/15 text-warning':'bg-primary/15 text-primary')}>{isRet?'مرتجع':'شراء'}</span>
          }},
          { accessorFn: r => products.find(pr=>pr.id===r.product_id)?.name_ar ?? '—', id: 'product', header: 'الصنف', cell: ({ getValue }) => <span className="font-medium text-xs">{getValue() as string}</span> },
          { accessorFn: r => r.supplier?.name_ar ?? '—', id: 'supplier', header: 'المورد', cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
          { accessorKey: 'invoice_number', header: 'الفاتورة', cell: ({ getValue }) => {
            const v = getValue() as string|null
            return v ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{v}</span> : <span className="text-muted-foreground text-xs">—</span>
          }},
          { accessorKey: 'cartons_qty', header: 'كراتين', cell: ({ getValue }) => <span className="text-xs">{formatNumber(getValue() as number)}</span> },
          { accessorKey: 'cost_per_kg', header: 'التكلفة/كج', cell: ({ getValue }) => <span className="text-xs text-primary">{formatNumber(getValue() as number)}</span> },
          { accessorKey: 'total_cost', header: 'الإجمالي', cell: ({ getValue }) => <span className="font-semibold text-xs">{formatNumber(getValue() as number)}</span> },
          ...(canDelete ? [{ id: 'actions', header: '', enableSorting: false, cell: ({ row }: { row: { original: Purchase } }) => (
            <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:bg-danger/10"
              onClick={async () => { await deletePurchase(row.original.id); toast.success('تم الحذف') }}>
              <Trash2 className="w-3 h-3"/>
            </Button>
          )} as ColumnDef<Purchase>] : []),
        ]

        return isLoading ? (
          <div className="space-y-2 p-5">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-10"/>)}</div>
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            searchPlaceholder="بحث برقم الفاتورة أو الصنف أو المورد..."
            defaultPageSize={50}
            onExportExcel={handleExport}
          />
        )
      })()}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
type Section = 'invoices' | 'records' | 'returns' | 'suppliers'

export default function Purchases() {
  const canAdd = usePermission('purchases', 'add')
  const canEdit = usePermission('purchases', 'edit')
  const canDelete = usePermission('purchases', 'delete')

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editGroup, setEditGroup] = useState<InvoiceGroup|null>(null)
  const [detailGroup, setDetailGroup] = useState<InvoiceGroup|null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [deleteInvoice, setDeleteInvoice] = useState<InvoiceGroup|null>(null)
  const [activeSection, setActiveSection] = useState<Section>('invoices')
  const qc = useQueryClient()
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterInvoice, setFilterInvoice] = useState('')

  const today = todayISO()
  const {data:purchases,isLoading}=usePurchases()
  const {data:suppliers}=useSuppliers()
  const {data:products}=useProducts()
  const {mutateAsync:deleteByInvoice,isPending:isDeleting}=useDeletePurchasesByInvoice()

  // Stats for current month
  const cmpP=today.substring(0,7)
  const thisMonthPurch=useMemo(()=>(purchases??[]).filter(p=>p.date.startsWith(cmpP)&&p.transaction_type!=='مرتجع_مشتريات'),[purchases,cmpP])
  const monthPurchTotal=useMemo(()=>thisMonthPurch.reduce((s,p)=>s+p.total_cost,0),[thisMonthPurch])
  const monthPurchInvoices=useMemo(()=>new Set(thisMonthPurch.filter(p=>p.invoice_number).map(p=>p.invoice_number)).size,[thisMonthPurch])
  const monthPurchReturns=useMemo(()=>(purchases??[]).filter(p=>p.date.startsWith(cmpP)&&p.transaction_type==='مرتجع_مشتريات').reduce((s,p)=>s+p.total_cost,0),[purchases,cmpP])

  const filteredPurchases=useMemo(()=>{let data=purchases??[];if(filterSupplier)data=data.filter(p=>p.supplier_id===filterSupplier);if(filterDateFrom)data=data.filter(p=>p.date>=filterDateFrom);if(filterDateTo)data=data.filter(p=>p.date<=filterDateTo);return data},[purchases,filterSupplier,filterDateFrom,filterDateTo])
  const invoiceGroups=useMemo(()=>{
    let groups=groupPurchases(filteredPurchases.filter(p=>p.transaction_type!=='مرتجع_مشتريات'))
    if(filterInvoice) groups=groups.filter(g=>g.invoice_number?.toLowerCase().includes(filterInvoice.toLowerCase()))
    return groups
  },[filteredPurchases,filterInvoice])
  const returnGroups=useMemo(()=>{
    let groups=groupPurchases(filteredPurchases.filter(p=>p.transaction_type==='مرتجع_مشتريات'))
    if(filterInvoice) groups=groups.filter(g=>g.invoice_number?.toLowerCase().includes(filterInvoice.toLowerCase()))
    return groups
  },[filteredPurchases,filterInvoice])
  const allRecords=useMemo(()=>purchases??[],[purchases])

  const supplierOptions=(suppliers??[]).map(s=>({value:s.id,label:s.name_ar}))

  const sections = [
    { id: 'invoices' as Section, label: 'فواتير المشتريات', icon: FileText, count: invoiceGroups.length, color: 'text-primary' },
    { id: 'records' as Section, label: 'سجل الحركات', icon: List, count: allRecords.length, color: 'text-muted-foreground' },
    { id: 'returns' as Section, label: 'المرتجعات', icon: RotateCcw, count: returnGroups.length, color: 'text-warning' },
    { id: 'suppliers' as Section, label: 'الموردون', icon: Truck, count: (suppliers??[]).length, color: 'text-muted-foreground' },
  ]

  // Invoice groups table renderer
  function InvoicesTable({ groups }: { groups: InvoiceGroup[] }) {
    if (isLoading) return <div className="space-y-2 p-5">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-10"/>)}</div>
    if (groups.length===0) return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground py-16">
        <div className="text-center"><FileText className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="text-sm">لا توجد فواتير</p>{canAdd&&<Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={()=>{setEditGroup(null);setDrawerOpen(true)}}><Plus className="w-3.5 h-3.5"/>إضافة فاتورة</Button>}</div>
      </div>
    )
    const cols: ColumnDef<InvoiceGroup>[] = [
      { accessorKey:'invoice_number', header:'رقم الفاتورة', cell:({getValue})=>{const v=getValue() as string|null;return v?<span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">{v}</span>:<span className="text-muted-foreground text-xs">—</span>} },
      { accessorFn:r=>r.supplier_name, id:'supplier', header:'المورد', cell:({getValue})=><span className="font-medium text-sm">{getValue() as string}</span> },
      { accessorKey:'date', header:'التاريخ', cell:({getValue})=><span className="text-muted-foreground text-sm whitespace-nowrap">{formatDate(getValue() as string)}</span> },
      { id:'items', header:'الأصناف', enableSorting:false, cell:({row})=><button className="text-primary hover:underline text-xs font-medium" onClick={()=>{setDetailGroup(row.original);setDetailOpen(true)}}>{row.original.items.length} {row.original.items.length===1?'صنف':'أصناف'}</button> },
      { accessorKey:'total_cost', header:'الإجمالي (ر.س)', cell:({getValue})=><span className="font-semibold">{formatNumber(getValue() as number)}</span> },
      { id:'source', header:'النوع', enableSorting:false, cell:({row})=>{const g=row.original;return g.source==='google_sheet'?<Badge variant="secondary" className="text-xs">Sheets</Badge>:g.invoice_number?.startsWith('PIG')?<Badge variant="outline" className="text-xs">Excel</Badge>:g.invoice_number?<Badge className="text-xs bg-success/15 text-success border-success/20">يدوي</Badge>:<Badge variant="outline" className="text-xs">قديم</Badge>} },
      { id:'actions', header:'', enableSorting:false, cell:({row})=>{const g=row.original;return <div className="flex items-center gap-0.5"><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={()=>{setDetailGroup(g);setDetailOpen(true)}}><Eye className="w-3.5 h-3.5"/></Button>{canEdit&&g.source!=='google_sheet'&&<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={()=>{setEditGroup(g);setDrawerOpen(true)}}><Pencil className="w-3.5 h-3.5"/></Button>}{canDelete&&<Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10" onClick={()=>setDeleteInvoice(g)}><Trash2 className="w-3.5 h-3.5"/></Button>}</div>} },
    ]
    return <div className="p-4 flex-1 overflow-auto"><DataTable data={groups} columns={cols} showSearch={false} defaultPageSize={20}/></div>
  }

  const monthAvgInvoice = monthPurchInvoices > 0 ? monthPurchTotal / monthPurchInvoices : 0

  return (
    <div className="space-y-4">
      {/* ── Stats KPI ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'مشتريات الشهر', value: `${formatNumber(monthPurchTotal)} ر.س`, color: 'text-primary', bg: 'bg-primary/5 border-primary/15' },
          { label: 'مرتجعات الشهر', value: `${formatNumber(monthPurchReturns)} ر.س`, color: 'text-warning', bg: 'bg-warning/5 border-warning/15' },
          { label: 'فواتير الشهر', value: String(monthPurchInvoices), color: 'text-foreground', bg: 'bg-muted/50 border-border' },
          { label: 'متوسط الفاتورة', value: `${formatNumber(monthAvgInvoice)} ر.س`, color: 'text-muted-foreground', bg: 'bg-muted/50 border-border' },
        ].map(s=>(
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Sidebar + Content ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{minHeight: '560px'}}>
        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
          {/* Stats this month */}
          <div className="p-3 border-b border-border space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wide">هذا الشهر</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between px-1"><span className="text-muted-foreground">المشتريات</span><span className="font-semibold text-primary">{formatNumber(monthPurchTotal)} ر.س</span></div>
              <div className="flex justify-between px-1"><span className="text-muted-foreground">المرتجعات</span><span className="font-semibold text-warning">{formatNumber(monthPurchReturns)} ر.س</span></div>
              <div className="flex justify-between px-1"><span className="text-muted-foreground">الفواتير</span><span className="font-semibold">{monthPurchInvoices}</span></div>
            </div>
          </div>

          {/* Quick Actions */}
          {canAdd && (
            <div className="p-3 border-b border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wide">إجراءات سريعة</p>
              <Button size="sm" className="w-full gap-2 justify-start h-8" onClick={()=>{setEditGroup(null);setDrawerOpen(true)}}>
                <Plus className="w-3.5 h-3.5"/>فاتورة مشتريات
              </Button>
            </div>
          )}

          {/* Sections */}
          <div className="flex-1 p-2 space-y-0.5">
            <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">الأقسام</p>
            {sections.map(s=>(
              <button key={s.id} onClick={()=>setActiveSection(s.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                  activeSection===s.id?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <s.icon className="w-4 h-4 shrink-0"/>
                <span className="flex-1">{s.label}</span>
                {s.count>0&&<span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium',activeSection===s.id?'bg-white/20 text-white':'bg-primary/15 text-primary')}>{s.count}</span>}
              </button>
            ))}
          </div>
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Filter bar — only for invoices/returns */}
          {(activeSection==='invoices'||activeSection==='returns') && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border bg-background/50 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <QuickDateFilter from={filterDateFrom} to={filterDateTo} onFromChange={setFilterDateFrom} onToChange={setFilterDateTo}/>
                <Input placeholder="رقم الفاتورة..." value={filterInvoice} onChange={e=>setFilterInvoice(e.target.value)} className="h-8 text-sm w-36" dir="ltr"/>
                <div className="w-44"><Combobox options={[{value:'',label:'كل الموردين'},...supplierOptions]} value={filterSupplier} onValueChange={setFilterSupplier} placeholder="كل الموردين"/></div>
                {(filterDateFrom||filterDateTo||filterSupplier||filterInvoice)&&<Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={()=>{setFilterDateFrom('');setFilterDateTo('');setFilterSupplier('');setFilterInvoice('')}}>مسح</Button>}
              </div>
              <span className="text-xs text-muted-foreground">{activeSection==='invoices'?invoiceGroups.length:returnGroups.length} فاتورة</span>
            </div>
          )}

          {/* Section content */}
          {activeSection==='invoices' && <InvoicesTable groups={invoiceGroups}/>}
          {activeSection==='records' && <PurchaseRecordsSection purchases={allRecords} products={products??[]} isLoading={isLoading}/>}
          {activeSection==='returns' && <InvoicesTable groups={returnGroups}/>}
          {activeSection==='suppliers' && <SuppliersDashboard/>}
        </div>
      </div>

      {/* Drawer */}
      <PurchaseDrawer open={drawerOpen} onClose={()=>{setDrawerOpen(false);setEditGroup(null)}} editGroup={editGroup}/>

      {/* Detail Sheet */}
      <InvoiceDetailSheet group={detailGroup} open={detailOpen} onClose={()=>setDetailOpen(false)} products={products??[]}/>

      {/* Delete Invoice Dialog */}
      <Dialog open={!!deleteInvoice} onOpenChange={o=>!o&&setDeleteInvoice(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>حذف الفاتورة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">حذف الفاتورة <span className="font-mono font-medium">{deleteInvoice?.invoice_number??'—'}</span> بجميع أصنافها ({deleteInvoice?.items.length} صنف)؟</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={()=>setDeleteInvoice(null)}>إلغاء</Button>
            <Button variant="destructive" size="sm" disabled={isDeleting}
              onClick={async()=>{
                if(!deleteInvoice) return
                if(deleteInvoice.invoice_number){await deleteByInvoice(deleteInvoice.invoice_number)}
                else{
                  for(const item of deleteInvoice.items) await supabase.from('purchases').delete().eq('id',item.id)
                  qc.invalidateQueries({ queryKey: ['purchases'] })
                  qc.invalidateQueries({ queryKey: ['inventory'] })
                }
                toast.success('تم الحذف');setDeleteInvoice(null)
              }}>
              {isDeleting?'جاري الحذف...':'حذف'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
