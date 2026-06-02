import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { BarChart } from '@/components/charts/BarChart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSalesByRange } from '@/hooks/useSales'
import { useWaste } from '@/hooks/useWaste'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { formatNumber, todayISO } from '@/lib/utils'
import type { Sale } from '@/types'
import { cn } from '@/lib/utils'
import { FileDown } from 'lucide-react'

type CostMode = 'direct' | 'with_waste'

interface ProfitRow {
  product_id: string
  name: string
  avgSellPrice: number
  avgWAC: number
  marginPerKg: number
  marginPct: number
  qtyKg: number
  totalRevenue: number
  totalCost: number
  totalWasteCost: number
  totalProfit: number
}

export default function Profits() {
  const today = todayISO()
  const thirtyAgo = new Date(today)
  thirtyAgo.setDate(thirtyAgo.getDate() - 30)
  const [fromDate, setFromDate] = useState(thirtyAgo.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today)
  const [costMode, setCostMode] = useState<CostMode>('direct')

  const { data: sales, isLoading } = useSalesByRange(fromDate, toDate)
  const { data: allWaste } = useWaste()
  const { data: latestCosts } = useLatestPurchaseCosts(toDate)

  const wasteInRange = useMemo(() =>
    allWaste?.filter(w => w.date >= fromDate && w.date <= toDate) ?? [],
    [allWaste, fromDate, toDate]
  )

  // Waste cost per product in the selected range
  const wasteCostByProduct = useMemo(() => {
    const result: Record<string, number> = {}
    wasteInRange.forEach(w => {
      const wac = latestCosts?.[w.product_id] ?? 0
      result[w.product_id] = (result[w.product_id] ?? 0) + w.waste_kg * wac
    })
    return result
  }, [wasteInRange, latestCosts])

  const profitRows = useMemo<ProfitRow[]>(() => {
    const map = new Map<string, { name: string; qty: number; revenue: number; cost: number; sells: Sale[] }>()
    sales?.forEach(s => {
      const name = s.product?.name_ar ?? s.product_id
      const existing = map.get(s.product_id) ?? { name, qty: 0, revenue: 0, cost: 0, sells: [] }
      // Use WAC from sale record, fallback to latestCosts
      const purchaseCost = s.total_purchase > 0
        ? s.total_purchase
        : s.qty_kg * (latestCosts?.[s.product_id] ?? 0)
      map.set(s.product_id, {
        ...existing,
        qty: existing.qty + s.qty_kg,
        revenue: existing.revenue + s.total_amount,
        cost: existing.cost + purchaseCost,
        sells: [...existing.sells, s],
      })
    })

    return Array.from(map.entries()).map(([product_id, r]) => {
      const totalWasteCost = costMode === 'with_waste' ? (wasteCostByProduct[product_id] ?? 0) : 0
      const avgSellPrice = r.qty > 0 ? r.revenue / r.qty : 0
      const avgWAC = r.qty > 0 ? r.cost / r.qty : (latestCosts?.[product_id] ?? 0)
      const totalProfit = r.revenue - r.cost - totalWasteCost
      const marginPct = r.revenue > 0 ? (totalProfit / r.revenue) * 100 : 0

      return {
        product_id,
        name: r.name,
        avgSellPrice,
        avgWAC,
        marginPerKg: avgSellPrice - avgWAC,
        marginPct,
        qtyKg: r.qty,
        totalRevenue: r.revenue,
        totalCost: r.cost,
        totalWasteCost,
        totalProfit,
      }
    }).sort((a, b) => b.totalProfit - a.totalProfit)
  }, [sales, latestCosts, wasteCostByProduct, costMode])

  const totalRevenue = useMemo(() => profitRows.reduce((s, r) => s + r.totalRevenue, 0), [profitRows])
  const totalCost = useMemo(() => profitRows.reduce((s, r) => s + r.totalCost, 0), [profitRows])
  const totalWasteCost = useMemo(() => profitRows.reduce((s, r) => s + r.totalWasteCost, 0), [profitRows])
  const totalProfit = totalRevenue - totalCost - totalWasteCost

  const barData = useMemo(() =>
    profitRows.slice(0, 15).map(r => ({ name: r.name, 'هامش%': parseFloat(r.marginPct.toFixed(1)) })),
    [profitRows]
  )

  const columns = useMemo<ColumnDef<ProfitRow>[]>(() => [
    { accessorKey: 'name', header: 'الصنف' },
    { accessorKey: 'avgWAC', header: 'م.و.م/كج', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'avgSellPrice', header: 'سعر البيع', cell: ({ getValue }) => formatNumber(getValue() as number) },
    {
      accessorKey: 'marginPerKg',
      header: 'هامش/كج',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={cn('font-medium', v >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(v)}</span>
      },
    },
    {
      accessorKey: 'marginPct',
      header: 'هامش%',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={v >= 0 ? 'text-success' : 'text-danger'}>{v.toFixed(1)}%</span>
      },
    },
    { accessorKey: 'qtyKg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'totalRevenue', header: 'الإيراد', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'totalCost', header: 'تكلفة البضاعة', cell: ({ getValue }) => formatNumber(getValue() as number) },
    ...(costMode === 'with_waste' ? [{
      accessorKey: 'totalWasteCost',
      header: 'تكلفة الهدر',
      cell: ({ getValue }: { getValue: () => unknown }) => (
        <span className="text-warning">{formatNumber(getValue() as number)}</span>
      ),
    } as ColumnDef<ProfitRow>] : []),
    {
      accessorKey: 'totalProfit',
      header: 'إجمالي الربح',
      cell: ({ getValue }) => {
        const v = getValue() as number
        return <span className={cn('font-bold', v >= 0 ? 'text-success' : 'text-danger')}>{formatNumber(v)}</span>
      },
    },
  ], [costMode])

  async function handleExportPDF() {
    if (profitRows.length === 0) return
    const el = document.getElementById('profits-report-content')
    if (!el) return
    try {
      const { jsPDF } = await import('jspdf')
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
      })
      const imgData = canvas.toDataURL('image/png')
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 8
      const imgWidth = pageWidth - 2 * margin
      const imgHeightFull = (canvas.height / canvas.width) * imgWidth
      const maxImgH = pageHeight - 2 * margin
      if (imgHeightFull <= maxImgH) {
        doc.addImage(imgData, 'PNG', margin, margin, imgWidth, imgHeightFull)
      } else {
        const ratio = canvas.width / imgWidth
        let srcY = 0
        while (srcY < canvas.height) {
          const sliceH = Math.min(Math.round(maxImgH * ratio), canvas.height - srcY)
          const slice = document.createElement('canvas')
          slice.width = canvas.width; slice.height = sliceH
          slice.getContext('2d')!.drawImage(canvas, 0, srcY, canvas.width, sliceH, 0, 0, canvas.width, sliceH)
          if (srcY > 0) doc.addPage()
          doc.addImage(slice.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, sliceH / ratio)
          srcY += sliceH
        }
      }
      doc.save(`profits-${fromDate}-${toDate}.pdf`)
    } catch {
      toast.error('حدث خطأ أثناء تصدير PDF')
    }
  }

  return (
    <div className="space-y-6">
      {/* hidden capture target for PDF — width matched to A4 landscape usable area */}
      <div id="profits-report-content" style={{
        position: 'fixed', top: '-9999px', left: '-9999px',
        width: '1060px', backgroundColor: '#fff', padding: '20px',
        fontFamily: 'Tahoma, Arial, sans-serif', direction: 'rtl', fontSize: '11px',
      }}>
        <div style={{ background: '#16a34a', color: '#fff', borderRadius: '6px', padding: '10px 14px', marginBottom: '10px' }}>
          <p style={{ fontWeight: 'bold', fontSize: '15px', margin: 0 }}>تحليل الأرباح — {fromDate} إلى {toDate}</p>
          <p style={{ fontSize: '11px', margin: '3px 0 0', opacity: 0.9 }}>
            الإيرادات: {formatNumber(totalRevenue)} ر.س | التكلفة: {formatNumber(totalCost)} ر.س | الربح: {formatNumber(totalProfit)} ر.س
          </p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '20%' }} />{/* الصنف */}
            <col style={{ width: '9%' }} />{/* م.و.م */}
            <col style={{ width: '9%' }} />{/* سعر البيع */}
            <col style={{ width: '9%' }} />{/* هامش/كج */}
            <col style={{ width: '8%' }} />{/* هامش% */}
            <col style={{ width: '11%' }} />{/* الكمية */}
            <col style={{ width: '12%' }} />{/* الإيراد */}
            <col style={{ width: '11%' }} />{/* التكلفة */}
            <col style={{ width: '11%' }} />{/* الربح */}
          </colgroup>
          <thead>
            <tr style={{ background: '#f1f5f9' }}>
              {['الصنف','م.و.م','سعر البيع','هامش/كج','هامش%','الكمية(كج)','الإيراد','التكلفة','الربح'].map(h => (
                <th key={h} style={{ padding: '6px 8px', textAlign: 'right', borderBottom: '2px solid #e2e8f0', color: '#374151', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profitRows.map((r, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}>{formatNumber(r.avgWAC)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}>{formatNumber(r.avgSellPrice)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left', color: r.marginPerKg >= 0 ? '#16a34a' : '#dc2626' }}>{formatNumber(r.marginPerKg)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left', color: r.marginPct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>{r.marginPct.toFixed(1)}%</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}>{formatNumber(r.qtyKg)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}>{formatNumber(r.totalRevenue)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left' }}>{formatNumber(r.totalCost)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'left', color: r.totalProfit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>{formatNumber(r.totalProfit)}</td>
              </tr>
            ))}
            <tr style={{ background: '#f1f5f9', fontWeight: 'bold', borderTop: '2px solid #e2e8f0' }}>
              <td style={{ padding: '7px 8px' }}>الإجمالي</td>
              <td colSpan={4} style={{ padding: '7px 8px' }}></td>
              <td style={{ padding: '7px 8px', textAlign: 'left' }}>{formatNumber(profitRows.reduce((s,r)=>s+r.qtyKg,0))}</td>
              <td style={{ padding: '7px 8px', textAlign: 'left' }}>{formatNumber(totalRevenue)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'left' }}>{formatNumber(totalCost)}</td>
              <td style={{ padding: '7px 8px', textAlign: 'left', color: totalProfit >= 0 ? '#16a34a' : '#dc2626' }}>{formatNumber(totalProfit)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <Label>من</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-40" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>إلى</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-40" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label>تكاليف المصروفات</Label>
              <Select value={costMode} onValueChange={v => setCostMode(v as CostMode)}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">ربح مباشر فقط</SelectItem>
                  <SelectItem value="with_waste">مع تكلفة الهدر</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-2 mb-0.5">
              <FileDown className="w-4 h-4" /> تصدير PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summaries */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">إجمالي الإيرادات</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(totalRevenue)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">تكلفة البضاعة</p>
            <p className="text-2xl font-bold text-foreground">{formatNumber(totalCost)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></p>
          </CardContent>
        </Card>
        {costMode === 'with_waste' && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-muted-foreground">تكلفة الهدر</p>
              <p className="text-2xl font-bold text-warning">{formatNumber(totalWasteCost)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">إجمالي الربح</p>
            <p className={`text-2xl font-bold ${totalProfit >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatNumber(totalProfit)} <span className="text-sm font-normal text-muted-foreground">ر.س</span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'}% هامش
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">هامش الربح% لكل صنف</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64" /> : (
            <BarChart
              data={barData}
              xAxisKey="name"
              bars={[{ dataKey: 'هامش%', name: 'هامش الربح%', color: '#16a34a' }]}
              layout="vertical"
              height={Math.max(280, barData.length * 30)}
            />
          )}
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تفاصيل الأرباح المباشرة</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <DataTable data={profitRows} columns={columns} searchPlaceholder="بحث عن صنف..." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
