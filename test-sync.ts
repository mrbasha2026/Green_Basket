/**
 * سكريبت اختبار المزامنة — يُشغَّل محلياً فقط
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { google } from 'googleapis'
import * as XLSX from 'xlsx'
import { parsePurchasesSheet } from './src/lib/sheetsParser.js'

// ─── قراءة .env.local ─────────────────────────────────────────────────────
const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
const env: Record<string, string> = {}
for (const line of envContent.split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const idx = t.indexOf('=')
  if (idx < 0) continue
  env[t.slice(0, idx).trim()] = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
}

const SPREADSHEET_ID = process.argv[2] || env['GOOGLE_SPREADSHEET_ID'] || ''
if (!SPREADSHEET_ID) { console.error('❌ أضف spreadsheet ID'); process.exit(1) }

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: env['GOOGLE_SERVICE_ACCOUNT_EMAIL'],
    private_key: (env['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'] ?? '').replace(/\\n/g, '\n'),
  },
  scopes: [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
  ],
})

async function getSheets(): Promise<{ name: string; data: unknown[][] }[]> {
  const client = await auth.getClient()
  const tokenRes = await client.getAccessToken()
  const token = tokenRes.token
  if (!token) throw new Error('فشل الحصول على token')

  const url = `https://www.googleapis.com/drive/v3/files/${SPREADSHEET_ID}?alt=media&supportsAllDrives=true`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`)

  const buffer = await res.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true })

  return workbook.SheetNames.map(name => ({
    name: name.trim(),
    data: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, defval: '' }) as unknown[][],
  })).filter(s => s.data.length > 0)
}

async function main() {
  console.log(`\n🔗 Spreadsheet: ${SPREADSHEET_ID}\n`)

  const allSheets = await getSheets()
  console.log('📋 الورقات:', allSheets.map(s => s.name))

  const purchaseSheet = allSheets.find(s => s.name === 'المشتريات')
  if (!purchaseSheet) { console.error('❌ لم أجد ورقة "المشتريات"'); process.exit(1) }

  const rows = purchaseSheet.data
  console.log(`\n📦 ورقة المشتريات — ${rows.length} صف`)
  console.log('   صف 0:', rows[0]?.slice(0, 12))
  console.log('   صف 1:', rows[1]?.slice(0, 12))
  console.log('   صف 2 (بيانات):', rows[2]?.slice(0, 12))

  const records = parsePurchasesSheet(rows)
  console.log(`\n✅ السجلات المُحلَّلة: ${records.length}`)

  // ─── ملخص بالمنتج ───────────────────────────────────────────────────────
  const byProduct = new Map<string, typeof records>()
  for (const r of records) {
    if (!byProduct.has(r.productName)) byProduct.set(r.productName, [])
    byProduct.get(r.productName)!.push(r)
  }

  console.log('\n📊 ملخص بالمنتج:\n')
  for (const [product, recs] of byProduct) {
    const cartonRecs = recs.filter(r => r.cartons > 0)
    const wasteRecs  = recs.filter(r => r.waste > 0)
    const totalCartons = cartonRecs.reduce((s, r) => s + r.cartons, 0)
    const totalWaste   = recs.reduce((s, r) => s + r.waste, 0)
    console.log(`  ${product}:`)
    console.log(`    أيام بكراتين: ${cartonRecs.length} | إجمالي كراتين: ${totalCartons}`)
    console.log(`    أيام بهدر:    ${wasteRecs.length}   | إجمالي هدر:    ${totalWaste.toFixed(2)} كغ`)
    for (const r of recs.filter(r => r.cartons > 0).slice(0, 2)) {
      const d = r.date.toISOString().split('T')[0]
      console.log(`      ${d}: كراتين=${r.cartons} سعر=${r.price} وزن=${r.weight} هدر=${r.waste}`)
    }
  }

  // ─── بصل احمر تفصيلي (للمقارنة مع البيانات المُرسَلة) ──────────────────
  console.log('\n🔍 بصل احمر — كل السجلات:')
  const onion = records.filter(r => r.productName.trim() === 'بصل احمر')
  if (onion.length === 0) {
    console.log('   ⚠️ لا توجد سجلات! اسم المنتج في الشيت:',
      [...byProduct.keys()].filter(k => k.includes('بصل')))
  }
  for (const r of onion) {
    const d = r.date.toISOString().split('T')[0]
    console.log(`   ${d}: كراتين=${r.cartons} سعر=${r.price} وزن=${r.weight} هدر=${r.waste}`)
  }

  // ─── التحقق من 5/5 (العمود الزائد) ────────────────────────────────────
  console.log('\n🔍 جميع سجلات 2026-05-05:')
  const may5 = records.filter(r => r.date.toISOString().startsWith('2026-05-05'))
  if (may5.length === 0) console.log('   لا سجلات')
  for (const r of may5) {
    console.log(`   ${r.productName}: كراتين=${r.cartons} سعر=${r.price} وزن=${r.weight} هدر=${r.waste}`)
  }
}

main().catch(err => { console.error('❌ خطأ:', err.message); process.exit(1) })
