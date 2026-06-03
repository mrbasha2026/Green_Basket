import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, parseISO } from 'date-fns'
import { toZonedTime } from 'date-fns-tz'
import { ar } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const numFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const intFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function formatNumber(value: number): string {
  return numFormat.format(value)
}

export function formatInt(value: number): string {
  return intFormat.format(value)
}

const RIYADH_TZ = 'Asia/Riyadh'

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const riyadh = toZonedTime(d, RIYADH_TZ)
  return format(riyadh, 'dd/MM/yyyy HH:mm')
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const riyadh = toZonedTime(d, RIYADH_TZ)
  return format(riyadh, 'dd/MM/yyyy')
}

export function formatDateFull(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const riyadh = toZonedTime(d, RIYADH_TZ)
  return format(riyadh, 'eeee dd MMMM yyyy', { locale: ar })
}

export function todayISO(): string {
  const tz = toZonedTime(new Date(), RIYADH_TZ)
  return format(tz, 'yyyy-MM-dd')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TooltipFmt = (...args: any[]) => any

/** ألوان الـ chart موحدة وتعمل في light/dark */
export function getChartStyle() {
  const isDark = document.documentElement.classList.contains('dark')
  return {
    gridStroke: isDark ? '#334155' : '#e2e8f0',
    tickColor: isDark ? '#94a3b8' : '#64748b',
    tooltipStyle: {
      borderRadius: '8px',
      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
      fontSize: '12px',
      background: isDark ? '#1e293b' : '#ffffff',
      color: isDark ? '#f8fafc' : '#0f172a',
    } as React.CSSProperties,
  }
}

export function monthName(month: number): string {
  const names = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
  ]
  return names[month - 1] ?? ''
}
