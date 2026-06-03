import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { parseCustomerSheet, parsePurchasesSheet, SYSTEM_SHEETS } from '../src/lib/sheetsParser'
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

// ─── Cache: تحميل كل البيانات مرة واحدة ──────────────────────────────────────

interface SyncCache {
  // alias (uppercase) → product_id
  aliasMap: Map<string, string>
  // sheet_name → customer_id
  sheetMap: Map<string, string>
}

async function buildCache(): Promise<SyncCache> {
  const [aliasRes, productRes, sheetRes] = await Promise.all([
    supabaseAdmin.from('product_aliases').select('alias, product_id'),
    supabaseAdmin.from('products').select('id, name_en, name_ar'),
    supabaseAdmin.from('customer_sheet_mapping').select('sheet_name, customer_id'),
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

  return { aliasMap, sheetMap }
}

// ─── Import ───────────────────────────────────────────────────────────────────

async function importSales(
  records: SaleRecord[],
  customerId: string,
  cache: SyncCache
): Promise<number> {
  const rows = []
  for (const r of records) {
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) continue
    rows.push({
      product_id: productId,
      customer_id: customerId,
      date: r.date.toISOString().split('T')[0],
      qty_kg: r.qty,
      purchase_price_per_kg: r.buyPrice,
      price_per_kg: r.sellPrice,
      source: 'google_sheet',
    })
  }
  if (rows.length > 0) {
    // Insert without deduplication — duplicates from same sheet run are prevented by force-sync delete
    await supabaseAdmin.from('sales').insert(rows)
  }
  return rows.length
}

async function importPurchases(
  records: PurchaseRecord[],
  cache: SyncCache
): Promise<number> {
  const rows = []
  for (const r of records) {
    if (r.cartons <= 0) continue  // المشتريات فقط
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) continue
    rows.push({
      product_id: productId,
      date: r.date.toISOString().split('T')[0],
      cartons_qty: r.cartons,
      price_per_carton: r.price,
      weight_per_carton: r.weight,
      waste_kg: 0,
      cost_per_kg: r.weight > 0 ? r.price / r.weight : 0,
      source: 'google_sheet',
    })
  }
  if (rows.length > 0) {
    await supabaseAdmin.from('purchases').insert(rows)
  }
  return rows.length
}

async function importWaste(
  records: PurchaseRecord[],
  cache: SyncCache
): Promise<number> {
  const rows = []
  for (const r of records) {
    if (r.waste <= 0) continue  // الهدر فقط
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) continue
    rows.push({
      product_id: productId,
      date: r.date.toISOString().split('T')[0],
      waste_kg: r.waste,
      reason: null,
      source: 'google_sheet',
    })
  }
  if (rows.length > 0) {
    await supabaseAdmin.from('waste_log').insert(rows)
  }
  return rows.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function syncSheets(spreadsheetId: string) {
  const [allSheets, cache] = await Promise.all([
    getSheets(spreadsheetId),
    buildCache(),
  ])

  console.log(`\n[SYNC] ورقات موجودة (${allSheets.length}):`, allSheets.map(s => s.name))
  console.log(`[SYNC] منتجات في الـ cache: ${cache.aliasMap.size}`)
  console.log(`[SYNC] عملاء مربوطون: ${cache.sheetMap.size} →`, [...cache.sheetMap.keys()])

  let totalImported = 0
  let newCustomers = 0
  const pendingCustomers: string[] = []

  for (const sheet of allSheets) {
    const name = sheet.name.trim()
    if (!sheet.data || sheet.data.length === 0) continue

    if (SYSTEM_SHEETS.includes(name)) {
      if (name.includes('المشتريات')) {
        console.log(`\n[SYNC] 📦 ورقة مشتريات: "${name}"`)
        console.log(`[SYNC]   صف 0:`, sheet.data[0]?.slice(0, 10))
        console.log(`[SYNC]   صف 1:`, sheet.data[1]?.slice(0, 10))
        console.log(`[SYNC]   صف 2:`, sheet.data[2]?.slice(0, 10))
        const records = parsePurchasesSheet(sheet.data)
        console.log(`[SYNC]   سجلات parsed: ${records.length}`)
        if (records.length > 0) console.log(`[SYNC]   عينة:`, records[0])
        const notFound = records.filter(r => !cache.aliasMap.get(r.productName.toUpperCase().trim()))
        if (notFound.length > 0) console.log(`[SYNC]   ⚠️ غير مربوطة:`, [...new Set(notFound.map(r => r.productName))])
        const purchaseCount = await importPurchases(records, cache)
        const wasteCount = await importWaste(records, cache)
        console.log(`[SYNC]   ✅ مشتريات: ${purchaseCount} | هدر: ${wasteCount}`)
        totalImported += purchaseCount
      }
    } else {
      const customerId = cache.sheetMap.get(name)
      if (customerId) {
        console.log(`\n[SYNC] 🛒 ورقة عميل: "${name}"`)
        console.log(`[SYNC]   صف 0:`, sheet.data[0]?.slice(0, 10))
        console.log(`[SYNC]   صف 1:`, sheet.data[1]?.slice(0, 10))
        console.log(`[SYNC]   صف 2:`, sheet.data[2]?.slice(0, 10))
        const records = parseCustomerSheet(sheet.data)
        console.log(`[SYNC]   سجلات parsed: ${records.length}`)
        if (records.length > 0) console.log(`[SYNC]   عينة:`, records[0])
        const notFound = records.filter(r => !cache.aliasMap.get(r.productName.toUpperCase().trim()))
        if (notFound.length > 0) console.log(`[SYNC]   ⚠️ غير مربوطة:`, [...new Set(notFound.map(r => r.productName))])
        const count = await importSales(records, customerId, cache)
        console.log(`[SYNC]   ✅ مستوردة: ${count}`)
        totalImported += count
      } else {
        pendingCustomers.push(name)
        newCustomers++
      }
    }
  }

  if (pendingCustomers.length > 0) {
    const { data: existing } = await supabaseAdmin
      .from('sync_pending_review')
      .select('raw_name')
      .eq('status', 'pending')
      .eq('type', 'customer')

    const existingNames = new Set((existing ?? []).map(r => r.raw_name))
    const toInsert = pendingCustomers
      .filter(n => !existingNames.has(n))
      .map(n => ({ type: 'customer', raw_name: n, status: 'pending' }))

    if (toInsert.length > 0) {
      await supabaseAdmin.from('sync_pending_review').insert(toInsert)
    }
  }

  console.log(`\n[SYNC] ✅ انتهت المزامنة — إجمالي مستورد: ${totalImported}`)
  return { imported: totalImported, newCustomers, newProducts: 0 }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return new Response('Unauthorized', { status: 401 })

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return new Response('Unauthorized', { status: 401 })

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
