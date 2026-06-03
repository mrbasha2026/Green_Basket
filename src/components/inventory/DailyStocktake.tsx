import { useState, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useProducts } from '@/hooks/useProducts'
import { useInventoryUpTo } from '@/hooks/useInventory'
import { useLatestPurchaseCosts } from '@/hooks/usePurchases'
import { useSalesByRange } from '@/hooks/useSales'
import { useWasteByRange } from '@/hooks/useWaste'
import { formatNumber, todayISO } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ClipboardCheck, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

const STORAGE_KEY = 'gb_daily_stocktake'
const DAILY_COUNT_KEY = 'gb_daily_stocktake_count'

function getDailyCount(): number {
  const saved = localStorage.getItem(DAILY_COUNT_KEY)
  return saved ? Math.max(1, Math.min(20, parseInt(saved, 10) || 5)) : 5
}

interface DailyStocktakeState {
  date: string
  selectedIds: string[]
  entries: Record<string, string>
  completed: boolean
}

function loadState(): DailyStocktakeState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch { return null }
}

function saveState(state: DailyStocktakeState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

function selectDailyItems(
  products: { id: string; name_ar: string; category: string }[],
  balances: Record<string, number>,
  latestCosts: Record<string, number>,
  salesMap: Record<string, number>,
  wasteMap: Record<string, number>,
  count: number,
  seed: number
): string[] {
  // Score each product: higher = more important to count
  const scored = products
    .filter(p => (balances[p.id] ?? 0) > 0)
    .map(p => {
      const balance = balances[p.id] ?? 0
      const cost = latestCosts[p.id] ?? 0
      const stockValue = balance * cost
      const salesQty = salesMap[p.id] ?? 0
      const wasteQty = wasteMap[p.id] ?? 0
      const score = stockValue * 0.5 + salesQty * 2 + wasteQty * 3
      return { id: p.id, score }
    })
    .sort((a, b) => b.score - a.score)

  if (scored.length === 0) return []

  // Take top 60% by score + 40% random from rest
  const topCount = Math.ceil(count * 0.6)
  const topItems = scored.slice(0, Math.min(topCount, scored.length)).map(s => s.id)
  const restItems = scored.slice(topCount).map(s => s.id)

  // Pseudo-random selection from rest using seed
  const selected = [...topItems]
  let rng = seed
  while (selected.length < count && restItems.length > 0) {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff
    const idx = Math.abs(rng) % restItems.length
    selected.push(...restItems.splice(idx, 1))
  }

  return selected.slice(0, count)
}

// ── Compact banner for Dashboard ──────────────────────────────────────────────
export function DailyStocktakeBanner({ onNavigate }: { onNavigate?: () => void }) {
  const today = todayISO()
  const state = loadState()
  const isDoneToday = state?.date === today && state.completed

  if (isDoneToday) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-success/10 border border-success/30">
        <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
        <p className="text-sm font-medium text-success">تم إتمام الجرد اليومي ✓</p>
      </div>
    )
  }

  const pending = state?.date === today ? (state.selectedIds.length - Object.keys(state.entries).filter(k => state.entries[k] !== '').length) : null

  return (
    <button
      onClick={onNavigate}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-warning/10 border border-warning/30 hover:bg-warning/15 transition-colors text-right"
    >
      <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-warning">
          جرد يومي مطلوب
          {pending !== null && ` — تبقّى ${pending} صنف`}
        </p>
        <p className="text-xs text-muted-foreground">اضغط لفتح الجرد في المخزون</p>
      </div>
      <Badge variant="outline" className="text-xs text-warning border-warning/40 shrink-0">إلزامي</Badge>
    </button>
  )
}

// ── Full daily stocktake section (inside Inventory page) ──────────────────────
export function DailyStocktakeSection() {
  const today = todayISO()
  const { data: products } = useProducts()
  const { data: balanceData } = useInventoryUpTo(today)
  const { data: latestCosts } = useLatestPurchaseCosts()

  const thirtyAgo = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() - 30)
    return d.toISOString().split('T')[0]
  }, [today])

  const { data: salesData } = useSalesByRange(thirtyAgo, today)
  const { data: wasteData } = useWasteByRange(thirtyAgo, today)

  const balances = useMemo(() => {
    const m: Record<string, number> = {}
    balanceData?.forEach(b => { m[b.product_id] = b.closing_stock_kg })
    return m
  }, [balanceData])

  const salesMap = useMemo(() => {
    const m: Record<string, number> = {}
    salesData?.forEach(s => { m[s.product_id] = (m[s.product_id] ?? 0) + s.qty_kg })
    return m
  }, [salesData])

  const wasteMap = useMemo(() => {
    const m: Record<string, number> = {}
    wasteData?.forEach(w => { m[w.product_id] = (m[w.product_id] ?? 0) + w.waste_kg })
    return m
  }, [wasteData])

  // Load or initialize today's state
  const [state, setState] = useState<DailyStocktakeState>(() => {
    const saved = loadState()
    if (saved?.date === today) return saved
    return { date: today, selectedIds: [], entries: {}, completed: false }
  })

  const selectedProducts = useMemo(
    () => (products ?? []).filter(p => state.selectedIds.includes(p.id)),
    [products, state.selectedIds]
  )

  const initializeToday = useCallback(() => {
    if (!products || products.length === 0) return
    const seed = parseInt(today.replace(/-/g, ''), 10)
    const ids = selectDailyItems(
      products,
      balances,
      latestCosts ?? {},
      salesMap,
      wasteMap,
      getDailyCount(),
      seed
    )
    const newState: DailyStocktakeState = { date: today, selectedIds: ids, entries: {}, completed: false }
    saveState(newState)
    setState(newState)
  }, [products, balances, latestCosts, salesMap, wasteMap, today])

  function setEntry(pid: string, val: string) {
    const newEntries = { ...state.entries, [pid]: val }
    const updated = { ...state, entries: newEntries }
    saveState(updated)
    setState(updated)
  }

  function handleComplete() {
    const missing = state.selectedIds.filter(id => !state.entries[id] || state.entries[id] === '')
    if (missing.length > 0) {
      toast.error(`يجب إدخال الكمية لجميع الأصناف — تبقّى ${missing.length} صنف`)
      return
    }
    const updated = { ...state, completed: true }
    saveState(updated)
    setState(updated)
    toast.success('تم إتمام الجرد اليومي بنجاح')
  }

  const enteredCount = state.selectedIds.filter(id => state.entries[id] && state.entries[id] !== '').length
  const totalCount = state.selectedIds.length

  // ── No items selected yet ────────────────────────────────────────────────
  if (state.selectedIds.length === 0) {
    return (
      <div className="p-8 text-center space-y-4">
        <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground opacity-40" />
        <div>
          <p className="font-semibold text-base">الجرد اليومي العشوائي</p>
          <p className="text-sm text-muted-foreground mt-1">
            يختار النظام {getDailyCount()} أصناف يومياً بناءً على قيمة المخزون والنشاط ونسبة الهدر
          </p>
        </div>
        <Button onClick={initializeToday} className="gap-2">
          <RefreshCw className="w-4 h-4" />توليد أصناف اليوم
        </Button>
      </div>
    )
  }

  // ── Completed ────────────────────────────────────────────────────────────
  if (state.completed) {
    return (
      <div className="p-8 text-center space-y-4">
        <CheckCircle2 className="w-12 h-12 mx-auto text-success" />
        <div>
          <p className="font-semibold text-base text-success">تم إتمام الجرد اليومي</p>
          <p className="text-sm text-muted-foreground mt-1">جرد اليوم مكتمل — سيتجدد غداً تلقائياً</p>
        </div>
        <div className="rounded-xl border border-border overflow-hidden max-w-md mx-auto text-right">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/30 border-b border-border"><th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">الصنف</th><th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">الرصيد الدفتري</th><th className="px-3 py-2.5 text-xs font-semibold text-muted-foreground">الكمية الفعلية</th></tr></thead>
            <tbody>
              {selectedProducts.map(p => (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="px-3 py-2 font-medium">{p.name_ar}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatNumber(balances[p.id] ?? 0)} كج</td>
                  <td className="px-3 py-2 text-success font-semibold">{formatNumber(parseFloat(state.entries[p.id] ?? '0'))} كج</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── Entry form ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-bold text-base flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-warning" />
            الجرد اليومي العشوائي
            <Badge variant="outline" className="text-xs text-warning border-warning/40">إلزامي</Badge>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            أدخل الكمية الفعلية لكل صنف — {enteredCount} / {totalCount} مُدخل
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={initializeToday}>
          <RefreshCw className="w-3.5 h-3.5" />إعادة توليد
        </Button>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', enteredCount === totalCount ? 'bg-success' : 'bg-warning')}
          style={{ width: `${totalCount > 0 ? (enteredCount / totalCount) * 100 : 0}%` }}
        />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/30 border-b border-border">
              {['الصنف', 'الفئة', 'الرصيد الدفتري', 'الكمية الفعلية (كج)', 'الفرق'].map(h => (
                <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedProducts.map(p => {
              const systemQty = balances[p.id] ?? 0
              const entryVal = state.entries[p.id] ?? ''
              const actualQty = entryVal !== '' ? parseFloat(entryVal) : null
              const diff = actualQty !== null ? actualQty - systemQty : null
              const hasEntry = entryVal !== ''

              return (
                <tr key={p.id} className={cn(
                  'border-b border-border/50',
                  !hasEntry ? 'bg-warning/5' : diff !== null && Math.abs(diff) > 2 ? 'bg-danger/5' : 'bg-success/5'
                )}>
                  <td className="px-3 py-2.5 font-medium">{p.name_ar}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className="text-xs">{p.category}</Badge></td>
                  <td className="px-3 py-2.5 text-muted-foreground">{formatNumber(systemQty)}</td>
                  <td className="px-3 py-2.5 w-36">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="أدخل الكمية..."
                      value={entryVal}
                      onChange={e => setEntry(p.id, e.target.value)}
                      className={cn('h-8 text-sm w-32', !hasEntry && 'border-warning/50 focus:border-warning')}
                      dir="ltr"
                      autoFocus={p.id === state.selectedIds[0]}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {diff !== null ? (
                      <span className={cn('font-semibold text-sm', diff === 0 ? 'text-success' : diff > 0 ? 'text-success' : 'text-danger')}>
                        {diff >= 0 ? '+' : ''}{formatNumber(diff)}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleComplete}
          disabled={enteredCount < totalCount}
          className={cn('gap-2', enteredCount === totalCount ? 'bg-success hover:bg-success/90' : '')}
        >
          <CheckCircle2 className="w-4 h-4" />
          {enteredCount < totalCount ? `تبقّى ${totalCount - enteredCount} أصناف` : 'إتمام الجرد اليومي'}
        </Button>
      </div>
    </div>
  )
}
