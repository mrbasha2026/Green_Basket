import type { SaleRecord, PurchaseRecord } from '@/types'

export const SYSTEM_SHEETS = [
  'إدارة المخزون',
  'تقرير مبيعات',
  'اجمالي الربح',
  'المشتريات',
  'اجمالي المشتريات',
  'اجمالي المشتريات ',
  'بيانات الموظف',
  'Sheet2',
  'new ',
  'Copy of new ',
]

export function parseCustomerSheet(rows: unknown[][]): SaleRecord[] {
  const COLS_PER_DAY = 5
  const DATE_START_COL = 2
  const records: SaleRecord[] = []

  if (!rows || rows.length < 2) return records

  const dates: { col: number; date: Date }[] = []
  for (let col = DATE_START_COL; col < (rows[0] as unknown[]).length; col += COLS_PER_DAY) {
    const val = rows[0][col]
    if (val instanceof Date) {
      dates.push({ col, date: val })
    } else if (typeof val === 'string' && val.trim()) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) dates.push({ col, date: d })
    }
  }

  for (let row = 2; row < rows.length; row++) {
    const productName = String(rows[row][0] ?? '').trim()
    if (!productName) continue

    for (const { col, date } of dates) {
      const qty = parseFloat(String(rows[row][col] ?? 0)) || 0
      const buyPrice = parseFloat(String(rows[row][col + 1] ?? 0)) || 0
      const sellPrice = parseFloat(String(rows[row][col + 3] ?? 0)) || 0
      const total = parseFloat(String(rows[row][col + 4] ?? 0)) || 0

      if (qty > 0) {
        records.push({ date, productName, qty, buyPrice, sellPrice, total })
      }
    }
  }

  return records
}

export function parsePurchasesSheet(rows: unknown[][]): PurchaseRecord[] {
  const COLS_PER_DAY = 7
  const DATE_START_COL = 1
  const records: PurchaseRecord[] = []

  if (!rows || rows.length < 2) return records

  const dates: { col: number; date: Date }[] = []
  for (let col = DATE_START_COL; col < (rows[0] as unknown[]).length; col += COLS_PER_DAY) {
    const val = rows[0][col]
    if (val instanceof Date) {
      dates.push({ col, date: val })
    } else if (typeof val === 'string' && val.trim()) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) dates.push({ col, date: d })
    }
  }

  for (let row = 2; row < rows.length; row++) {
    const productName = String(rows[row][0] ?? '').trim()
    if (!productName) continue

    for (const { col, date } of dates) {
      const cartons = parseFloat(String(rows[row][col] ?? 0)) || 0
      const price = parseFloat(String(rows[row][col + 1] ?? 0)) || 0
      const weight = parseFloat(String(rows[row][col + 3] ?? 0)) || 0
      const waste = parseFloat(String(rows[row][col + 6] ?? 0)) || 0

      if (cartons > 0) {
        records.push({ date, productName, cartons, price, weight, waste })
      }
    }
  }

  return records
}
