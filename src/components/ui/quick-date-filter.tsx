import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { todayISO } from '@/lib/utils'

interface QuickDateFilterProps {
  from: string
  to: string
  onFromChange: (v: string) => void
  onToChange: (v: string) => void
  className?: string
}

function getWeekStart() {
  const d = new Date(todayISO() + 'T12:00:00')
  const day = d.getDay() // 0=Sun
  d.setDate(d.getDate() - day)
  return d.toISOString().split('T')[0]
}
function getMonthStart() {
  const d = new Date(todayISO() + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
function getLastMonthRange(): [string, string] {
  const d = new Date(todayISO() + 'T12:00:00')
  const year = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
  const month = d.getMonth() === 0 ? 12 : d.getMonth()
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const to = new Date(year, month, 0).toISOString().split('T')[0]
  return [from, to]
}

const PRESETS = [
  { label: 'اليوم', action: () => { const t = todayISO(); return [t, t] as [string, string] } },
  { label: 'هذا الأسبوع', action: () => [getWeekStart(), todayISO()] as [string, string] },
  { label: 'هذا الشهر', action: () => [getMonthStart(), todayISO()] as [string, string] },
  { label: 'الشهر الماضي', action: getLastMonthRange },
]

export function QuickDateFilter({ from, to, onFromChange, onToChange, className }: QuickDateFilterProps) {
  const today = todayISO()
  const isPreset = (f: string, t: string) => from === f && to === t

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {PRESETS.map(p => {
        const [pFrom, pTo] = p.action()
        return (
          <Button
            key={p.label}
            size="sm"
            variant={isPreset(pFrom, pTo) ? 'default' : 'outline'}
            className="h-8 text-xs"
            onClick={() => { onFromChange(pFrom); onToChange(pTo) }}
          >
            {p.label}
          </Button>
        )
      })}
      <div className="flex items-center gap-1">
        <Label className="text-xs shrink-0 text-muted-foreground">من</Label>
        <Input type="date" value={from} onChange={e => onFromChange(e.target.value)} max={today} className="text-xs h-8 w-36" dir="ltr" />
      </div>
      <div className="flex items-center gap-1">
        <Label className="text-xs shrink-0 text-muted-foreground">إلى</Label>
        <Input type="date" value={to} onChange={e => onToChange(e.target.value)} max={today} className="text-xs h-8 w-36" dir="ltr" />
      </div>
    </div>
  )
}
