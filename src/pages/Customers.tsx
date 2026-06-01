import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { BarChart } from '@/components/charts/BarChart'
import { DataTable } from '@/components/tables/DataTable'
import { useCustomers } from '@/hooks/useCustomers'
import { useSalesByRange } from '@/hooks/useSales'
import { formatNumber, formatDate, todayISO } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'
import type { Sale } from '@/types'
import { exportToExcel } from '@/lib/excel'

export default function Customers() {
  const today = todayISO()
  const ninetyAgo = new Date(today)
  ninetyAgo.setDate(ninetyAgo.getDate() - 90)
  const fromDate = ninetyAgo.toISOString().split('T')[0]

  const { data: customers, isLoading: customersLoading } = useCustomers()
  const { data: sales, isLoading: salesLoading } = useSalesByRange(fromDate, today)

  const isLoading = customersLoading || salesLoading

  const customerStats = useMemo(() => {
    const stats = new Map<string, {
      totalRevenue: number; totalCost: number; days: Set<string>
      productCounts: Map<string, number>; lastDate: string
    }>()

    sales?.forEach(s => {
      const existing = stats.get(s.customer_id) ?? {
        totalRevenue: 0, totalCost: 0, days: new Set<string>(),
        productCounts: new Map<string, number>(), lastDate: ''
      }
      existing.totalRevenue += s.total_amount
      existing.totalCost += s.total_purchase
      existing.days.add(s.date)
      const pName = s.product?.name_ar ?? s.product_id
      existing.productCounts.set(pName, (existing.productCounts.get(pName) ?? 0) + s.qty_kg)
      if (!existing.lastDate || s.date > existing.lastDate) existing.lastDate = s.date
      stats.set(s.customer_id, existing)
    })

    return customers?.map(c => {
      const st = stats.get(c.id)
      const topProducts = Array.from(st?.productCounts.entries() ?? [])
        .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name]) => name)
      return {
        ...c,
        totalRevenue: st?.totalRevenue ?? 0,
        grossProfit: (st?.totalRevenue ?? 0) - (st?.totalCost ?? 0),
        activeDays: st?.days.size ?? 0,
        avgDailyRevenue: st ? (st.totalRevenue / Math.max(st.days.size, 1)) : 0,
        topProducts,
        lastDate: st?.lastDate ?? '',
      }
    }).sort((a, b) => b.totalRevenue - a.totalRevenue) ?? []
  }, [customers, sales])

  const barData = useMemo(() =>
    customerStats.slice(0, 8).map(c => ({
      name: c.name_ar,
      'الإيراد': c.totalRevenue,
      'الربح المباشر': c.grossProfit,
    })),
    [customerStats]
  )

  const salesColumns = useMemo<ColumnDef<Sale>[]>(() => [
    { accessorKey: 'date', header: 'التاريخ', cell: ({ getValue }) => formatDate(getValue() as string) },
    { accessorFn: r => r.product?.name_ar ?? '', id: 'product', header: 'الصنف' },
    { accessorKey: 'qty_kg', header: 'الكمية (كج)', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'price_per_kg', header: 'السعر', cell: ({ getValue }) => formatNumber(getValue() as number) },
    { accessorKey: 'total_amount', header: 'الإجمالي', cell: ({ getValue }) => formatNumber(getValue() as number) },
  ], [])

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Customer cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {customerStats.map(c => (
          <Card key={c.id} className="hover:shadow-md transition-shadow">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-foreground">{c.name_ar}</p>
                  <p className="text-xs text-muted-foreground">{c.type}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded ${c.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'}`}>
                  {c.is_active ? 'نشط' : 'غير نشط'}
                </span>
              </div>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">إجمالي المبيعات</span>
                  <span className="font-medium">{formatNumber(c.totalRevenue)} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">متوسط يومي</span>
                  <span>{formatNumber(c.avgDailyRevenue)} ر.س</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">الربح المباشر</span>
                  <span className={c.grossProfit >= 0 ? 'text-success' : 'text-danger'}>
                    {formatNumber(c.grossProfit)} ر.س
                  </span>
                </div>
                {c.lastDate && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">آخر طلب</span>
                    <span className="text-xs">{formatDate(c.lastDate)}</span>
                  </div>
                )}
              </div>
              {c.topProducts.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">أكثر الأصناف طلباً:</p>
                  <div className="flex flex-wrap gap-1">
                    {c.topProducts.slice(0, 3).map((p, i) => (
                      <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">مقارنة الإيرادات والأرباح بين العملاء</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            data={barData}
            xAxisKey="name"
            bars={[
              { dataKey: 'الإيراد', name: 'الإيراد', color: '#3b82f6' },
              { dataKey: 'الربح المباشر', name: 'الربح المباشر', color: '#16a34a' },
            ]}
          />
        </CardContent>
      </Card>

      {/* All sales table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">جميع المبيعات — آخر 90 يوم</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            data={sales ?? []}
            columns={salesColumns}
            searchPlaceholder="بحث..."
            onExportExcel={async () => {
              await exportToExcel('customers-sales.xlsx',
                ['التاريخ','الصنف','الكمية(كج)','السعر','الإجمالي'],
                (sales ?? []).map(s => [s.date, s.product?.name_ar ?? '', s.qty_kg, s.price_per_kg, s.total_amount])
              )
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
