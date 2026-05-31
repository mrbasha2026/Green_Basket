import { createClient } from '@supabase/supabase-js'
import { syncSheets } from '../sync-sheets'

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(_req: Request): Promise<Response> {
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID
  if (!spreadsheetId) {
    return Response.json({ success: false, message: 'GOOGLE_SPREADSHEET_ID not set' }, { status: 500 })
  }

  // Create log entry
  const { data: logEntry } = await supabaseAdmin
    .from('sync_log')
    .insert({ trigger_type: 'scheduled', status: 'running', records_imported: 0, new_customers_found: 0, new_products_found: 0 })
    .select()
    .single()

  const logId = logEntry?.id

  try {
    const result = await syncSheets(spreadsheetId)

    if (logId) {
      await supabaseAdmin
        .from('sync_log')
        .update({
          status: 'success',
          records_imported: result.imported,
          new_customers_found: result.newCustomers,
          new_products_found: result.newProducts,
        })
        .eq('id', logId)
    }

    return Response.json({ success: true, ...result })
  } catch (err) {
    console.error('Cron sync error:', err)

    if (logId) {
      await supabaseAdmin
        .from('sync_log')
        .update({ status: 'error', errors: { message: (err as Error).message } })
        .eq('id', logId)
    }

    return Response.json({ success: false, message: (err as Error).message }, { status: 500 })
  }
}
