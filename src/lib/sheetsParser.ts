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

// يحوّل القيم العربية (٫ للعشري، ٬ أو , للآلاف) إلى أرقام صحيحة
function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0
  const s = String(val)
    .replace(/٬|،/g, '')    // فاصل الآلاف العربي
    .replace(/,/g, '')       // فاصل الآلاف الإنجليزي
    .replace(/٫/g, '.')     // الفاصل العشري العربي → إنجليزي
    .replace(/[^\d.\-]/g, '') // أبقِ الأرقام والنقطة والناقص فقط
  return parseFloat(s) || 0
}

// يحوّل تاريخ النص إلى Date بتوقيت UTC لتجنب فارق المنطقة الزمنية
function parseDateStr(val: unknown): Date | null {
  if (!val) return null
  if (val instanceof Date) {
    return new Date(Date.UTC(val.getFullYear(), val.getMonth(), val.getDate()))
  }
  const s = String(val).trim()

  // تنسيق YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]))

  // تنسيق MM/DD/YYYY أو DD/MM/YYYY — نحاول كليهما
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, a, b, y] = slash
    // إذا كان الجزء الأول > 12 فهو يوم بالتأكيد (DD/MM/YYYY)
    if (+a > 12) return new Date(Date.UTC(+y, +b - 1, +a))
    // وإذا كان الثاني > 12 فهو يوم (MM/DD/YYYY)
    if (+b > 12) return new Date(Date.UTC(+y, +a - 1, +b))
    // كلاهما ≤ 12: نفترض DD/MM/YYYY (الأكثر شيوعاً في السعودية)
    return new Date(Date.UTC(+y, +b - 1, +a))
  }

  // تنسيق DD-MM-YYYY
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return new Date(Date.UTC(+dash[3], +dash[2] - 1, +dash[1]))

  return null
}

export function parseCustomerSheet(rows: unknown[][]): SaleRecord[] {
  const DATE_START_COL = 2
  const records: SaleRecord[] = []

  if (!rows || rows.length < 2) return records

  // فحص كل الأعمدة بدلاً من القفز بخطوات ثابتة — يتعامل مع أعمدة إضافية
  const dates: { col: number; date: Date }[] = []
  for (let col = DATE_START_COL; col < (rows[0] as unknown[]).length; col++) {
    const d = parseDateStr(rows[0][col])
    if (d) dates.push({ col, date: d })
  }

  for (let row = 2; row < rows.length; row++) {
    const productName = String(rows[row][0] ?? '').trim()
    if (!productName) continue
    // تخطي صفوف الفواصل (تحتوي على تاريخ في العمود الأول)
    if (/^\d{1,4}[\/-]\d{1,2}([\/-]\d{1,4})?$/.test(productName)) continue

    for (const { col, date } of dates) {
      const qty       = parseNum(rows[row][col])
      const buyPrice  = parseNum(rows[row][col + 1])
      // col+2 = اجمالي الشراء (مُهمَل)
      const sellPrice = parseNum(rows[row][col + 3])  // سعر البيع
      const total     = parseNum(rows[row][col + 4])  // الإجمالي

      if (qty > 0) {
        records.push({ date, productName, qty, buyPrice, sellPrice, total })
      }
    }
  }

  return records
}

export function parsePurchasesSheet(rows: unknown[][]): PurchaseRecord[] {
  const DATE_START_COL = 1
  const records: PurchaseRecord[] = []

  if (!rows || rows.length < 2) return records

  // فحص كل الأعمدة بدلاً من القفز بخطوات ثابتة
  const dates: { col: number; date: Date }[] = []
  for (let col = DATE_START_COL; col < (rows[0] as unknown[]).length; col++) {
    const d = parseDateStr(rows[0][col])
    if (d) dates.push({ col, date: d })
  }

  for (let row = 2; row < rows.length; row++) {
    const productName = String(rows[row][0] ?? '').trim()
    if (!productName) continue
    if (/^\d{1,4}[\/-]\d{1,2}([\/-]\d{1,4})?$/.test(productName)) continue

    for (const { col, date } of dates) {
      const cartons = parseNum(rows[row][col])
      const price   = parseNum(rows[row][col + 1])
      // col+2 = اجمالي السعر (مُهمَل)
      const weight  = parseNum(rows[row][col + 3])  // الوزن
      // col+4 = اجمالي الأوزان، col+5 = تكلفة الكيلو (مُهمَلان)
      const waste   = parseNum(rows[row][col + 6])  // وزن التالف

      if (cartons > 0 || waste > 0) {
        records.push({ date, productName, cartons, price, weight, waste })
      }
    }
  }

  return records
}
