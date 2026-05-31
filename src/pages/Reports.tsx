import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { FileDown } from 'lucide-react'
import { useCostAllocation } from '@/hooks/useCostAllocation'
import { useSalesByRange } from '@/hooks/useSales'
import { useCustomers } from '@/hooks/useCustomers'
import { useAppStore } from '@/store/appStore'
import { formatNumber, monthName } from '@/lib/utils'
import { cn } from '@/lib/utils'

async function exportToExcel(filename: string, headers: string[], rows: (string | number)[][]) {
  const { Workbook } = await import('exceljs')
  const wb = new Workbook()
  const ws = wb.addWorksheet('تقرير')
  ws.addRow(headers)
  rows.forEach(r => ws.addRow(r))
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function Reports() {
  const { selectedMonth, selectedYear } = useAppStore()
  const { data: allocations, isLoading } = useCostAllocation(selectedYear, selectedMonth)
  const monthStart = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`
  const monthEnd = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0]
  const { data: sales } = useSalesByRange(monthStart, monthEnd)
  const { data: customers } = useCustomers()

  const avgSellByProduct = useMemo(() => {
    const m = new Map<string, { total: number; qty: number }>()
    sales?.forEach(s => {
      const ex = m.get(s.product_id) ?? { total: 0, qty: 0 }
      m.set(s.product_id, { total: ex.total + s.total_amount, qty: ex.qty + s.qty_kg })
    })
    return new Map(Array.from(m.entries()).map(([k, v]) => [k, v.qty > 0 ? v.total / v.qty : 0]))
  }, [sales])

  const breakevenRows = useMemo(() =>
    (allocations ?? []).map(a => ({
      product: a.product?.name_ar ?? a.product_id,
      fullCostPerKg: a.full_cost_per_kg,
      avgSellPrice: avgSellByProduct.get(a.product_id) ?? 0,
      diff: (avgSellByProduct.get(a.product_id) ?? 0) - a.full_cost_per_kg,
    })).sort((a, b) => a.diff - b.diff),
    [allocations, avgSellByProduct]
  )

  const cmRows = useMemo(() =>
    (allocations ?? []).map(a => ({
      product: a.product?.name_ar ?? a.product_id,
      cm: a.contribution_margin,
      cmPct: a.contribution_margin_pct,
      revenue: a.revenue,
      directCost: a.direct_cost,
    })).sort((a, b) => b.cm - a.cm),
    [allocations]
  )

  const fullCostRows = useMemo(() =>
    (allocations ?? []).map(a => ({
      product: a.product?.name_ar ?? a.product_id,
      cogs: a.direct_cost,
      wasteCost: a.waste_cost,
      overhead: a.allocated_overhead,
      fullCost: a.total_full_cost,
      fullCostPerKg: a.full_cost_per_kg,
      qtyKg: a.qty_sold_kg,
    })).sort((a, b) => b.fullCost - a.fullCost),
    [allocations]
  )

  const customerProfitRows = useMemo(() => {
    const map = new Map<string, { revenue: number; cost: number }>()
    sales?.forEach(s => {
      const ex = map.get(s.customer_id) ?? { revenue: 0, cost: 0 }
      map.set(s.customer_id, { revenue: ex.revenue + s.total_amount, cost: ex.cost + s.total_purchase })
    })
    return customers?.map(c => {
      const st = map.get(c.id) ?? { revenue: 0, cost: 0 }
      return {
        name: c.name_ar,
        type: c.type,
        revenue: st.revenue,
        cost: st.cost,
        grossProfit: st.revenue - st.cost,
        grossMarginPct: st.revenue > 0 ? ((st.revenue - st.cost) / st.revenue) * 100 : 0,
      }
    }).sort((a, b) => b.grossProfit - a.grossProfit) ?? []
  }, [sales, customers])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          التقارير لشهر {monthName(selectedMonth)} {selectedYear}
        </p>
      </div>

      <Tabs defaultValue="breakeven">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="breakeven">Break-even</TabsTrigger>
          <TabsTrigger value="cm">Contribution Margin</TabsTrigger>
          <TabsTrigger value="fullcost">Full Cost/كج</TabsTrigger>
          <TabsTrigger value="customers">ربحية العملاء</TabsTrigger>
        </TabsList>

        {/* Break-even */}
        <TabsContent value="breakeven">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex justify-between items-center">
                <span>تقرير Break-even — السعر الأدنى للبيع بلا خسارة</span>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(
                  `breakeven-${selectedYear}-${selectedMonth}.xlsx`,
                  ['الصنف','Full Cost/كج','متوسط سعر البيع','الفرق'],
                  breakevenRows.map(r => [r.product, r.fullCostPerKg, r.avgSellPrice, r.diff])
                )} className="gap-2"><FileDown className="w-4 h-4" /> Excel</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-48" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        {['الصنف','Full Cost/كج','متوسط سعر البيع','الفرق','الحالة'].map(h => (
                          <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {breakevenRows.map((r, i) => (
                        <tr key={i} className={cn('border-b border-border/50', r.diff < 0 ? 'bg-danger/5' : r.diff < 2 ? 'bg-warning/5' : '')}>
                          <td className="px-3 py-2 font-medium">{r.product}</td>
                          <td className="px-3 py-2">{formatNumber(r.fullCostPerKg)}</td>
                          <td className="px-3 py-2">{formatNumber(r.avgSellPrice)}</td>
                          <td className={`px-3 py-2 font-medium ${r.diff >= 0 ? 'text-success' : 'text-danger'}`}>{formatNumber(r.diff)}</td>
                          <td className="px-3 py-2">
                            {r.diff < 0 ? '🔴 خسارة' : r.diff < 2 ? '🟡 هامش ضيق' : '🟢 ربح'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Contribution Margin */}
        <TabsContent value="cm">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex justify-between items-center">
                <span>تقرير Contribution Margin — مساهمة الصنف في تغطية التكاليف الثابتة</span>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(
                  `cm-${selectedYear}-${selectedMonth}.xlsx`,
                  ['الصنف','CM ريال','CM%','الإيراد','COGS'],
                  cmRows.map(r => [r.product, r.cm, r.cmPct, r.revenue, r.directCost])
                )} className="gap-2"><FileDown className="w-4 h-4" /> Excel</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-48" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        {['الصنف','CM ريال','CM%','الإيراد','COGS'].map(h => (
                          <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cmRows.map((r, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-2 font-medium">{r.product}</td>
                          <td className={`px-3 py-2 font-medium ${r.cm >= 0 ? 'text-success' : 'text-danger'}`}>{formatNumber(r.cm)}</td>
                          <td className={`px-3 py-2 ${r.cmPct >= 20 ? 'text-success' : r.cmPct >= 10 ? 'text-warning' : 'text-danger'}`}>{r.cmPct.toFixed(1)}%</td>
                          <td className="px-3 py-2">{formatNumber(r.revenue)}</td>
                          <td className="px-3 py-2">{formatNumber(r.directCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Full Cost */}
        <TabsContent value="fullcost">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex justify-between items-center">
                <span>التكلفة الكاملة لكل كج (بعد توزيع الـ Overhead)</span>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(
                  `fullcost-${selectedYear}-${selectedMonth}.xlsx`,
                  ['الصنف','COGS','تكلفة هدر','overhead','التكلفة الكاملة','Full Cost/كج','الكمية'],
                  fullCostRows.map(r => [r.product, r.cogs, r.wasteCost, r.overhead, r.fullCost, r.fullCostPerKg, r.qtyKg])
                )} className="gap-2"><FileDown className="w-4 h-4" /> Excel</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? <Skeleton className="h-48" /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        {['الصنف','COGS','تكلفة هدر','overhead','التكلفة الكاملة','Full Cost/كج','الكمية (كج)'].map(h => (
                          <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {fullCostRows.map((r, i) => (
                        <tr key={i} className="border-b border-border/50">
                          <td className="px-3 py-2 font-medium">{r.product}</td>
                          <td className="px-3 py-2">{formatNumber(r.cogs)}</td>
                          <td className="px-3 py-2 text-warning">{formatNumber(r.wasteCost)}</td>
                          <td className="px-3 py-2 text-blue-600">{formatNumber(r.overhead)}</td>
                          <td className="px-3 py-2 font-medium">{formatNumber(r.fullCost)}</td>
                          <td className="px-3 py-2 text-primary font-medium">{formatNumber(r.fullCostPerKg)}</td>
                          <td className="px-3 py-2">{formatNumber(r.qtyKg)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customer Profitability */}
        <TabsContent value="customers">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex justify-between items-center">
                <span>ربحية العملاء (هامش مباشر)</span>
                <Button variant="outline" size="sm" onClick={() => exportToExcel(
                  `customers-${selectedYear}-${selectedMonth}.xlsx`,
                  ['العميل','النوع','الإيراد','التكلفة','الربح المباشر','هامش%'],
                  customerProfitRows.map(r => [r.name, r.type, r.revenue, r.cost, r.grossProfit, r.grossMarginPct])
                )} className="gap-2"><FileDown className="w-4 h-4" /> Excel</Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      {['العميل','النوع','الإيراد','التكلفة','الربح المباشر','هامش%'].map(h => (
                        <th key={h} className="px-3 py-2 text-right text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customerProfitRows.map((r, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.type}</td>
                        <td className="px-3 py-2">{formatNumber(r.revenue)}</td>
                        <td className="px-3 py-2">{formatNumber(r.cost)}</td>
                        <td className={`px-3 py-2 font-medium ${r.grossProfit >= 0 ? 'text-success' : 'text-danger'}`}>{formatNumber(r.grossProfit)}</td>
                        <td className={`px-3 py-2 ${r.grossMarginPct >= 20 ? 'text-success' : r.grossMarginPct >= 10 ? 'text-warning' : 'text-danger'}`}>{r.grossMarginPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
