import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import type { ColumnDef } from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { DataTable } from '@/components/tables/DataTable'
import { BarChart } from '@/components/charts/BarChart'
import { QuickDateFilter } from '@/components/ui/quick-date-filter'
import { useSalesByRange } from '@/hooks/useSales'
import { useWaste } from '@/hooks/useWaste'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { formatNumber, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { FileDown, BarChart2, Table2, Sliders } from 'lucide-react'
import { usePermission } from '@/hooks/usePermissions'

type CostMode = 'direct' | 'with_waste'
type ProfitsSection = 'chart' | 'table'
type GroupBy = 'product' | 'customer'

interface ProfitRow {
  id: string
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
  const canExport = usePermission('profits', 'export')

  const today = todayISO()
  const thirtyAgo = new Date(today)
  thirtyAgo.setDate(thirtyAgo.getDate() - 30)
  const [fromDate, setFromDate] = useState(thirtyAgo.toISOString().split('T')[0])
  const [toDate, setToDate] = useState(today)
  const [costMode, setCostMode] = useState<CostMode>('direct')
  const [groupBy, setGroupBy] = useState<GroupBy>('product')
  const [activeSection, setActiveSection] = useState<ProfitsSection>('chart')

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
    const map = new Map<string, { name: string; qty: number; revenue: number; cost: number }>()
    sales?.forEach(s => {
      const key  = groupBy === 'product' ? s.product_id : s.customer_id
      const name = groupBy === 'product'
        ? (s.product?.name_ar ?? s.product_id)
        : (s.customer?.name_ar ?? s.customer_id)
      const existing = map.get(key) ?? { name, qty: 0, revenue: 0, cost: 0 }
      const purchaseCost = s.total_purchase > 0
        ? s.total_purchase
        : s.qty_kg * (latestCosts?.[s.product_id] ?? 0)
      map.set(key, {
        ...existing,
        qty: existing.qty + s.qty_kg,
        revenue: existing.revenue + s.total_amount,
        cost: existing.cost + purchaseCost,
      })
    })

    return Array.from(map.entries()).map(([id, r]) => {
      // تكلفة الهدر تُحسب فقط عند التجميع حسب الصنف
      const totalWasteCost = groupBy === 'product' && costMode === 'with_waste'
        ? (wasteCostByProduct[id] ?? 0)
        : 0
      const avgSellPrice = r.qty > 0 ? r.revenue / r.qty : 0
      const avgWAC = r.qty > 0 ? r.cost / r.qty : (groupBy === 'product' ? (latestCosts?.[id] ?? 0) : 0)
      const totalProfit = r.revenue - r.cost - totalWasteCost
      const marginPct = r.revenue > 0 ? (totalProfit / r.revenue) * 100 : 0

      return {
        id,
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
  }, [sales, latestCosts, wasteCostByProduct, costMode, groupBy])

  const totalRevenue = useMemo(() => profitRows.reduce((s, r) => s + r.totalRevenue, 0), [profitRows])
  const totalCost = useMemo(() => profitRows.reduce((s, r) => s + r.totalCost, 0), [profitRows])
  const totalWasteCost = useMemo(() => profitRows.reduce((s, r) => s + r.totalWasteCost, 0), [profitRows])
  const totalProfit = totalRevenue - totalCost - totalWasteCost

  const barData = useMemo(() =>
    profitRows.slice(0, 15).map(r => ({ name: r.name, 'هامش%': parseFloat(r.marginPct.toFixed(1)) })),
    [profitRows]
  )

  const columns = useMemo<ColumnDef<ProfitRow>[]>(() => [
    { accessorKey: 'name', header: groupBy === 'product' ? 'الصنف' : 'العميل' },
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
  ], [costMode, groupBy])

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
        logging: false,
        onclone: (doc) => {
          // Remove external stylesheets to avoid @import CSS warnings during capture
          doc.querySelectorAll('link[rel="stylesheet"]').forEach(l => l.remove())
        },
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

  const sections: { id: ProfitsSection; label: string; icon: React.ElementType }[] = [
    { id: 'chart', label: 'هامش الربح (رسم بياني)', icon: BarChart2 },
    { id: 'table', label: 'تفاصيل الأرباح', icon: Table2 },
  ]

  return (
    <div className="space-y-4">
      {/* hidden capture target for PDF */}
      <div id="profits-report-content" style={{
        position: 'absolute', top: '0', left: '-9999px',
        width: '1060px', backgroundColor: '#fff', color: '#111827', padding: '20px',
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
            <col style={{ width: '20%' }} /><col style={{ width: '9%' }} /><col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '12%' }} /><col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
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
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: '600' }}>{r.name}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>{formatNumber(r.avgWAC)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>{formatNumber(r.avgSellPrice)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: r.marginPerKg >= 0 ? '#16a34a' : '#dc2626' }}>{formatNumber(r.marginPerKg)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: r.marginPct >= 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>{r.marginPct.toFixed(1)}%</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>{formatNumber(r.qtyKg)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>{formatNumber(r.totalRevenue)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9' }}>{formatNumber(r.totalCost)}</td>
                <td style={{ padding: '5px 8px', borderBottom: '1px solid #f1f5f9', color: r.totalProfit >= 0 ? '#16a34a' : '#dc2626', fontWeight: 'bold' }}>{formatNumber(r.totalProfit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Stat summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الإيرادات', value: formatNumber(totalRevenue), cls: 'text-foreground' },
          { label: 'تكلفة البضاعة', value: formatNumber(totalCost), cls: 'text-foreground' },
          ...(costMode === 'with_waste' ? [{ label: 'تكلفة الهدر', value: formatNumber(totalWasteCost), cls: 'text-warning' }] : []),
          { label: 'إجمالي الربح', value: `${formatNumber(totalProfit)} (${totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'}%)`, cls: totalProfit >= 0 ? 'text-success' : 'text-danger' },
        ].map(({ label, value, cls }) => (
          <Card key={label}><CardContent className="pt-5">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={`text-xl font-bold ${cls}`}>{value} <span className="text-xs font-normal text-muted-foreground">ر.س</span></p>
          </CardContent></Card>
        ))}
      </div>

      {/* Sidebar + content */}
      <div className="rounded-xl border border-border overflow-hidden bg-card flex" style={{ minHeight: '560px' }}>
        {/* Sidebar */}
        <nav className="w-56 shrink-0 border-l border-border bg-muted/30 flex flex-col">
          {/* Filters */}
          <div className="p-3 border-b border-border space-y-3">
            <p className="text-xs font-semibold text-muted-foreground px-1 py-1 uppercase tracking-wide">فلتر التواريخ</p>
            <QuickDateFilter from={fromDate} to={toDate} onFromChange={setFromDate} onToChange={setToDate} className="flex-col items-stretch gap-1.5" />
          </div>

          {/* Group by */}
          <div className="p-3 border-b border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wide">تحليل حسب</p>
            {(['product', 'customer'] as const).map(g => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={cn('w-full text-right px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                  groupBy === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted')}>
                {g === 'product' ? 'حسب الصنف' : 'حسب العميل'}
              </button>
            ))}
          </div>

          {/* Cost mode */}
          <div className="p-3 border-b border-border space-y-2">
            <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wide flex items-center gap-1.5"><Sliders className="w-3.5 h-3.5"/>وضع التكلفة</p>
            {(['direct','with_waste'] as const).map(m => (
              <button key={m} onClick={() => setCostMode(m)}
                className={cn('w-full text-right px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                  costMode === m ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-background text-muted-foreground hover:bg-muted')}>
                {m === 'direct' ? 'ربح مباشر فقط' : 'مع تكلفة الهدر'}
              </button>
            ))}
          </div>

          {/* Export */}
          {canExport && (
            <div className="p-3 border-b border-border">
              <Button variant="outline" size="sm" className="w-full gap-2 justify-start h-8 text-xs" onClick={handleExportPDF}>
                <FileDown className="w-3.5 h-3.5"/>تصدير PDF
              </Button>
            </div>
          )}

          {/* Sections */}
          <div className="flex-1 p-2 space-y-0.5">
            <p className="text-xs font-semibold text-muted-foreground px-3 py-2 uppercase tracking-wide">العروض</p>
            {sections.map(s => (
              <button key={s.id} onClick={() => setActiveSection(s.id)}
                className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-right',
                  activeSection === s.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <s.icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{s.label}</span>
              </button>
            ))}
          </div>
        </nav>

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col overflow-auto p-5 space-y-5">
          {activeSection === 'chart' && (
            <Card>
              <CardHeader><CardTitle className="text-base">هامش الربح% لكل صنف</CardTitle></CardHeader>
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
          )}

          {activeSection === 'table' && (
            <Card>
              <CardHeader><CardTitle className="text-base">تفاصيل الأرباح</CardTitle></CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
                ) : (
                  <DataTable data={profitRows} columns={columns} searchPlaceholder={groupBy === 'product' ? 'بحث عن صنف...' : 'بحث عن عميل...'} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
