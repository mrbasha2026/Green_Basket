import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface AccountingPeriod {
  id: string
  period_year: number
  period_month: number
  status: 'open' | 'closed'
  wac_calculated_at: string | null
  closed_at: string | null
  created_at: string
}

export interface PeriodLog {
  id: string
  period_year: number
  period_month: number
  action: 'calculate' | 'close' | 'open'
  performed_at: string
  notes: string | null
}

export function useAccountingPeriods() {
  return useQuery<AccountingPeriod[]>({
    queryKey: ['accounting_periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false })
      if (error) throw error
      return data as AccountingPeriod[]
    },
  })
}

export function usePeriodLog() {
  return useQuery<PeriodLog[]>({
    queryKey: ['accounting_period_log'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_period_log')
        .select('*')
        .order('performed_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data as PeriodLog[]
    },
  })
}

// ── احتساب WAC لشهر محدد ─────────────────────────────────────────────────────
export function useCalculatePeriodWAC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const from = `${year}-${String(month).padStart(2, '0')}-01`
      const to   = new Date(year, month, 0).toISOString().split('T')[0]

      const prevYear  = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1

      // جلب كل البيانات دفعة واحدة
      const [
        { data: prevClose },
        { data: openingInv },
        { data: purchases },
        { data: salesData },
        { data: wasteData },
      ] = await Promise.all([
        supabase.from('inventory_period_close').select('*')
          .eq('period_year', prevYear).eq('period_month', prevMonth),
        supabase.from('inventory_daily')
          .select('product_id, date, opening_stock_kg, opening_cost_per_kg, weighted_avg_cost')
          .lte('date', from).order('date', { ascending: false }),
        supabase.from('purchases')
          .select('product_id, total_weight, total_cost, cartons_qty, weight_per_carton, price_per_carton')
          .gte('date', from).lte('date', to),
        supabase.from('sales')
          .select('id, product_id, qty_kg')
          .gte('date', from).lte('date', to),
        supabase.from('waste_log')
          .select('product_id, waste_kg')
          .gte('date', from).lte('date', to),
      ])

      // بناء خريطة الأرصدة الافتتاحية
      // الأولوية: رصيد إغلاق الشهر السابق → ثم inventory_daily المُدخل يدوياً
      const openingMap = new Map<string, { qty: number; wac: number }>()

      if ((prevClose?.length ?? 0) > 0) {
        for (const pc of prevClose!) {
          openingMap.set(pc.product_id, { qty: pc.closing_qty, wac: pc.closing_wac })
        }
      } else {
        // أول فترة — نستخدم آخر سجل inventory_daily قبل الفترة لكل منتج
        const seen = new Set<string>()
        for (const inv of openingInv ?? []) {
          if (!seen.has(inv.product_id)) {
            seen.add(inv.product_id)
            const cost = (inv.opening_cost_per_kg ?? 0) > 0
              ? inv.opening_cost_per_kg
              : (inv.weighted_avg_cost ?? 0)
            openingMap.set(inv.product_id, { qty: inv.opening_stock_kg, wac: cost })
          }
        }
      }

      // تجميع المنتجات النشطة هذا الشهر
      const allPids = new Set([
        ...Array.from(openingMap.keys()),
        ...(purchases ?? []).map(p => p.product_id),
        ...(salesData ?? []).map(s => s.product_id),
        ...(wasteData ?? []).map(w => w.product_id),
      ])

      const periodCloseRows: {
        product_id: string; period_year: number; period_month: number
        closing_qty: number; closing_value: number; closing_wac: number
      }[] = []

      const salesUpdates: { id: string; wac: number }[] = []

      for (const pid of allPids) {
        const opening = openingMap.get(pid) ?? { qty: 0, wac: 0 }

        const purchasedWeight = (purchases ?? [])
          .filter(p => p.product_id === pid)
          .reduce((s, p) => s + (p.total_weight ?? p.cartons_qty * p.weight_per_carton), 0)
        const purchasedValue = (purchases ?? [])
          .filter(p => p.product_id === pid)
          .reduce((s, p) => s + (p.total_cost  ?? p.cartons_qty * p.price_per_carton), 0)
        const salesQty = (salesData ?? [])
          .filter(s => s.product_id === pid)
          .reduce((s, r) => s + r.qty_kg, 0)
        const wasteQty = (wasteData ?? [])
          .filter(w => w.product_id === pid)
          .reduce((s, w) => s + w.waste_kg, 0)

        // تخطي المنتجات التي لا يوجد لها أي نشاط
        if (opening.qty === 0 && purchasedWeight === 0 && salesQty === 0 && wasteQty === 0) continue

        const openingValue  = opening.qty * opening.wac
        const totalValue    = openingValue + purchasedValue
        const availableQty  = opening.qty + purchasedWeight - wasteQty
        const wac = availableQty > 0
          ? totalValue / availableQty
          : opening.wac > 0 ? opening.wac : purchasedValue / Math.max(purchasedWeight, 0.001)
        const closingQty   = Math.max(0, opening.qty + purchasedWeight - salesQty - wasteQty)
        const closingValue = closingQty * wac

        periodCloseRows.push({ product_id: pid, period_year: year, period_month: month, closing_qty: closingQty, closing_value: closingValue, closing_wac: wac })

        // تحديث purchase_price_per_kg في المبيعات بـ WAC الشهر
        for (const s of (salesData ?? []).filter(s => s.product_id === pid)) {
          salesUpdates.push({ id: s.id, wac })
        }
      }

      // حفظ أرصدة الإغلاق
      if (periodCloseRows.length > 0) {
        const { error } = await supabase
          .from('inventory_period_close')
          .upsert(periodCloseRows, { onConflict: 'product_id,period_year,period_month' })
        if (error) throw error
      }

      // تحديث المبيعات على دفعات متوازية
      const BATCH = 20
      for (let i = 0; i < salesUpdates.length; i += BATCH) {
        await Promise.all(
          salesUpdates.slice(i, i + BATCH).map(u =>
            supabase.from('sales').update({ purchase_price_per_kg: u.wac }).eq('id', u.id)
          )
        )
      }

      // تحديث حالة الفترة
      await supabase.from('accounting_periods').upsert(
        { period_year: year, period_month: month, status: 'open', wac_calculated_at: new Date().toISOString() },
        { onConflict: 'period_year,period_month' }
      )

      // تسجيل الحدث
      await supabase.from('accounting_period_log').insert({
        period_year: year, period_month: month, action: 'calculate',
        notes: `تم احتساب WAC لـ ${periodCloseRows.length} صنف، وتحديث ${salesUpdates.length} فاتورة بيع`,
      })

      return { products: periodCloseRows.length, sales: salesUpdates.length }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting_periods'] })
      qc.invalidateQueries({ queryKey: ['accounting_period_log'] })
      qc.invalidateQueries({ queryKey: ['sales'] })
    },
  })
}

// ── إغلاق فترة ───────────────────────────────────────────────────────────────
export function useClosePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month, periods }: { year: number; month: number; periods: AccountingPeriod[] }) => {
      // التحقق: الشهر السابق يجب أن يكون مغلقاً (أو هذه أول فترة)
      const prevYear  = month === 1 ? year - 1 : year
      const prevMonth = month === 1 ? 12 : month - 1
      const prevPeriod = periods.find(p => p.period_year === prevYear && p.period_month === prevMonth)
      if (prevPeriod && prevPeriod.status === 'open') {
        throw new Error(`يجب إغلاق ${MONTH_NAMES[prevMonth - 1]} ${prevYear} أولاً`)
      }

      // التحقق: WAC محتسب
      const { data: closeData } = await supabase
        .from('inventory_period_close')
        .select('id').eq('period_year', year).eq('period_month', month).limit(1)
      if (!closeData?.length) {
        throw new Error('يجب احتساب WAC أولاً قبل الإغلاق')
      }

      await supabase.from('accounting_periods').upsert(
        { period_year: year, period_month: month, status: 'closed', closed_at: new Date().toISOString() },
        { onConflict: 'period_year,period_month' }
      )

      await supabase.from('accounting_period_log').insert({
        period_year: year, period_month: month, action: 'close', notes: null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting_periods'] })
      qc.invalidateQueries({ queryKey: ['accounting_period_log'] })
    },
  })
}

// ── فتح فترة ─────────────────────────────────────────────────────────────────
export function useOpenPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ year, month, periods }: { year: number; month: number; periods: AccountingPeriod[] }) => {
      // التحقق: الشهر التالي يجب أن يكون مفتوحاً
      const nextYear  = month === 12 ? year + 1 : year
      const nextMonth = month === 12 ? 1 : month + 1
      const nextPeriod = periods.find(p => p.period_year === nextYear && p.period_month === nextMonth)
      if (nextPeriod && nextPeriod.status === 'closed') {
        throw new Error(`يجب فتح ${MONTH_NAMES[nextMonth - 1]} ${nextYear} أولاً`)
      }

      await supabase.from('accounting_periods').upsert(
        { period_year: year, period_month: month, status: 'open', closed_at: null },
        { onConflict: 'period_year,period_month' }
      )

      // حذف رصيد الإغلاق لإعادة الاحتساب لاحقاً
      await supabase.from('inventory_period_close')
        .delete().eq('period_year', year).eq('period_month', month)

      await supabase.from('accounting_period_log').insert({
        period_year: year, period_month: month, action: 'open', notes: null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting_periods'] })
      qc.invalidateQueries({ queryKey: ['accounting_period_log'] })
    },
  })
}

export const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const ACTION_LABELS: Record<PeriodLog['action'], string> = {
  calculate: 'احتساب WAC',
  close:     'إغلاق الفترة',
  open:      'فتح الفترة',
}
export { ACTION_LABELS }
