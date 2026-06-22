import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { parseCustomerSheet, parsePurchasesSheet, SYSTEM_SHEETS } from '../src/lib/sheetsParser'
import { calcCostPerKg } from '../src/lib/calculations'
import type { SaleRecord, PurchaseRecord } from '../src/types'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Google Auth ──────────────────────────────────────────────────────────────

function buildAuth(scopes: string[]) {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n')
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      private_key: privateKey,
    },
    scopes,
  })
}

// ─── قراءة ملف Office (.xlsx) عبر Drive API (raw fetch) ─────────────────────

async function getSheetsFromOfficeFile(fileId: string): Promise<{ name: string; data: unknown[][] }[]> {
  const auth = buildAuth([
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ])

  // نحصل على token مباشرةً ونستخدم fetch بدلاً من SDK
  const client = await auth.getClient()
  const tokenRes = await client.getAccessToken()
  const token = tokenRes.token
  if (!token) throw new Error('فشل الحصول على access token')

  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Drive download ${res.status}: ${body || res.statusText}`)
  }

  const buffer = await res.arrayBuffer()
  // cellDates:true → يُرجع Date objects بدلاً من أرقام serial
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const results: { name: string; data: unknown[][] }[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    if (rows.length > 0) results.push({ name: sheetName.trim(), data: rows as unknown[][] })
  }
  return results
}

// ─── Google Sheets ────────────────────────────────────────────────────────────

async function getSheets(spreadsheetId: string): Promise<{ name: string; data: unknown[][] }[]> {
  const auth = buildAuth(['https://www.googleapis.com/auth/spreadsheets.readonly'])
  const sheets = google.sheets({ version: 'v4', auth })

  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId })
    const sheetNames = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? []

    const results: { name: string; data: unknown[][] }[] = []
    for (const name of sheetNames) {
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: name,
          dateTimeRenderOption: 'FORMATTED_STRING',
        })
        const rows = res.data.values ?? []
        if (rows.length > 0) results.push({ name: name.trim(), data: rows as unknown[][] })
      } catch { /* skip failed sheets */ }
    }
    return results
  } catch (err: unknown) {
    // ملف Office → نتراجع لـ Drive API
    const msg = (err as Error)?.message ?? ''
    if (msg.includes('Office file') || msg.includes('not supported for this document')) {
      console.log('[SYNC] Office file detected — falling back to Drive API')
      return getSheetsFromOfficeFile(spreadsheetId)
    }
    throw err
  }
}

// ─── مطابقة أسماء العملاء (تطبيع عربي + مرونة) ───────────────────────────────

function normalizeArabic(s: string): string {
  return s.trim()
    .replace(/ى/g, 'ي')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
}

function findCustomerId(sheetName: string, sheetMap: Map<string, string>): string | undefined {
  // مستوى 1: تطابق تام
  const trimmed = sheetName.trim()
  if (sheetMap.has(trimmed)) return sheetMap.get(trimmed)
  // مستوى 2: تجاهل المسافات الزائدة
  for (const [k, v] of sheetMap) {
    if (k.trim() === trimmed) return v
  }
  // مستوى 3: تطبيع الأحرف العربية
  const normName = normalizeArabic(trimmed)
  for (const [k, v] of sheetMap) {
    if (normalizeArabic(k) === normName) return v
  }
  return undefined
}

// ─── Cache: تحميل كل البيانات مرة واحدة ──────────────────────────────────────

interface SyncCache {
  aliasMap: Map<string, string>
  sheetMap: Map<string, string>
  // مجموعة الفترات المغلقة بصيغة "YYYY-MM" — لا يتم تحديث بياناتها أثناء المزامنة
  closedPeriods: Set<string>
}

async function buildCache(): Promise<SyncCache> {
  const [aliasRes, productRes, sheetRes, periodsRes] = await Promise.all([
    supabaseAdmin.from('product_aliases').select('alias, product_id').limit(100000),
    supabaseAdmin.from('products').select('id, name_en, name_ar').limit(100000),
    supabaseAdmin.from('customer_sheet_mapping').select('sheet_name, customer_id').limit(100000),
    supabaseAdmin.from('accounting_periods').select('period_year, period_month').eq('status', 'closed').limit(1000),
  ])

  const aliasMap = new Map<string, string>()
  for (const row of aliasRes.data ?? []) {
    aliasMap.set(row.alias.toUpperCase().trim(), row.product_id)
  }
  for (const row of productRes.data ?? []) {
    if (row.name_en) aliasMap.set(row.name_en.toUpperCase().trim(), row.id)
    if (row.name_ar) aliasMap.set(row.name_ar.trim(), row.id)
  }

  const sheetMap = new Map<string, string>()
  for (const row of sheetRes.data ?? []) {
    sheetMap.set(row.sheet_name, row.customer_id)
  }

  const closedPeriods = new Set<string>()
  for (const p of periodsRes.data ?? []) {
    closedPeriods.add(`${p.period_year}-${String(p.period_month).padStart(2, '0')}`)
  }

  return { aliasMap, sheetMap, closedPeriods }
}

function inClosedPeriod(date: string, closedPeriods: Set<string>): boolean {
  return closedPeriods.has(date.substring(0, 7))
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function importSales(
  records: SaleRecord[],
  customerId: string,
  cache: SyncCache,
  unmatched: Set<string>
): Promise<number> {
  // دمج السجلات المكررة (نفس product_id + date) في صف واحد:
  // اجمع qty، وخذ متوسط الأسعار مرجّحاً بالكمية لتجنّب فقدان البيانات عبر قيد التفرّد
  interface Agg {
    product_id: string
    date: string
    qty: number
    buyWeighted: number
    sellWeighted: number
  }
  const merged = new Map<string, Agg>()
  for (const r of records) {
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) { unmatched.add(r.productName.trim()); continue }
    const date = r.date.toISOString().split('T')[0]
    if (inClosedPeriod(date, cache.closedPeriods)) continue
    const key = `${productId}__${date}`
    const a = merged.get(key) ?? { product_id: productId, date, qty: 0, buyWeighted: 0, sellWeighted: 0 }
    a.qty += r.qty
    a.buyWeighted += r.buyPrice * r.qty
    a.sellWeighted += r.sellPrice * r.qty
    merged.set(key, a)
  }

  const rows = [...merged.values()].map(a => ({
    product_id: a.product_id,
    customer_id: customerId,
    date: a.date,
    qty_kg: a.qty,
    purchase_price_per_kg: a.qty > 0 ? a.buyWeighted / a.qty : 0,
    price_per_kg: a.qty > 0 ? a.sellWeighted / a.qty : 0,
    source: 'google_sheet',
  }))

  // احذف السجلات القديمة لهذا العميل في نطاق التواريخ المُعالج ثم أعد الإدراج
  // هذا يضمن إزالة أي بيانات خاطئة استوردتها مزامنة سابقة
  const openDatesArr = records
    .map(r => r.date.toISOString().split('T')[0])
    .filter(d => !inClosedPeriod(d, cache.closedPeriods))

  if (openDatesArr.length > 0) {
    const minDate = openDatesArr.reduce((a, b) => a < b ? a : b)
    const maxDate = openDatesArr.reduce((a, b) => a > b ? a : b)

    // احفظ الصفوف الحالية قبل الحذف لاستعادتها عند الفشل
    const { data: backup } = await supabaseAdmin.from('sales')
      .select('*')
      .eq('source', 'google_sheet')
      .eq('customer_id', customerId)
      .gte('date', minDate)
      .lte('date', maxDate)

    await supabaseAdmin.from('sales')
      .delete()
      .eq('source', 'google_sheet')
      .eq('customer_id', customerId)
      .gte('date', minDate)
      .lte('date', maxDate)

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('sales').insert(rows)
      if (error) {
        // استرجاع البيانات المحذوفة عند الفشل
        if (backup?.length) await supabaseAdmin.from('sales').insert(backup)
        throw new Error(`فشل إدراج المبيعات: ${error.message}`)
      }
    }
  } else if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('sales').insert(rows)
    if (error) throw new Error(`فشل إدراج المبيعات: ${error.message}`)
  }

  return rows.length
}

async function importPurchases(
  records: PurchaseRecord[],
  cache: SyncCache,
  unmatched: Set<string>
): Promise<number> {
  // دمج السجلات المكررة (نفس product_id + date) في صف واحد:
  // اجمع cartons وwaste، وخذ السعر/الوزن لكل كرتونة مرجّحاً بعدد الكراتين
  interface Agg {
    product_id: string
    date: string
    cartons: number
    waste: number
    priceWeighted: number
    weightWeighted: number
  }
  const merged = new Map<string, Agg>()
  for (const r of records) {
    if (r.cartons <= 0) continue
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) { unmatched.add(r.productName.trim()); continue }
    const date = r.date.toISOString().split('T')[0]
    if (inClosedPeriod(date, cache.closedPeriods)) continue
    const key = `${productId}__${date}`
    const a = merged.get(key) ?? { product_id: productId, date, cartons: 0, waste: 0, priceWeighted: 0, weightWeighted: 0 }
    a.cartons += r.cartons
    a.waste += r.waste
    a.priceWeighted += r.price * r.cartons
    a.weightWeighted += r.weight * r.cartons
    merged.set(key, a)
  }

  const rows = [...merged.values()].map(a => {
    const pricePerCarton = a.cartons > 0 ? a.priceWeighted / a.cartons : 0
    const weightPerCarton = a.cartons > 0 ? a.weightWeighted / a.cartons : 0
    return {
      product_id: a.product_id,
      date: a.date,
      cartons_qty: a.cartons,
      price_per_carton: pricePerCarton,
      weight_per_carton: weightPerCarton,
      waste_kg: a.waste,
      cost_per_kg: calcCostPerKg(a.priceWeighted, a.weightWeighted, a.waste),
      source: 'google_sheet',
    }
  })

  // احذف المشتريات القديمة في نطاق التواريخ المُعالج ثم أعد الإدراج
  // نُقيّد الحذف بـ product_id لتجنب مسح بيانات منتجات غير موجودة في الدفعة الحالية
  const productIds = [...new Set(rows.map(r => r.product_id))]
  const openPurchaseDates = records
    .filter(r => r.cartons > 0)
    .map(r => r.date.toISOString().split('T')[0])
    .filter(d => !inClosedPeriod(d, cache.closedPeriods))

  if (openPurchaseDates.length > 0 && productIds.length > 0) {
    const minDate = openPurchaseDates.reduce((a, b) => a < b ? a : b)
    const maxDate = openPurchaseDates.reduce((a, b) => a > b ? a : b)

    const { data: backup } = await supabaseAdmin.from('purchases')
      .select('*')
      .eq('source', 'google_sheet')
      .in('product_id', productIds)
      .gte('date', minDate)
      .lte('date', maxDate)

    await supabaseAdmin.from('purchases')
      .delete()
      .eq('source', 'google_sheet')
      .in('product_id', productIds)
      .gte('date', minDate)
      .lte('date', maxDate)

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from('purchases').insert(rows)
      if (error) {
        if (backup?.length) await supabaseAdmin.from('purchases').insert(backup)
        throw new Error(`فشل إدراج المشتريات: ${error.message}`)
      }
    }
  } else if (rows.length > 0) {
    const { error } = await supabaseAdmin.from('purchases').insert(rows)
    if (error) throw new Error(`فشل إدراج المشتريات: ${error.message}`)
  }

  return rows.length
}

async function importWaste(
  records: PurchaseRecord[],
  cache: SyncCache,
  unmatched: Set<string>
): Promise<number> {
  // دمج الهدر المكرر (نفس product_id + date) في صف واحد
  const merged = new Map<string, { product_id: string; date: string; waste: number }>()
  for (const r of records) {
    if (r.waste <= 0) continue
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) { unmatched.add(r.productName.trim()); continue }
    const date = r.date.toISOString().split('T')[0]
    if (inClosedPeriod(date, cache.closedPeriods)) continue
    const key = `${productId}__${date}`
    const a = merged.get(key) ?? { product_id: productId, date, waste: 0 }
    a.waste += r.waste
    merged.set(key, a)
  }

  const rows = [...merged.values()].map(a => ({
    product_id: a.product_id,
    date: a.date,
    waste_kg: a.waste,
    reason: null,
    source: 'google_sheet',
  }))

  if (rows.length > 0) {
    const productIds = [...new Set(rows.map(r => r.product_id))]
    const allDates = rows.map(r => r.date)
    const minDate = allDates.reduce((a, b) => a < b ? a : b)
    const maxDate = allDates.reduce((a, b) => a > b ? a : b)

    const { data: backup } = await supabaseAdmin.from('waste_log')
      .select('*')
      .eq('source', 'google_sheet')
      .in('product_id', productIds)
      .gte('date', minDate)
      .lte('date', maxDate)

    await supabaseAdmin.from('waste_log')
      .delete()
      .eq('source', 'google_sheet')
      .in('product_id', productIds)
      .gte('date', minDate)
      .lte('date', maxDate)

    const { error } = await supabaseAdmin.from('waste_log').insert(rows)
    if (error) {
      if (backup?.length) await supabaseAdmin.from('waste_log').insert(backup)
      throw new Error(`فشل إدراج الهدر: ${error.message}`)
    }
  }
  return rows.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function syncSheets(spreadsheetId: string) {
  const [allSheets, cache] = await Promise.all([
    getSheets(spreadsheetId),
    buildCache(),
  ])

  console.log(`[SYNC] ورقات: ${allSheets.length} | منتجات: ${cache.aliasMap.size} | عملاء: ${cache.sheetMap.size}`)

  let totalImported = 0
  let newCustomers = 0
  const pendingCustomers: string[] = []
  const allUnmatchedProducts = new Set<string>()

  for (const sheet of allSheets) {
    const name = sheet.name.trim()
    if (!sheet.data || sheet.data.length === 0) continue

    if (SYSTEM_SHEETS.includes(name)) {
      if (name === 'المشتريات') {
        const records = parsePurchasesSheet(sheet.data)
        const purchaseCount = await importPurchases(records, cache, allUnmatchedProducts)
        const wasteCount = await importWaste(records, cache, allUnmatchedProducts)
        console.log(`[SYNC] مشتريات: ${purchaseCount} | هدر: ${wasteCount}`)
        totalImported += purchaseCount
      }
    } else {
      const customerId = findCustomerId(name, cache.sheetMap)
      if (customerId) {
        const records = parseCustomerSheet(sheet.data)
        const notFound = records.filter(r => !cache.aliasMap.get(r.productName.toUpperCase().trim()))
        if (notFound.length > 0) console.log(`[SYNC] غير مربوطة:`, [...new Set(notFound.map(r => r.productName))])
        const count = await importSales(records, customerId, cache, allUnmatchedProducts)
        totalImported += count
      } else {
        pendingCustomers.push(name)
        newCustomers++
      }
    }
  }

  // ── حفظ العملاء غير المطابقين في pending_review ──────────────────────────
  if (pendingCustomers.length > 0) {
    const { data: existingC } = await supabaseAdmin
      .from('sync_pending_review').select('raw_name')
      .eq('type', 'customer').in('status', ['pending', 'approved'])
    const existingCNames = new Set((existingC ?? []).map(r => r.raw_name))
    const toInsertC = pendingCustomers
      .filter(n => !existingCNames.has(n))
      .map(n => ({ type: 'customer', raw_name: n, status: 'pending' }))
    if (toInsertC.length > 0) await supabaseAdmin.from('sync_pending_review').insert(toInsertC)
  }

  // ── حفظ الأصناف غير المطابقة في pending_review ────────────────────────────
  if (allUnmatchedProducts.size > 0) {
    const { data: existingP } = await supabaseAdmin
      .from('sync_pending_review').select('raw_name')
      .eq('type', 'product').in('status', ['pending', 'approved'])
    const existingPNames = new Set((existingP ?? []).map(r => r.raw_name))
    const toInsertP = [...allUnmatchedProducts]
      .filter(n => !existingPNames.has(n))
      .map(n => ({ type: 'product', raw_name: n, status: 'pending' }))
    if (toInsertP.length > 0) await supabaseAdmin.from('sync_pending_review').insert(toInsertP)
    console.log(`[SYNC] منتجات غير مطابقة: ${allUnmatchedProducts.size}`)
  }

  console.log(`[SYNC] انتهت المزامنة — إجمالي مستورد: ${totalImported}`)
  return {
    imported: totalImported,
    newCustomers,
    skippedSheets: pendingCustomers,
    unmatchedProducts: [...allUnmatchedProducts],
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return new Response('Unauthorized', { status: 401 })

  // تحقق من صلاحية sync.import
  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('role_id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  // مستخدم موقوف
  if (profile?.is_active === false) return new Response('Forbidden', { status: 403 })

  if (profile?.role_id) {
    const { data: perm } = await supabaseAdmin
      .from('role_permissions')
      .select('id')
      .eq('role_id', profile.role_id)
      .eq('screen', 'sync')
      .eq('action', 'import')
      .maybeSingle()
    if (!perm) return new Response('Forbidden', { status: 403 })
  } else {
    // لا يوجد دور — مسموح فقط إذا كان هذا هو مستخدم Bootstrap (لا يوجد أي مستخدم آخر بدور)
    const { count } = await supabaseAdmin
      .from('user_profiles')
      .select('id', { count: 'exact', head: true })
      .not('role_id', 'is', null)
    if ((count ?? 0) > 0) return new Response('Forbidden', { status: 403 })
  }

  let reqSpreadsheetId: string | undefined
  try {
    const body = await req.json().catch(() => ({}))
    reqSpreadsheetId = body?.spreadsheetId
  } catch {}
  const spreadsheetId = reqSpreadsheetId || process.env.GOOGLE_SPREADSHEET_ID!
  if (!spreadsheetId) return new Response('spreadsheetId missing', { status: 400 })

  try {
    const result = await syncSheets(spreadsheetId)
    return Response.json({ success: true, ...result })
  } catch (err) {
    console.error('Sync error:', err)
    return Response.json({ success: false, message: (err as Error).message }, { status: 500 })
  }
}
