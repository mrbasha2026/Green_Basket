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

// تحويل الأرقام الهندية/العربية (٠-٩ و ۰-۹) إلى أرقام لاتينية
function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))  // Arabic-Indic
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0))  // Extended Arabic-Indic
}

// يحوّل القيم العربية (٫ للعشري، ٬ أو , للآلاف) إلى أرقام صحيحة
function parseNum(val: unknown): number {
  if (val === null || val === undefined) return 0
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0
  const s = normalizeDigits(String(val))
    .replace(/٬|،/g, '')    // فاصل الآلاف العربي
    .replace(/,/g, '')       // فاصل الآلاف الإنجليزي
    .replace(/٫/g, '.')     // الفاصل العشري العربي → إنجليزي
    .replace(/[^\d.\-]/g, '') // أبقِ الأرقام والنقطة والناقص فقط
  return parseFloat(s) || 0
}

// يحوّل تاريخ النص إلى Date بتوقيت UTC لتجنب فارق المنطقة الزمنية
function parseDateStr(val: unknown): Date | null {
  if (val === null || val === undefined || val === '') return null
  if (val instanceof Date) {
    // Excel يخزن التواريخ أحياناً بـ serial يقع قبل منتصف الليل بساعات (ناتج تحويل timezone أو floating-point)
    // نُضيف 12 ساعة كـ buffer ثم نأخذ تاريخ UTC، مما يضمن قراءة اليوم الصحيح دائماً
    const nudged = new Date(val.getTime() + 43200000) // +12h
    return new Date(Date.UTC(nudged.getUTCFullYear(), nudged.getUTCMonth(), nudged.getUTCDate()))
  }
  // رقم serial من Excel (عدد الأيام منذ 1899-12-30)
  if (typeof val === 'number' && val > 0) {
    // نطاق ضيق: 2020–2035 فقط (serial ≈ 43831–49353) لتجنب تفسير الأرقام العادية كتواريخ
    if (val < 43831 || val > 49353) return null
    const ms = Math.round((val - 25569) * 86400 * 1000)
    const d = new Date(ms)
    const year = d.getUTCFullYear()
    if (year < 2020 || year > 2035) return null
    return new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()))
  }
  const s = normalizeDigits(String(val).trim())

  // تنسيق YYYY-MM-DD
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]))

  // تنسيق MM/DD/YYYY أو DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const [, a, b, y] = slash
    // إذا كان الأول > 12 فهو يوم حتماً (DD/MM/YYYY)
    if (+a > 12) return new Date(Date.UTC(+y, +b - 1, +a))
    // إذا كان الثاني > 12 فهو يوم حتماً (MM/DD/YYYY)
    if (+b > 12) return new Date(Date.UTC(+y, +a - 1, +b))
    // كلاهما ≤ 12: الشيت يستخدم MM/DD/YYYY (تنسيق أمريكي)
    return new Date(Date.UTC(+y, +a - 1, +b))
  }

  // تنسيق DD-MM-YYYY
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) return new Date(Date.UTC(+dash[3], +dash[2] - 1, +dash[1]))

  return null
}

// يبحث عن صف التواريخ (أول صف يحوي تاريخين فأكثر) بدلاً من افتراض الصف 0.
// يُرجع رقم الصف وقائمة الأعمدة التي تحوي تواريخ.
function detectDateRow(
  rows: unknown[][],
  startCol: number,
): { headerRow: number; dates: { col: number; date: Date }[] } {
  // نفحص أول 10 صفوف بحثاً عن أكثر صف يحتوي تواريخ
  const limit = Math.min(rows.length, 10)
  let best = { headerRow: 0, dates: [] as { col: number; date: Date }[] }

  for (let row = 0; row < limit; row++) {
    const r = rows[row] as unknown[]
    if (!r) continue
    const dates: { col: number; date: Date }[] = []
    for (let col = startCol; col < r.length; col++) {
      const d = parseDateStr(r[col])
      if (d) dates.push({ col, date: d })
    }
    if (dates.length > best.dates.length) best = { headerRow: row, dates }
  }
  return best
}

// تخطي الصفوف التي ليست منتجات (فارغة، أو عناوين تاريخ، أو إجماليات)
function isSkippableRow(productName: string): boolean {
  if (!productName) return true
  // صف فاصل يحوي تاريخاً في العمود الأول
  if (/^\d{1,4}[\/-]\d{1,2}([\/-]\d{1,4})?$/.test(productName)) return true
  // صفوف الإجماليات/المجاميع
  if (/^(الإجمالي|الاجمالي|اجمالي|المجموع|الإجماليات|total)/i.test(productName)) return true
  return false
}

export function parseCustomerSheet(rows: unknown[][]): SaleRecord[] {
  const DATE_START_COL = 2
  const records: SaleRecord[] = []

  if (!rows || rows.length < 2) return records

  // اكتشاف صف التواريخ ديناميكياً (لا نفترض الصف 0)
  const { headerRow, dates } = detectDateRow(rows, DATE_START_COL)
  if (dates.length === 0) return records

  // البيانات تبدأ من الصف الذي يلي صف التواريخ
  for (let row = headerRow + 1; row < rows.length; row++) {
    if (!rows[row]) continue
    const productName = String(rows[row][0] ?? '').trim()
    if (isSkippableRow(productName)) continue

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

  // اكتشاف صف التواريخ ديناميكياً (لا نفترض الصف 0)
  const { headerRow, dates } = detectDateRow(rows, DATE_START_COL)
  if (dates.length === 0) return records

  // الـ fallback step لآخر تاريخ — نستخدم 7 (البنية القياسية) بدل اشتقاقه
  // من المسافة بين آخر تاريخين، لأن تلك المسافة قد تعكس عمود زائد في الفترة قبل الأخيرة
  const fallbackStep = 7

  // البيانات تبدأ من الصف الذي يلي صف التواريخ
  for (let row = headerRow + 1; row < rows.length; row++) {
    if (!rows[row]) continue
    const productName = String(rows[row][0] ?? '').trim()
    if (isSkippableRow(productName)) continue

    for (let di = 0; di < dates.length; di++) {
      const { col, date } = dates[di]
      // نحسب الـ step لكل تاريخ على حدا من المسافة للتاريخ التالي
      // هذا يعالج الشيتات التي تغير عدد أعمدتها في منتصفها
      const step        = di + 1 < dates.length ? dates[di + 1].col - col : fallbackStep
      const wasteOffset = step - 1

      const cartons = parseNum(rows[row][col])
      const price   = parseNum(rows[row][col + 1])
      // col+2 = اجمالي السعر (مُهمَل)
      const weight  = parseNum(rows[row][col + 3])
      // col+(step-2) = تكلفة الكيلو (مُهمَل)، col+(step-1) = وزن التالف
      const waste   = parseNum(rows[row][col + wasteOffset])

      if (cartons > 0 || waste > 0) {
        records.push({ date, productName, cartons, price, weight, waste })
      }
    }
  }

  return records
}
