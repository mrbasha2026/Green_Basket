import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { parseCustomerSheet, parsePurchasesSheet, SYSTEM_SHEETS } from '../src/lib/sheetsParser'
import type { SaleRecord, PurchaseRecord } from '../src/types'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── Google Sheets ────────────────────────────────────────────────────────────

async function getSheets(spreadsheetId: string) {
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n')
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })

  const sheets = google.sheets({ version: 'v4', auth })
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
    supabaseAdmin.from('products').select('id, name_en').not('name_en', 'is', null),
    supabaseAdmin.from('customer_sheet_mapping').select('sheet_name, customer_id'),
  ])

  const aliasMap = new Map<string, string>()

  for (const row of aliasRes.data ?? []) {
    aliasMap.set(row.alias.toUpperCase().trim(), row.product_id)
  }
  for (const row of productRes.data ?? []) {
    if (row.name_en) aliasMap.set(row.name_en.toUpperCase().trim(), row.id)
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
    await supabaseAdmin
      .from('sales')
      .upsert(rows, { onConflict: 'product_id,customer_id,date,source', ignoreDuplicates: true })
  }
  return rows.length
}

async function importPurchases(
  records: PurchaseRecord[],
  cache: SyncCache
): Promise<number> {
  const rows = []
  for (const r of records) {
    const productId = cache.aliasMap.get(r.productName.toUpperCase().trim())
    if (!productId) continue
    const totalCost = r.cartons * r.price
    const totalWeight = r.cartons * r.weight
    const net = totalWeight - r.waste
    rows.push({
      product_id: productId,
      date: r.date.toISOString().split('T')[0],
      cartons_qty: r.cartons,
      price_per_carton: r.price,
      weight_per_carton: r.weight,
      waste_kg: r.waste,
      cost_per_kg: net > 0 ? totalCost / net : 0,
      source: 'google_sheet',
    })
  }
  if (rows.length > 0) {
    await supabaseAdmin
      .from('purchases')
      .upsert(rows, { onConflict: 'product_id,date', ignoreDuplicates: true })
  }
  return rows.length
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function syncSheets(spreadsheetId: string) {
  // تحميل كل البيانات مرة واحدة بدلاً من query لكل سجل
  const [allSheets, cache] = await Promise.all([
    getSheets(spreadsheetId),
    buildCache(),
  ])

  let totalImported = 0
  let newCustomers = 0
  const pendingCustomers: string[] = []

  for (const sheet of allSheets) {
    const name = sheet.name.trim()
    if (!sheet.data || sheet.data.length === 0) continue

    if (SYSTEM_SHEETS.includes(name)) {
      if (name.includes('المشتريات')) {
        const records = parsePurchasesSheet(sheet.data)
        const count = await importPurchases(records, cache)
        totalImported += count
      }
    } else {
      const customerId = cache.sheetMap.get(name)
      if (customerId) {
        const records = parseCustomerSheet(sheet.data)
        const count = await importSales(records, customerId, cache)
        totalImported += count
      } else {
        pendingCustomers.push(name)
        newCustomers++
      }
    }
  }

  // إضافة العملاء الجدد لقائمة الانتظار (تجنب التكرار)
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

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID!

  try {
    const result = await syncSheets(spreadsheetId)
    return Response.json({ success: true, ...result })
  } catch (err) {
    console.error('Sync error:', err)
    return Response.json({ success: false, message: (err as Error).message }, { status: 500 })
  }
}
