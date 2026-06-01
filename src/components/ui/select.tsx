"use client"

import * as React from "react"
import { ChevronDownIcon, CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

/* ─── Context ─────────────────────────────────────────────────────────── */
interface CtxValue {
  value: string
  onValueChange: (v: string) => void
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  labelMap: React.MutableRefObject<Map<string, string>>
}

const Ctx = React.createContext<CtxValue>({
  value: "", onValueChange: () => {}, open: false, setOpen: () => {},
  labelMap: { current: new Map() },
})

/* ─── Select (Root) ───────────────────────────────────────────────────── */
function Select({
  value = "",
  onValueChange,
  children,
}: {
  value?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const labelMap = React.useRef<Map<string, string>>(new Map())
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <Ctx.Provider value={{ value, onValueChange: onValueChange ?? (() => {}), open, setOpen, labelMap }}>
      <div ref={ref} className="relative w-full">
        {children}
      </div>
    </Ctx.Provider>
  )
}

/* ─── SelectGroup ─────────────────────────────────────────────────────── */
function SelectGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-1", className)}>{children}</div>
}

/* ─── SelectValue ─────────────────────────────────────────────────────── */
function SelectValue({ placeholder, className }: { placeholder?: string; className?: string }) {
  const { value, labelMap } = React.useContext(Ctx)
  const text = value ? (labelMap.current.get(value) ?? "") : ""
  return (
    <span className={cn(
      "flex-1 truncate text-right block leading-normal",
      !text && "text-muted-foreground",
      className,
    )}>
      {text || placeholder || ""}
    </span>
  )
}

/* ─── SelectTrigger ───────────────────────────────────────────────────── */
function SelectTrigger({
  children,
  className,
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "default" }) {
  const { open, setOpen } = React.useContext(Ctx)
  return (
    <button
      type="button"
      role="combobox"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-lg border border-input",
        "bg-background px-3 text-sm transition-colors outline-none select-none",
        "hover:bg-muted/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "dark:bg-slate-800 dark:border-slate-600 dark:hover:bg-slate-700",
        size === "default" ? "h-9" : "h-8",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon className={cn(
        "size-4 text-muted-foreground shrink-0 transition-transform duration-150",
        open && "rotate-180",
      )} />
    </button>
  )
}

/* ─── SelectContent ───────────────────────────────────────────────────── */
function SelectContent({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
  /* unused props for API compatibility */
  side?: string
  sideOffset?: number
  align?: string
  alignOffset?: number
  alignItemWithTrigger?: boolean
}) {
  const { open } = React.useContext(Ctx)
  // Always render (hidden when closed) so items register their labels via useLayoutEffect
  return (
    <div
      className={cn(
        "absolute top-full inset-x-0 mt-1 z-50 max-h-64 overflow-y-auto",
        "rounded-lg border border-border bg-popover text-popover-foreground shadow-lg",
        "dark:bg-slate-800 dark:border-slate-600",
        !open && "hidden",
        className,
      )}
    >
      <div className="p-1">{children}</div>
    </div>
  )
}

/* ─── SelectLabel ─────────────────────────────────────────────────────── */
function SelectLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-2 py-1.5 text-xs font-medium text-muted-foreground", className)}>
      {children}
    </div>
  )
}

/* ─── SelectItem ──────────────────────────────────────────────────────── */
function SelectItem({
  value,
  children,
  className,
  disabled,
}: {
  value: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}) {
  const { value: selected, onValueChange, setOpen, labelMap } = React.useContext(Ctx)
  const isSelected = selected === value

  // Register label text so SelectValue can show it even when dropdown is closed
  React.useLayoutEffect(() => {
    const text =
      typeof children === "string"
        ? children
        : typeof children === "number"
          ? String(children)
          : (children as React.ReactElement)?.props?.children
              ? String((children as React.ReactElement).props.children)
              : ""
    if (text) labelMap.current.set(value, text)
  })

  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      disabled={disabled}
      className={cn(
        "relative flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-sm text-right",
        "outline-none select-none transition-colors",
        "hover:bg-accent hover:text-accent-foreground",
        isSelected && "bg-primary/10 text-primary font-medium",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
      onClick={() => {
        const text =
          typeof children === "string"
            ? children
            : typeof children === "number"
              ? String(children)
              : ""
        if (text) labelMap.current.set(value, text)
        onValueChange(value)
        setOpen(false)
      }}
    >
      {isSelected && (
        <CheckIcon className="absolute left-2 size-3.5 shrink-0 text-primary" />
      )}
      <span className={cn("flex-1", isSelected && "pl-5")}>{children}</span>
    </button>
  )
}

/* ─── SelectSeparator ─────────────────────────────────────────────────── */
function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn("my-1 h-px bg-border -mx-1", className)} />
}

/* ─── Stubs for API compatibility ─────────────────────────────────────── */
const SelectScrollUpButton = () => null
const SelectScrollDownButton = () => null

export {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel,
  SelectScrollDownButton, SelectScrollUpButton, SelectSeparator,
  SelectTrigger, SelectValue,
}
