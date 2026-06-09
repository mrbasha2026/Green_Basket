import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  useAccountingPeriods, usePeriodLog, useCalculatePeriodWAC,
  useClosePeriod, useOpenPeriod, MONTH_NAMES, ACTION_LABELS,
} from '@/hooks/usePeriodManagement'
import { formatDate, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Calculator, Lock, LockOpen, History, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { usePermission } from '@/hooks/usePermissions'

const currentYear = new Date(todayISO() + 'T12:00:00').getFullYear()

export default function PeriodManagement() {
  const canApprove = usePermission('period_management', 'approve')
  const canPost = usePermission('period_management', 'post')

  const [selectedYear, setSelectedYear] = useState(currentYear)

  const { data: periods = [], isLoading: pLoading } = useAccountingPeriods()
  const { data: logs   = [], isLoading: lLoading } = usePeriodLog()

  const { mutateAsync: calculateWAC, isPending: isCalc } = useCalculatePeriodWAC()
  const { mutateAsync: closePeriod,  isPending: isClose } = useClosePeriod()
  const { mutateAsync: openPeriod,   isPending: isOpen  } = useOpenPeriod()

  const isPending = isCalc || isClose || isOpen

  // الشهور الـ 12 للسنة المختارة مدمجة مع البيانات الموجودة
  const monthRows = MONTH_NAMES.map((name, i) => {
    const month = i + 1
    const period = periods.find(p => p.period_year === selectedYear && p.period_month === month)
    return { month, name, period }
  })

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  async function handleCalculate(month: number) {
    try {
      const res = await calculateWAC({ year: selectedYear, month })
      toast.success(`تم احتساب WAC — ${res.products} صنف، ${res.sales} مبيعة`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleClose(month: number) {
    try {
      const res = await calculateWAC({ year: selectedYear, month })
      toast.success(`تم احتساب WAC — ${res.products} صنف، ${res.sales} مبيعة`)
      await closePeriod({ year: selectedYear, month, periods })
      toast.success(`تم إغلاق ${MONTH_NAMES[month - 1]} ${selectedYear}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function handleOpen(month: number) {
    try {
      await openPeriod({ year: selectedYear, month, periods })
      toast.success(`تم فتح ${MONTH_NAMES[month - 1]} ${selectedYear}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-6 p-6 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">إدارة الفترات المحاسبية</h1>
          <p className="text-sm text-muted-foreground mt-0.5">احتساب WAC وإغلاق الشهور بالترتيب</p>
        </div>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Periods table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calculator className="w-4 h-4 text-primary" />
            فترات {selectedYear}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {pLoading ? (
            <div className="p-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {['الشهر', 'الحالة', 'آخر احتساب WAC', 'تاريخ الإغلاق', 'إجراءات'].map(h => (
                      <th key={h} className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthRows.map(({ month, name, period }) => {
                    const isClosed = period?.status === 'closed'
                    const hasWAC   = !!period?.wac_calculated_at

                    return (
                      <tr key={month} className={cn(
                        'border-b border-border/50 hover:bg-muted/20 transition-colors',
                        isClosed && 'bg-muted/10'
                      )}>
                        {/* الشهر */}
                        <td className="px-4 py-3 font-semibold">
                          {name} {selectedYear}
                        </td>

                        {/* الحالة */}
                        <td className="px-4 py-3">
                          {isClosed ? (
                            <Badge variant="outline" className="gap-1 text-success border-success/30 bg-success/10">
                              <CheckCircle2 className="w-3 h-3" />مغلق
                            </Badge>
                          ) : hasWAC ? (
                            <Badge variant="outline" className="gap-1 text-primary border-primary/30 bg-primary/10">
                              <Calculator className="w-3 h-3" />محتسب
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              مفتوح
                            </Badge>
                          )}
                        </td>

                        {/* آخر احتساب */}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {period?.wac_calculated_at ? formatDate(period.wac_calculated_at.split('T')[0]) : '—'}
                        </td>

                        {/* تاريخ الإغلاق */}
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {period?.closed_at ? formatDate(period.closed_at.split('T')[0]) : '—'}
                        </td>

                        {/* الأزرار */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {canApprove && !isClosed && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                                disabled={isPending}
                                onClick={() => handleCalculate(month)}>
                                <Calculator className="w-3 h-3" />
                                {isCalc ? 'جاري...' : 'احتساب WAC'}
                              </Button>
                            )}
                            {canPost && !isClosed && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-success/40 text-success hover:bg-success/10"
                                disabled={isPending}
                                onClick={() => handleClose(month)}>
                                <Lock className="w-3 h-3" />إغلاق
                              </Button>
                            )}
                            {canApprove && isClosed && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 border-warning/40 text-warning hover:bg-warning/10"
                                disabled={isPending}
                                onClick={() => handleOpen(month)}>
                                <LockOpen className="w-3 h-3" />فتح
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rules notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-muted/40 border border-border text-sm text-muted-foreground">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-warning" />
        <div className="space-y-1">
          <p>• لا يمكن إغلاق شهر إذا كان الشهر السابق مفتوحاً.</p>
          <p>• لا يمكن فتح شهر إذا كان الشهر التالي مغلقاً.</p>
          <p>• إعادة فتح الشهر تحذف رصيد إغلاقه ويجب إعادة الاحتساب.</p>
        </div>
      </div>

      {/* Audit log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            سجل الأحداث
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {lLoading ? (
            <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : logs.length === 0 ? (
            <p className="text-center py-10 text-sm text-muted-foreground">لا توجد أحداث مسجّلة بعد</p>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/30 z-10">
                  <tr className="border-b border-border">
                    {['التاريخ والوقت', 'الفترة', 'العملية', 'ملاحظات'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr key={log.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {new Date(log.performed_at).toLocaleString('ar-SA', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-2.5 font-medium">
                        {MONTH_NAMES[log.period_month - 1]} {log.period_year}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', {
                          'bg-primary/10 text-primary':   log.action === 'calculate',
                          'bg-success/10 text-success':   log.action === 'close',
                          'bg-warning/10 text-warning':   log.action === 'open',
                        })}>
                          {ACTION_LABELS[log.action]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {log.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
