import { useState, useMemo, useRef, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Sheet } from '@/components/ui/sheet'
import { Combobox } from '@/components/ui/combobox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { CustomersDashboard } from '@/components/customers/CustomersDashboard'
import { useProducts } from '@/hooks/useProducts'
import { useCustomers } from '@/hooks/useCustomers'
import { useSales, useUpsertSales, useDeleteSale, useDeleteSalesByInvoice, nextSaleInvoiceNumber, getOrCreateDailySaleInvoice } from '@/hooks/useSales'
import { useInventoryDaily } from '@/hooks/useInventory'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useCustomerPrices, useUpsertCustomerPrices } from '@/hooks/useCustomerPrices'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import { exportToExcel, parseExcelFile } from '@/lib/excel'
import type { Sale, SaleFormRow } from '@/types'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Printer, Upload, FileDown, ShoppingBag, RotateCcw, FileText, Eye, Pencil, Users, List } from 'lucide-react'
import { DataTable } from '@/components/tables/DataTable'
import type { ColumnDef } from '@tanstack/react-table'
import { supabase } from '@/lib/supabase'
import { usePermission } from '@/hooks/usePermissions'

// ── Sale group type ───────────────────────────────────────────────────────────
interface SaleGroup {
  key: string; invoice_number: string|null; customer_name: string; customer_id: string
  date: string; total_amount: number; total_profit: number; transaction_type: string|null; source: string; items: Sale[]
}

function groupSales(data: Sale[]): SaleGroup[] {
  const map=new Map<string,SaleGroup>()
  data.forEach(s=>{
    const k=s.invoice_number??`single-${s.id}`
    if(!map.has(k)) map.set(k,{key:k,invoice_number:s.invoice_number,customer_name:s.customer?.name_ar??'—',customer_id:s.customer_id,date:s.date,total_amount:0,total_profit:0,transaction_type:s.transaction_type,source:s.source,items:[]})
    const g=map.get(k)!; g.total_amount+=s.total_amount; g.total_profit+=s.total_amount-s.total_purchase; g.items.push(s); if(s.date>g.date) g.date=s.date
  })
  return Array.from(map.values()).sort((a,b)=>b.date.localeCompare(a.date))
}

// ── Invoice Detail Sheet ──────────────────────────────────────────────────────
function InvoiceDetailSheet({ group, open, onClose, products }: {
  group: SaleGroup|null; open: boolean; onClose: ()=>void; products: import('@/types').Product[]
}) {
  if(!group) return null
  const g = group
  const site=(()=>{try{return JSON.parse(localStorage.getItem('gb_site_settings')??'{}')}catch{return{}}})()
  function handlePrint(){
    const el=document.getElementById('sale-detail-print');if(!el)return
    const w=window.open('','_blank','width=800,height=600');if(!w)return
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:20px;direction:rtl;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;text-align:right;border:1px solid #ddd}th{background:#f5f5f5;font-weight:bold}</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close();setTimeout(()=>{w.print();w.close()},300)
  }
  function handleExcel(){
    exportToExcel(g.items.map(s=>({'رقم الفاتورة':s.invoice_number??'—','العميل':s.customer?.name_ar??'—','الصنف':products.find(p=>p.id===s.product_id)?.name_ar??s.product_id,'التاريخ':s.date,'الكمية(كج)':s.qty_kg,'سعر البيع':s.price_per_kg,'الإجمالي':s.total_amount,'الربح':s.total_amount-s.total_purchase})),`فاتورة-${g.invoice_number??g.date}`)
    toast.success('تم تصدير Excel')
  }
  return (
    <Sheet open={open} onClose={onClose} title={`تفاصيل — ${g.invoice_number??'(بدون رقم)'}`}
      footer={<div className="flex gap-2 justify-end"><Button variant="outline" size="sm" className="gap-1.5" onClick={handleExcel}><FileDown className="w-4 h-4"/>Excel</Button><Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint}><Printer className="w-4 h-4"/>طباعة</Button></div>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-4 border border-border">
          <div><span className="text-muted-foreground">رقم الفاتورة: </span><span className="font-mono font-medium">{group.invoice_number??'—'}</span></div>
          <div><span className="text-muted-foreground">التاريخ: </span><span className="font-medium">{formatDate(group.date)}</span></div>
          <div><span className="text-muted-foreground">العميل: </span><span className="font-medium">{group.customer_name}</span></div>
          <div><span className="text-muted-foreground">الإجمالي: </span><span className="font-bold text-primary text-base">{formatNumber(group.total_amount)} ر.س</span></div>
          <div><span className="text-muted-foreground">الربح: </span><span className={cn('font-bold',group.total_profit>=0?'text-success':'text-danger')}>{formatNumber(group.total_profit)} ر.س</span></div>
        </div>
        <div id="sale-detail-print">
          <div style={{background:'#16a34a',color:'#fff',padding:'10px 14px',marginBottom:'12px',borderRadius:'6px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <div>
                <p style={{fontWeight:'bold',fontSize:'15px',margin:0}}>{site.name||'Greenbasket'}</p>
                {site.address&&<p style={{fontSize:'10px',margin:'2px 0 0',opacity:0.85}}>{site.address}</p>}
                {site.phone&&<p style={{fontSize:'10px',margin:'2px 0 0',opacity:0.85}}>هاتف: {site.phone}</p>}
                {site.tax_number&&<p style={{fontSize:'10px',margin:'2px 0 0',opacity:0.85}}>الرقم الضريبي: {site.tax_number}</p>}
              </div>
              <div style={{textAlign:'left'}}>
                <p style={{fontWeight:'bold',fontSize:'14px',margin:0}}>فاتورة مبيعات</p>
                <p style={{fontSize:'11px',margin:'2px 0 0',opacity:0.85}}>رقم: {group.invoice_number} | {formatDate(group.date)}</p>
                <p style={{fontSize:'11px',margin:'2px 0 0',opacity:0.85}}>العميل: {group.customer_name}</p>
              </div>
            </div>
          </div>
          {(()=>{
            const detailVatApplied=g.items.some(i=>i.vat_applied)
            const detailVatTotal=g.items.reduce((s,i)=>s+(i.vat_amount??0),0)
            return (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/50 border-b border-border">{['#','الصنف','الكمية(كج)','م.و.م','سعر البيع','الإجمالي','الربح'].map(h=><th key={h} className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody>
                    {group.items.map((s,i)=>{const profit=s.total_amount-s.total_purchase;return(
                      <tr key={s.id} className={cn('border-b border-border/50',i%2===1&&'bg-muted/20')}>
                        <td className="px-3 py-2 text-muted-foreground text-xs">{i+1}</td>
                        <td className="px-3 py-2 font-medium">{products.find(p=>p.id===s.product_id)?.name_ar??'—'}</td>
                        <td className="px-3 py-2">{formatNumber(s.qty_kg)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatNumber(s.purchase_price_per_kg)}</td>
                        <td className="px-3 py-2">{formatNumber(s.price_per_kg)}</td>
                        <td className="px-3 py-2 font-semibold">{formatNumber(s.total_amount)}</td>
                        <td className={cn('px-3 py-2 font-medium text-xs',profit>=0?'text-success':'text-danger')}>{formatNumber(profit)}</td>
                      </tr>
                    )})}
                  </tbody>
                  <tfoot>
                    {detailVatApplied?(
                      <>
                        <tr className="border-t border-border/50"><td className="px-3 py-2" colSpan={5}>المجموع قبل الضريبة</td><td className="px-3 py-2 font-semibold">{formatNumber(group.total_amount)} ر.س</td><td/></tr>
                        <tr className="bg-warning/5"><td className="px-3 py-2 text-warning" colSpan={5}>ضريبة القيمة المضافة</td><td className="px-3 py-2 font-semibold text-warning">{formatNumber(detailVatTotal)} ر.س</td><td/></tr>
                        <tr className="bg-primary/5 font-bold border-t-2 border-primary/20"><td className="px-3 py-2.5" colSpan={5}>الإجمالي شامل الضريبة</td><td className="px-3 py-2.5 text-primary text-base">{formatNumber(group.total_amount+detailVatTotal)} ر.س</td><td className={cn('px-3 py-2.5 text-sm',group.total_profit>=0?'text-success':'text-danger')}>{formatNumber(group.total_profit)}</td></tr>
                      </>
                    ):(
                      <tr className="bg-primary/5 font-bold border-t-2 border-primary/20"><td className="px-3 py-2.5" colSpan={5}>الإجمالي الكلي</td><td className="px-3 py-2.5 text-primary text-base">{formatNumber(group.total_amount)} ر.س</td><td className={cn('px-3 py-2.5 text-sm',group.total_profit>=0?'text-success':'text-danger')}>{formatNumber(group.total_profit)}</td></tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )
          })()}
        </div>
      </div>
    </Sheet>
  )
}

// ── Sale Drawer ───────────────────────────────────────────────────────────────
const emptyRow=():SaleFormRow=>({product_id:'',qty_kg:0,purchase_price_per_kg:0,price_per_kg:0})

function SaleDrawer({ open, onClose, editGroup }: { open: boolean; onClose: ()=>void; editGroup?: SaleGroup|null }) {
  const {data:products}=useProducts(); const {data:customers}=useCustomers()
  const {mutateAsync:upsert,isPending}=useUpsertSales(); const {mutateAsync:deleteByInvoice,isPending:isDeleting}=useDeleteSalesByInvoice()
  const drawerImportRef=useRef<HTMLInputElement>(null)
  const isEdit=!!editGroup
  const [invoiceNumber,setInvoiceNumber]=useState(''); const [date,setDate]=useState(todayISO())
  const [customerId,setCustomerId]=useState(''); const [rows,setRows]=useState<SaleFormRow[]>([emptyRow()])
  const [transactionType,setTransactionType]=useState<'بيع'|'مرتجع_مبيعات'>('بيع')
  const [submitted,setSubmitted]=useState(false)

  const {data:inventory}=useInventoryDaily(date); const {data:latestCosts}=useLatestPurchaseCosts(date)
  const {data:defaultPrices}=useCustomerPrices(customerId||undefined)

  useEffect(()=>{
    setSubmitted(false)
    if(!open) return
    if(isEdit&&editGroup){
      setDate(editGroup.date);setCustomerId(editGroup.customer_id);setTransactionType((editGroup.transaction_type as 'بيع'|'مرتجع_مبيعات')??'بيع')
      setInvoiceNumber(editGroup.invoice_number??'');setRows(editGroup.items.map(s=>({product_id:s.product_id,qty_kg:s.qty_kg,purchase_price_per_kg:s.purchase_price_per_kg,price_per_kg:s.price_per_kg,wac:s.purchase_price_per_kg})))
    }else{setDate(todayISO());setCustomerId('');setRows([emptyRow()]);setTransactionType('بيع');nextSaleInvoiceNumber('SIM').then(setInvoiceNumber).catch(()=>setInvoiceNumber('SIM-00001'))}
  },[open,isEdit,editGroup])

  function getWAC(pid:string){return inventory?.find(i=>i.product_id===pid)?.weighted_avg_cost||latestCosts?.[pid]||0}

  function updateRow(i:number,field:keyof SaleFormRow,value:string|number){
    setRows(prev=>prev.map((r,idx)=>{if(idx!==i)return r;const u={...r,[field]:value};if(field==='product_id'){const wac=getWAC(value as string);u.wac=wac;u.purchase_price_per_kg=wac;const dp=defaultPrices?.find(p=>p.product_id===value)?.price_per_kg;if(dp&&dp>0)u.price_per_kg=dp}return u}))
  }

  function findProductLocal(name:string){const n=name.trim().toLowerCase();return products?.find(p=>p.name_ar.trim().toLowerCase()===n||(p.name_en??'').trim().toLowerCase()===n)}

  async function handleDrawerImport(e:React.ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file||!products) return
    try{
      const parsed=await parseExcelFile(file);const newRows:SaleFormRow[]=[]; const unmatched:string[]=[]
      parsed.filter(r=>r['اسم الصنف']&&Number(r['الكمية(كج)'])>0).forEach(r=>{
        const prod=findProductLocal(String(r['اسم الصنف']??''));if(!prod){unmatched.push(String(r['اسم الصنف']));return}
        const qty=Number(r['الكمية(كج)']??0); if(qty<=0) return
        const wac=getWAC(prod.id);const dp=defaultPrices?.find(p=>p.product_id===prod.id)?.price_per_kg
        const price=Number(r['سعر البيع']??0)||dp||0; if(price<=0) return
        newRows.push({product_id:prod.id,qty_kg:qty,price_per_kg:price||dp||0,purchase_price_per_kg:wac,wac})
      })
      if(unmatched.length>0) toast.warning(`لم يُطابَق: ${unmatched.join('، ')}`)
      if(newRows.length>0){setRows(prev=>[...prev.filter(r=>r.product_id),...newRows]);toast.success(`تم إضافة ${newRows.length} صنف`)}
    }catch{toast.error('خطأ في قراءة الملف')}
    finally{if(drawerImportRef.current)drawerImportRef.current.value=''}
  }

  const grandTotal=rows.reduce((s,r)=>s+r.qty_kg*r.price_per_kg,0)
  const site=(()=>{try{return JSON.parse(localStorage.getItem('gb_site_settings')??'{}')}catch{return{}}})()
  const vatRequired=!!site.vat_required
  const [applyVat,setApplyVat]=useState(false)
  const vatRate=Number(site.vat_rate??15)
  const effectiveApplyVat=vatRequired||applyVat
  const vatAmount=effectiveApplyVat?grandTotal*(vatRate/100):0
  const totalWithVat=grandTotal+vatAmount

  async function handleSubmit(){
    setSubmitted(true)
    const valid=rows.filter(r=>r.product_id&&r.qty_kg>0)
    if(!customerId){toast.error('اختر عميلاً');return}; if(valid.length===0){toast.error('أضف صنفاً على الأقل');return}
    try{
      let invNum=invoiceNumber
      if(!isEdit) invNum=await getOrCreateDailySaleInvoice(date,customerId,'SIM')
      if(isEdit&&editGroup?.invoice_number) await deleteByInvoice(editGroup.invoice_number)
      const totalForVat=valid.reduce((s,r)=>s+r.qty_kg*r.price_per_kg,0)
      const invoiceVat=effectiveApplyVat?totalForVat*(vatRate/100):0
      await upsert(valid.map(r=>{const rowTotal=r.qty_kg*r.price_per_kg;const rowVat=effectiveApplyVat&&totalForVat>0?(rowTotal/totalForVat)*invoiceVat:0;return{product_id:r.product_id,customer_id:customerId,date,qty_kg:r.qty_kg,price_per_kg:r.price_per_kg,purchase_price_per_kg:r.wac??getWAC(r.product_id),source:'web' as const,invoice_number:invNum,transaction_type:transactionType,vat_applied:effectiveApplyVat,vat_amount:rowVat}}))
      toast.success(isEdit?`تم تعديل ${invNum}`:`تم حفظ ${invNum}`); onClose()
    }catch(err){toast.error(err instanceof Error&&err.message?err.message:'حدث خطأ أثناء الحفظ')}
  }

  function handlePrint(){
    const el=document.getElementById('drawer-sale-print');if(!el)return
    const w=window.open('','_blank','width=800,height=600');if(!w)return
    w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><style>body{font-family:Tahoma,Arial,sans-serif;font-size:12px;margin:20px;direction:rtl;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:7px 10px;text-align:right;border:1px solid #ddd}th{background:#f5f5f5;font-weight:bold}</style></head><body>${el.innerHTML}</body></html>`)
    w.document.close();setTimeout(()=>{w.print();w.close()},300)
  }

  const customerOptions=(customers??[]).map(c=>({value:c.id,label:c.name_ar}))
  const productOptions=(products??[]).map(p=>({value:p.id,label:p.name_ar,sub:p.category}))

  return (
    <Sheet open={open} onClose={onClose} width="min(680px, 100vw)"
      title={`${isEdit?'تعديل':'فاتورة'} مبيعات — ${invoiceNumber}`}
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm space-y-0.5">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">الإجمالي قبل ض.ق.م:</span>
              <span className="font-bold text-primary text-base">{formatNumber(grandTotal)} ر.س</span>
              {vatRequired
                ? <span className="text-xs px-2.5 py-1 rounded-lg border bg-warning/15 text-warning border-warning/30 font-medium">ض.ق.م {vatRate}% إلزامية</span>
                : <button onClick={()=>setApplyVat(v=>!v)} className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors font-medium',applyVat?'bg-warning/15 text-warning border-warning/30':'bg-muted text-muted-foreground border-border hover:bg-muted/80')}>{applyVat?`ض.ق.م ${vatRate}% مطبقة`:`إضافة ض.ق.م ${vatRate}%`}</button>
              }
            </div>
            {effectiveApplyVat&&<div className="flex gap-4 text-xs"><span className="text-muted-foreground">الضريبة: <span className="text-warning font-medium">{formatNumber(vatAmount)} ر.س</span></span><span className="font-bold text-success">الإجمالي مع الضريبة: {formatNumber(totalWithVat)} ر.س</span></div>}
          </div>
          <div className="flex gap-2"><Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="w-4 h-4"/>طباعة</Button><Button onClick={handleSubmit} disabled={isPending||isDeleting} className="gap-1.5">{(isPending||isDeleting)?'جاري الحفظ...':isEdit?'حفظ التعديلات':'حفظ الفاتورة'}</Button></div>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-2">{(['بيع','مرتجع_مبيعات'] as const).map(t=>(<button key={t} type="button" onClick={()=>setTransactionType(t)} className={cn('flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors',transactionType===t?t==='بيع'?'border-primary bg-primary/10 text-primary':'border-warning bg-warning/10 text-warning':'border-border bg-background text-muted-foreground hover:bg-muted/60')}>{t==='بيع'?'بيع':'مرتجع مبيعات'}</button>))}</div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label>العميل <span className="text-danger">*</span></Label><Combobox options={customerOptions} value={customerId} onValueChange={v=>{setCustomerId(v);setRows([emptyRow()])}} placeholder="اختر عميل..."/>{submitted&&!customerId&&<p className="text-xs text-danger mt-0.5">مطلوب</p>}</div>
          <div className="space-y-1.5"><Label>التاريخ</Label><Input type="date" value={date} onChange={e=>setDate(e.target.value)} dir="ltr"/></div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>الأصناف</Label>
            <div className="flex items-center gap-2">
              <input ref={drawerImportRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleDrawerImport}/>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={()=>drawerImportRef.current?.click()}><Upload className="w-3 h-3"/>استيراد Excel</Button>
              <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={async()=>{
                try {
                  const rows=(products??[]).map(p=>{
                    const custPrice=defaultPrices?.find(dp=>dp.product_id===p.id)?.price_per_kg
                    return [p.name_ar,'',custPrice?String(custPrice):'']
                  })
                  await exportToExcel(`قالب-مبيعات.xlsx`,['اسم الصنف','الكمية(كج)','سعر البيع'],rows)
                  toast.success('تم تحميل القالب')
                } catch { toast.error('فشل تحميل القالب') }
              }}><FileDown className="w-3 h-3"/>قالب</Button>
            </div>
          </div>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 border-b border-border">{['الصنف','الكمية(كج)','م.و.م','سعر البيع','الإجمالي',''].map(h=><th key={h} className="px-2 py-2 text-right text-xs font-medium text-muted-foreground">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r,i)=>{const lt=r.qty_kg*r.price_per_kg;return(
                  <tr key={i} className="border-b border-border/50 last:border-b-0">
                    <td className="px-2 py-1.5 w-48"><Combobox options={productOptions} value={r.product_id} onValueChange={v=>updateRow(i,'product_id',v)} placeholder="اختر صنف"/></td>
                    <td className="px-2 py-1.5 w-24"><Input type="number" min="0" step="0.01" dir="ltr" className="h-8 text-sm" value={r.qty_kg||''} onChange={e=>updateRow(i,'qty_kg',parseFloat(e.target.value)||0)}/></td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground w-16">{r.wac?formatNumber(r.wac):'—'}</td>
                    <td className="px-2 py-1.5 w-24"><Input type="number" min="0" step="0.01" dir="ltr" className="h-8 text-sm" value={r.price_per_kg||''} onChange={e=>updateRow(i,'price_per_kg',parseFloat(e.target.value)||0)}/></td>
                    <td className="px-2 py-1.5 font-semibold w-24">{lt>0?<span className={lt>(r.wac??0)*r.qty_kg?'text-success':''}>{formatNumber(lt)}</span>:<span className="text-muted-foreground">—</span>}</td>
                    <td className="px-2 py-1.5 w-8">{rows.length>1&&<button type="button" onClick={()=>setRows(prev=>prev.filter((_,idx)=>idx!==i))} className="text-danger hover:bg-danger/10 rounded p-1"><Trash2 className="w-3.5 h-3.5"/></button>}</td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          <Button variant="outline" size="sm" onClick={()=>setRows(prev=>[...prev,emptyRow()])} className="gap-1.5"><Plus className="w-3.5 h-3.5"/>إضافة صنف</Button>
        </div>
        <div className="rounded-lg bg-muted/30 border border-border p-4 text-sm"><div className="flex justify-between font-bold text-base"><span>الإجمالي الكلي</span><span className="text-primary">{formatNumber(grandTotal)} ر.س</span></div></div>
        <div id="drawer-sale-print" style={{display:'none'}}>
          <div style={{background:'#16a34a',color:'#fff',padding:'10px 14px',marginBottom:'12px',borderRadius:'6px'}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <div>
                <p style={{fontWeight:'bold',fontSize:'15px',margin:0}}>{site.name||'Greenbasket'}</p>
                {site.address&&<p style={{fontSize:'10px',margin:'2px 0 0',opacity:0.85}}>{site.address}</p>}
                {site.phone&&<p style={{fontSize:'10px',margin:'2px 0 0',opacity:0.85}}>هاتف: {site.phone}</p>}
                {site.tax_number&&<p style={{fontSize:'10px',margin:'2px 0 0',opacity:0.85}}>الرقم الضريبي: {site.tax_number}</p>}
              </div>
              <div style={{textAlign:'left'}}>
                <p style={{fontWeight:'bold',fontSize:'14px',margin:0}}>فاتورة مبيعات</p>
                <p style={{fontSize:'11px',margin:'2px 0 0',opacity:0.85}}>رقم: {invoiceNumber} | {formatDate(date)}</p>
                <p style={{fontSize:'11px',margin:'2px 0 0',opacity:0.85}}>العميل: {customers?.find(c=>c.id===customerId)?.name_ar}</p>
              </div>
            </div>
          </div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
            <thead><tr style={{background:'#f1f5f9'}}>{['#','الصنف','الكمية(كج)','سعر البيع','الإجمالي'].map(h=><th key={h} style={{padding:'6px 8px',border:'1px solid #e2e8f0',textAlign:'right'}}>{h}</th>)}</tr></thead>
            <tbody>{rows.filter(r=>r.product_id&&r.qty_kg>0).map((r,i)=>(<tr key={i}><td style={{padding:'5px 8px',border:'1px solid #e2e8f0',color:'#64748b'}}>{i+1}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0',fontWeight:600}}>{products?.find(p=>p.id===r.product_id)?.name_ar}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(r.qty_kg)}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(r.price_per_kg)}</td><td style={{padding:'5px 8px',border:'1px solid #e2e8f0',fontWeight:600}}>{formatNumber(r.qty_kg*r.price_per_kg)}</td></tr>))}</tbody>
            <tfoot>
              {effectiveApplyVat?(<>
                <tr><td colSpan={3} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>المجموع قبل الضريبة</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}>{formatNumber(grandTotal)} ر.س</td></tr>
                <tr style={{background:'#fef3c7'}}><td colSpan={3} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#d97706',fontWeight:'bold'}}>ضريبة القيمة المضافة ({vatRate}%)</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#d97706',fontWeight:'bold'}}>{formatNumber(vatAmount)} ر.س</td></tr>
                <tr style={{background:'#dcfce7',fontWeight:'bold'}}><td colSpan={3} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>الإجمالي شامل الضريبة</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>{formatNumber(totalWithVat)} ر.س</td></tr>
              </>):(
                <tr style={{background:'#dcfce7',fontWeight:'bold'}}><td colSpan={3} style={{padding:'6px 8px',border:'1px solid #e2e8f0'}}></td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>الإجمالي</td><td style={{padding:'6px 8px',border:'1px solid #e2e8f0',color:'#16a34a'}}>{formatNumber(grandTotal)} ر.س</td></tr>
              )}
            </tfoot>
          </table>
        </div>
      </div>
    </Sheet>
  )
}

// ── Sales Records Section ─────────────────────────────────────────────────────
function SalesRecordsSection({ sales, products, isLoading }: { sales: Sale[]; products: import('@/types').Product[]; isLoading: boolean }) {
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterCustomer, setFilterCustomer] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterType, setFilterType] = useState<'all'|'sale'|'return'>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<{ids:string[],label:string}|null>(null)
  const {data:customers}=useCustomers()
  const {mutateAsync:deleteSale,isPending:isDeleting}=useDeleteSale()

  const filtered=useMemo(()=>{
    let data=sales
    if(filterType==='sale') data=data.filter(s=>s.transaction_type!=='مرتجع_مبيعات')
    if(filterType==='return') data=data.filter(s=>s.transaction_type==='مرتجع_مبيعات')
    if(filterCustomer) data=data.filter(s=>s.customer_id===filterCustomer)
    if(filterProduct) data=data.filter(s=>s.product_id===filterProduct)
    if(filterDateFrom) data=data.filter(s=>s.date>=filterDateFrom)
    if(filterDateTo) data=data.filter(s=>s.date<=filterDateTo)
    return data
  },[sales,filterType,filterCustomer,filterProduct,filterDateFrom,filterDateTo])

  const customerOptions=(customers??[]).map(c=>({value:c.id,label:c.name_ar}))
  const productOptions=products.map(p=>({value:p.id,label:p.name_ar}))

  const columns = useMemo<ColumnDef<Sale>[]>(() => [
    {
      id: 'select',
      header: () => (
        <input type="checkbox" className="rounded"
          checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
          onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(s => s.id)) : new Set())}
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
      const isReturn = getValue() === 'مرتجع_مبيعات'
      return <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', isReturn?'bg-warning/15 text-warning':'bg-success/15 text-success')}>{isReturn?'مرتجع':'بيع'}</span>
    }},
    { accessorFn: r => r.customer?.name_ar ?? '—', id: 'customer', header: 'العميل', cell: ({ getValue }) => <span className="font-medium text-xs">{getValue() as string}</span> },
    { accessorFn: r => products.find(p=>p.id===r.product_id)?.name_ar ?? '—', id: 'product', header: 'الصنف', cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span> },
    { accessorKey: 'invoice_number', header: 'الفاتورة', cell: ({ getValue }) => {
      const v = getValue() as string|null
      return v ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{v}</span> : <span className="text-muted-foreground text-xs">—</span>
    }},
    { accessorKey: 'qty_kg', header: 'الكمية(كج)', cell: ({ getValue }) => <span className="text-xs">{formatNumber(getValue() as number)}</span> },
    { accessorKey: 'price_per_kg', header: 'سعر البيع', cell: ({ getValue }) => <span className="text-xs">{formatNumber(getValue() as number)}</span> },
    { accessorKey: 'total_amount', header: 'الإجمالي', cell: ({ getValue }) => <span className="font-semibold text-xs">{formatNumber(getValue() as number)}</span> },
    { id: 'profit', header: 'الربح', cell: ({ row }) => {
      const profit = row.original.total_amount - row.original.total_purchase
      return <span className={cn('text-xs font-medium', profit>=0?'text-success':'text-danger')}>{formatNumber(profit)}</span>
    }},
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => (
      <Button variant="ghost" size="icon" className="h-6 w-6 text-danger hover:bg-danger/10"
        onClick={() => setConfirmDelete({ids:[row.original.id],label:'هذا السجل'})}>
        <Trash2 className="w-3 h-3"/>
      </Button>
    )},
  ], [filtered, selectedIds, products, isDeleting])

  async function handleExport(){
    exportToExcel(filtered.map(s=>({'التاريخ':s.date,'النوع':s.transaction_type==='مرتجع_مبيعات'?'مرتجع':'بيع','العميل':s.customer?.name_ar??'','الصنف':products.find(p=>p.id===s.product_id)?.name_ar??'','رقم الفاتورة':s.invoice_number??'—','الكمية(كج)':s.qty_kg,'م.و.م':s.purchase_price_per_kg,'سعر البيع':s.price_per_kg,'الإجمالي':s.total_amount,'الربح':s.total_amount-s.total_purchase})),'سجل-المبيعات')
    toast.success('تم تصدير Excel')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-4 space-y-3">
      {/* فلاتر */}
      <div className="flex flex-wrap items-center gap-2">
        <QuickDateFilter from={filterDateFrom} to={filterDateTo} onFromChange={setFilterDateFrom} onToChange={setFilterDateTo}/>
        <div className="flex rounded-lg overflow-hidden border border-border text-xs">
          {(['all','sale','return'] as const).map(t=>(
            <button key={t} onClick={()=>setFilterType(t)}
              className={cn('px-3 py-1.5 font-medium transition-colors',filterType===t?'bg-primary text-primary-foreground':'bg-background text-muted-foreground hover:bg-muted')}>
              {t==='all'?'الكل':t==='sale'?'مبيعات':'مرتجعات'}
            </button>
          ))}
        </div>
        <div className="w-40"><Combobox options={[{value:'',label:'كل العملاء'},...customerOptions]} value={filterCustomer} onValueChange={setFilterCustomer} placeholder="كل العملاء"/></div>
        <div className="w-40"><Combobox options={[{value:'',label:'كل الأصناف'},...productOptions]} value={filterProduct} onValueChange={setFilterProduct} placeholder="كل الأصناف"/></div>
        {(filterDateFrom||filterDateTo||filterCustomer||filterProduct||filterType!=='all')&&
          <Button variant="ghost" size="sm" className="text-muted-foreground text-xs h-8" onClick={()=>{setFilterDateFrom('');setFilterDateTo('');setFilterCustomer('');setFilterProduct('');setFilterType('all')}}>مسح</Button>}
        {selectedIds.size > 0 && (
          <>
            <span className="text-xs text-primary font-medium">{selectedIds.size} محدد</span>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 text-danger border-danger/30 hover:bg-danger/10"
              onClick={() => { const ids=[...selectedIds]; setConfirmDelete({ids,label:`${ids.length} سجل`}) }}>
              <Trash2 className="w-3 h-3"/>حذف المحدد
            </Button>
          </>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-10"/>)}</div>
      ) : (
        <DataTable
          data={filtered}
          columns={columns}
          searchPlaceholder="بحث برقم الفاتورة أو الصنف أو العميل..."
          defaultPageSize={50}
          onExportExcel={handleExport}
        />
      )}
      <AlertDialog open={!!confirmDelete} onOpenChange={o=>!o&&setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف {confirmDelete?.label}؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async()=>{if(!confirmDelete)return;await Promise.all(confirmDelete.ids.map(id=>deleteSale(id)));setSelectedIds(prev=>{const n=new Set(prev);confirmDelete.ids.forEach(id=>n.delete(id));return n});toast.success(`تم حذف ${confirmDelete.label}`);setConfirmDelete(null)}}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
type Section = 'invoices'|'records'|'returns'|'customers'|'prices'

export default function Sales() {
  const canAdd = usePermission('sales', 'add')
  const canEdit = usePermission('sales', 'edit')
  const canDelete = usePermission('sales', 'delete')

  const [drawerOpen,setDrawerOpen]=useState(false); const [editGroup,setEditGroup]=useState<SaleGroup|null>(null)
  const [detailGroup,setDetailGroup]=useState<SaleGroup|null>(null); const [detailOpen,setDetailOpen]=useState(false)
  const [deleteInvoice,setDeleteInvoice]=useState<SaleGroup|null>(null); const [activeSection,setActiveSection]=useState<Section>('invoices')
  const qc = useQueryClient()
  const [filterDateFrom,setFilterDateFrom]=useState(''); const [filterDateTo,setFilterDateTo]=useState('')
  const [filterCustomer,setFilterCustomer]=useState(''); const [filterProduct,setFilterProduct]=useState('')
  const [filterInvoice,setFilterInvoice]=useState('')

  const today=todayISO()
  const {data:sales,isLoading}=useSales(); const {data:customers}=useCustomers(); const {data:products}=useProducts()
  const {mutateAsync:deleteByInvoice,isPending:isDeleting}=useDeleteSalesByInvoice()

  // Stats for current month
  const cmp=today.substring(0,7)
  const thisMonthSales=useMemo(()=>(sales??[]).filter(s=>s.date.startsWith(cmp)&&s.transaction_type!=='مرتجع_مبيعات'),[sales,cmp])
  const monthTotal=useMemo(()=>thisMonthSales.reduce((s,r)=>s+r.total_amount,0),[thisMonthSales])
  const monthProfit=useMemo(()=>thisMonthSales.reduce((s,r)=>s+r.total_amount-r.total_purchase,0),[thisMonthSales])
  const monthInvoices=useMemo(()=>new Set(thisMonthSales.filter(s=>s.invoice_number).map(s=>s.invoice_number)).size,[thisMonthSales])
  const monthReturns=useMemo(()=>(sales??[]).filter(s=>s.date.startsWith(cmp)&&s.transaction_type==='مرتجع_مبيعات').reduce((s,r)=>s+r.total_amount,0),[sales,cmp])

  const filteredSales=useMemo(()=>{let data=sales??[];if(filterCustomer)data=data.filter(s=>s.customer_id===filterCustomer);if(filterProduct)data=data.filter(s=>s.product_id===filterProduct);if(filterDateFrom)data=data.filter(s=>s.date>=filterDateFrom);if(filterDateTo)data=data.filter(s=>s.date<=filterDateTo);return data},[sales,filterCustomer,filterProduct,filterDateFrom,filterDateTo])

  const invoiceGroups=useMemo(()=>{
    let groups=groupSales(filteredSales.filter(s=>s.transaction_type!=='مرتجع_مبيعات'))
    if(filterInvoice) groups=groups.filter(g=>g.invoice_number?.toLowerCase().includes(filterInvoice.toLowerCase()))
    return groups
  },[filteredSales,filterInvoice])
  const returnGroups=useMemo(()=>{
    let groups=groupSales(filteredSales.filter(s=>s.transaction_type==='مرتجع_مبيعات'))
    if(filterInvoice) groups=groups.filter(g=>g.invoice_number?.toLowerCase().includes(filterInvoice.toLowerCase()))
    return groups
  },[filteredSales,filterInvoice])
  const allSaleRecords=useMemo(()=>sales??[],[sales])

  const customerOptions=(customers??[]).map(c=>({value:c.id,label:c.name_ar}))
  const productOptions=(products??[]).map(p=>({value:p.id,label:p.name_ar}))

  const sections=[
    {id:'invoices' as Section,label:'فواتير المبيعات',icon:FileText,count:invoiceGroups.length},
    {id:'records' as Section,label:'سجل الحركات',icon:List,count:allSaleRecords.length},
    {id:'returns' as Section,label:'المرتجعات',icon:RotateCcw,count:returnGroups.length},
    {id:'customers' as Section,label:'العملاء',icon:Users,count:(customers??[]).length},
    {id:'prices' as Section,label:'أسعار البيع',icon:ShoppingBag,count:0},
  ]

  function InvoicesTable({groups}:{groups:SaleGroup[]}){
    if(isLoading) return <div className="space-y-2 p-5">{[...Array(5)].map((_,i)=><Skeleton key={i} className="h-10"/>)}</div>
    if(groups.length===0) return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground py-16">
        <div className="text-center"><ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-30"/><p className="text-sm">لا توجد فواتير</p>{canAdd&&<Button size="sm" variant="outline" className="mt-3 gap-1.5" onClick={()=>{setEditGroup(null);setDrawerOpen(true)}}><Plus className="w-3.5 h-3.5"/>إضافة فاتورة</Button>}</div>
      </div>
    )
    const cols: ColumnDef<SaleGroup>[] = [
      { accessorKey:'invoice_number', header:'رقم الفاتورة', cell:({getValue})=>{const v=getValue() as string|null;return v?<span className="font-mono text-xs bg-success/10 text-success px-2 py-0.5 rounded font-medium">{v}</span>:<span className="text-muted-foreground text-xs">—</span>} },
      { accessorFn:r=>r.customer_name, id:'customer', header:'العميل', cell:({getValue})=><span className="font-medium text-sm">{getValue() as string}</span> },
      { accessorKey:'date', header:'التاريخ', cell:({getValue})=><span className="text-muted-foreground text-sm whitespace-nowrap">{formatDate(getValue() as string)}</span> },
      { id:'items', header:'الأصناف', enableSorting:false, cell:({row})=><button className="text-primary hover:underline text-xs font-medium" onClick={()=>{setDetailGroup(row.original);setDetailOpen(true)}}>{row.original.items.length} {row.original.items.length===1?'صنف':'أصناف'}</button> },
      { accessorKey:'total_amount', header:'الإجمالي', cell:({getValue})=><span className="font-semibold">{formatNumber(getValue() as number)}</span> },
      { id:'profit', header:'الربح', cell:({row})=><span className={cn('font-medium text-sm',row.original.total_profit>=0?'text-success':'text-danger')}>{formatNumber(row.original.total_profit)}</span> },
      { id:'source', header:'النوع', enableSorting:false, cell:({row})=>{const g=row.original;return g.source==='google_sheet'?<Badge variant="secondary" className="text-xs">Sheets</Badge>:g.invoice_number?.startsWith('SIG')?<Badge variant="outline" className="text-xs">Excel</Badge>:g.invoice_number?<Badge className="text-xs bg-success/15 text-success border-success/20">يدوي</Badge>:<Badge variant="outline" className="text-xs">قديم</Badge>} },
      { id:'actions', header:'', enableSorting:false, cell:({row})=>{const g=row.original;return <div className="flex items-center gap-0.5"><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={()=>{setDetailGroup(g);setDetailOpen(true)}}><Eye className="w-3.5 h-3.5"/></Button>{canEdit&&g.source!=='google_sheet'&&<Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={()=>{setEditGroup(g);setDrawerOpen(true)}}><Pencil className="w-3.5 h-3.5"/></Button>}{canDelete&&<Button variant="ghost" size="icon" className="h-7 w-7 text-danger hover:bg-danger/10" onClick={()=>setDeleteInvoice(g)}><Trash2 className="w-3.5 h-3.5"/></Button>}</div>} },
    ]
    return <div className="p-4 flex-1 overflow-auto"><DataTable data={groups} columns={cols} showSearch={false} defaultPageSize={20}/></div>
  }

  return (
    <div className="space-y-4">
      {/* ── Stats KPI ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'مبيعات الشهر', value: `${formatNumber(monthTotal)} ر.س`, color: 'text-success', bg: 'bg-success/5 border-success/15' },
          { label: 'ربح الشهر', value: `${formatNumber(monthProfit)} ر.س`, color: monthProfit>=0?'text-success':'text-danger', bg: monthProfit>=0?'bg-success/5 border-success/15':'bg-danger/5 border-danger/15' },
          { label: 'مرتجعات الشهر', value: `${formatNumber(monthReturns)} ر.س`, color: 'text-warning', bg: 'bg-warning/5 border-warning/15' },
          { label: 'فواتير الشهر', value: String(monthInvoices), color: 'text-foreground', bg: 'bg-muted/50 border-border' },
        ].map(s=>(
          <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Sidebar + Content ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{minHeight:'560px'}}>
        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
          {/* Stats this month */}
          <div className="p-3 border-b border-border space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wide">هذا الشهر</p>
            <div className="space-y-1 text-xs">
              <div className="flex justify-between px-1"><span className="text-muted-foreground">المبيعات</span><span className="font-semibold text-success">{formatNumber(monthTotal)} ر.س</span></div>
              <div className="flex justify-between px-1"><span className="text-muted-foreground">الربح</span><span className={cn('font-semibold',monthProfit>=0?'text-success':'text-danger')}>{formatNumber(monthProfit)} ر.س</span></div>
              <div className="flex justify-between px-1"><span className="text-muted-foreground">الفواتير</span><span className="font-semibold">{monthInvoices}</span></div>
            </div>
          </div>

          {/* Quick Actions */}
          {canAdd && (
            <div className="p-3 border-b border-border space-y-2">
              <p className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wide">إجراءات سريعة</p>
              <Button size="sm" className="w-full gap-2 justify-start h-8" onClick={()=>{setEditGroup(null);setDrawerOpen(true)}}>
                <Plus className="w-3.5 h-3.5"/>فاتورة مبيعات
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
          {/* Filter bar */}
          {(activeSection==='invoices'||activeSection==='returns')&&(
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border bg-background/50 shrink-0">
              <div className="flex flex-wrap items-center gap-2">
                <QuickDateFilter from={filterDateFrom} to={filterDateTo} onFromChange={setFilterDateFrom} onToChange={setFilterDateTo}/>
                <Input placeholder="رقم الفاتورة..." value={filterInvoice} onChange={e=>setFilterInvoice(e.target.value)} className="h-8 text-sm w-36" dir="ltr"/>
                <div className="w-40"><Combobox options={[{value:'',label:'كل العملاء'},...customerOptions]} value={filterCustomer} onValueChange={setFilterCustomer} placeholder="كل العملاء"/></div>
                <div className="w-40"><Combobox options={[{value:'',label:'كل الأصناف'},...productOptions]} value={filterProduct} onValueChange={setFilterProduct} placeholder="كل الأصناف"/></div>
                {(filterDateFrom||filterDateTo||filterCustomer||filterProduct||filterInvoice)&&<Button variant="ghost" size="sm" className="text-muted-foreground text-xs" onClick={()=>{setFilterDateFrom('');setFilterDateTo('');setFilterCustomer('');setFilterProduct('');setFilterInvoice('')}}>مسح</Button>}
              </div>
              <span className="text-xs text-muted-foreground">{activeSection==='invoices'?invoiceGroups.length:returnGroups.length} فاتورة</span>
            </div>
          )}

          {activeSection==='invoices'&&<InvoicesTable groups={invoiceGroups}/>}
          {activeSection==='records'&&<SalesRecordsSection sales={allSaleRecords} products={products??[]} isLoading={isLoading}/>}
          {activeSection==='returns'&&<InvoicesTable groups={returnGroups}/>}
          {activeSection==='customers'&&<CustomersDashboard/>}
          {activeSection==='prices'&&<CustomerPricesSection/>}
        </div>
      </div>

      {/* Drawer */}
      <SaleDrawer open={drawerOpen} onClose={()=>{setDrawerOpen(false);setEditGroup(null)}} editGroup={editGroup}/>

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
                  for(const item of deleteInvoice.items) await supabase.from('sales').delete().eq('id',item.id)
                  qc.invalidateQueries({ queryKey: ['sales'] })
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

// ── Customer Prices Section ────────────────────────────────────────────────────
function CustomerPricesSection() {
  const {data:products}=useProducts(); const {data:customers}=useCustomers()
  const [selectedCustomer,setSelectedCustomer]=useState('')
  const [prices,setPrices]=useState<Record<string,string>>({})
  const [bulkPrice,setBulkPrice]=useState('')
  const {data:existingPrices}=useCustomerPrices(selectedCustomer||undefined)
  const {mutateAsync:upsertPrices,isPending}=useUpsertCustomerPrices()
  useEffect(()=>{
    if(!selectedCustomer||!existingPrices)return
    const loaded:Record<string,string>={};existingPrices.forEach(p=>{loaded[p.product_id]=String(p.price_per_kg)});setPrices(loaded)
  },[existingPrices,selectedCustomer])
  async function handleSave(){
    if(!selectedCustomer){toast.error('اختر عميلاً أولاً');return}
    const rows=Object.entries(prices).filter(([,v])=>parseFloat(v)>0).map(([productId,price])=>({customer_id:selectedCustomer,product_id:productId,price_per_kg:parseFloat(price)}))
    if(rows.length===0){toast.error('أدخل سعراً واحداً على الأقل');return}
    try{await upsertPrices(rows);toast.success(`تم حفظ ${rows.length} سعر`)}catch{toast.error('حدث خطأ')}
  }
  return(
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-end gap-3 px-5 py-3 border-b border-border bg-background/50 shrink-0">
        <div className="space-y-1"><Label className="text-xs">العميل</Label>
          <Select value={selectedCustomer} onValueChange={v=>{setSelectedCustomer(v);setPrices({})}}>
            <SelectTrigger className="h-9 text-sm w-56"><SelectValue placeholder="اختر عميلاً" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">اختر عميلاً</SelectItem>
              {customers?.map(c=><SelectItem key={c.id} value={c.id}>{c.name_ar}</SelectItem>)}
            </SelectContent>
          </Select></div>
        {selectedCustomer&&<>
          <div className="space-y-1"><Label className="text-xs">سعر موحد</Label>
            <div className="flex gap-2"><Input type="number" min="0" step="0.01" placeholder="0.00" value={bulkPrice} onChange={e=>setBulkPrice(e.target.value)} className="w-28 h-9" dir="ltr"/>
              <Button variant="outline" className="h-9 text-xs" onClick={()=>{const v=parseFloat(bulkPrice);if(!v||!products)return;const all:Record<string,string>={};products.forEach(p=>{all[p.id]=String(v)});setPrices(all)}}>تطبيق على الكل</Button></div></div>
          <Button onClick={handleSave} disabled={isPending} className="h-9">{isPending?'جاري الحفظ...':'حفظ الأسعار'}</Button>
        </>}
      </div>
      {!selectedCustomer?(
        <div className="flex-1 flex items-center justify-center text-muted-foreground"><p className="text-sm">اختر عميلاً لعرض وتعديل أسعار البيع الافتراضية</p></div>
      ):(
        <div className="overflow-auto flex-1">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-muted/20 sticky top-0">{['الصنف','الفئة','سعر البيع (ر.س/كج)','السعر المحفوظ'].map(h=><th key={h} className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>{products?.map(p=>{const saved=existingPrices?.find(ep=>ep.product_id===p.id);return(
              <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-3 py-2 font-medium text-sm">{p.name_ar}</td>
                <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                <td className="px-3 py-2"><Input type="number" min="0" step="0.01" placeholder="0.00" value={prices[p.id]??''} onChange={e=>setPrices(prev=>({...prev,[p.id]:e.target.value}))} className="w-28 h-8 text-sm" dir="ltr"/></td>
                <td className="px-3 py-2 text-muted-foreground text-xs">{saved?formatNumber(saved.price_per_kg):'—'}</td>
              </tr>
            )})}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
