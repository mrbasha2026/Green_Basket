import * as React from "react"
import { CheckIcon, ChevronDownIcon, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface ComboboxOption {
  value: string
  label: string
  sub?: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onValueChange: (v: string) => void
  placeholder?: string
  searchPlaceholder?: string
  className?: string
  disabled?: boolean
}

export function Combobox({
  options, value, onValueChange,
  placeholder = "اختر...",
  searchPlaceholder = "بحث...",
  className,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const ref = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [rect, setRect] = React.useState<{ bottom: number; left: number; width: number; openAbove: boolean } | null>(null)

  const selected = options.find(o => o.value === value)
  const filtered = options.filter(o =>
    !search || o.label.toLowerCase().includes(search.toLowerCase()) || (o.sub ?? '').toLowerCase().includes(search.toLowerCase())
  )

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  React.useLayoutEffect(() => {
    if (open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - r.bottom
      setRect({
        bottom: r.bottom, left: r.left, width: r.width,
        openAbove: spaceBelow < 280 && r.top > 200,
      })
      setTimeout(() => inputRef.current?.focus(), 30)
    } else {
      setRect(null)
      setSearch("")
    }
  }, [open])

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border border-input",
          "bg-background px-3 h-9 text-sm transition-colors outline-none select-none",
          "hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground"
        )}
      >
        <span className="flex-1 truncate text-right">{selected?.label ?? placeholder}</span>
        <ChevronDownIcon className={cn("size-4 text-muted-foreground shrink-0 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open && (
        <div
          className="z-[9999] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg overflow-hidden"
          style={rect ? (rect.openAbove ? {
            position: 'fixed',
            bottom: window.innerHeight - rect.bottom + (rect.bottom - rect.bottom) + 4,
            top: 'auto',
            left: rect.left,
            width: rect.width,
          } : {
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
          }) : { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4 }}
        >
          {/* Search input */}
          <div className="p-2 border-b border-border flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground text-right"
              dir="rtl"
            />
          </div>

          {/* Options list */}
          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-4">لا توجد نتائج</p>
            ) : filtered.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onValueChange(opt.value); setOpen(false) }}
                className={cn(
                  "relative flex w-full items-center rounded-md px-2 py-1.5 text-sm text-right",
                  "hover:bg-accent hover:text-accent-foreground transition-colors",
                  opt.value === value && "bg-primary/10 text-primary font-medium"
                )}
              >
                {opt.value === value && <CheckIcon className="absolute left-2 size-3.5 text-primary" />}
                <span className={cn("flex-1", opt.value === value && "pl-5")}>
                  {opt.label}
                  {opt.sub && <span className="text-xs text-muted-foreground mr-1">({opt.sub})</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
