import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { parseCustomerSheet, parsePurchasesSheet, SYSTEM_SHEETS } from '../src/lib/sheetsParser';
const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function getSheets(spreadsheetId) {
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n');
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth });
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetNames = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? [];
    const results = [];
    for (const name of sheetNames) {
        try {
            const res = await sheets.spreadsheets.values.get({
                spreadsheetId,
                range: name,
                dateTimeRenderOption: 'FORMATTED_STRING',
            });
            const rows = res.data.values ?? [];
            if (rows.length > 0)
                results.push({ name: name.trim(), data: rows });
        }
        catch { /* skip failed sheets */ }
    }
    return results;
}
async function findProductId(name) {
    const trimmed = name.toUpperCase().trim();
    const { data } = await supabaseAdmin
        .from('product_aliases')
        .select('product_id')
        .ilike('alias', trimmed)
        .single();
    if (data)
        return data.product_id;
    const { data: product } = await supabaseAdmin
        .from('products')
        .select('id')
        .ilike('name_en', trimmed)
        .single();
    return product?.id ?? null;
}
async function findOrCreateCustomer(sheetName) {
    const { data: mapping } = await supabaseAdmin
        .from('customer_sheet_mapping')
        .select('customer_id')
        .eq('sheet_name', sheetName)
        .single();
    if (mapping)
        return mapping.customer_id;
    const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('name_ar', sheetName)
        .single();
    if (customer) {
        await supabaseAdmin.from('customer_sheet_mapping').insert({ sheet_name: sheetName, customer_id: customer.id });
        return customer.id;
    }
    await supabaseAdmin.from('sync_pending_review').insert({ type: 'customer', raw_name: sheetName, status: 'pending' });
    return null;
}
async function importSales(records, customerId) {
    let count = 0;
    const rows = [];
    for (const r of records) {
        const productId = await findProductId(r.productName);
        if (!productId)
            continue;
        rows.push({
            product_id: productId,
            customer_id: customerId,
            date: r.date.toISOString().split('T')[0],
            qty_kg: r.qty,
            purchase_price_per_kg: r.buyPrice,
            price_per_kg: r.sellPrice,
            source: 'google_sheet',
        });
        count++;
    }
    if (rows.length > 0) {
        await supabaseAdmin.from('sales').upsert(rows, { onConflict: 'product_id,customer_id,date,source', ignoreDuplicates: true });
    }
    return count;
}
async function importPurchases(records) {
    let count = 0;
    const rows = [];
    for (const r of records) {
        const productId = await findProductId(r.productName);
        if (!productId)
            continue;
        const totalCost = r.cartons * r.price;
        const totalWeight = r.cartons * r.weight;
        const net = totalWeight - r.waste;
        rows.push({
            product_id: productId,
            date: r.date.toISOString().split('T')[0],
            cartons_qty: r.cartons,
            price_per_carton: r.price,
            weight_per_carton: r.weight,
            waste_kg: r.waste,
            cost_per_kg: net > 0 ? totalCost / net : 0,
            source: 'google_sheet',
        });
        count++;
    }
    if (rows.length > 0) {
        await supabaseAdmin.from('purchases').upsert(rows, { onConflict: 'product_id,date', ignoreDuplicates: true });
    }
    return count;
}
export async function syncSheets(spreadsheetId) {
    const allSheets = await getSheets(spreadsheetId);
    let totalImported = 0;
    let newCustomers = 0;
    for (const sheet of allSheets) {
        const name = sheet.name.trim();
        if (!sheet.data || sheet.data.length === 0)
            continue;
        if (SYSTEM_SHEETS.includes(name)) {
            if (name.includes('المشتريات')) {
                const records = parsePurchasesSheet(sheet.data);
                const count = await importPurchases(records);
                totalImported += count;
            }
        }
        else {
            const customerId = await findOrCreateCustomer(name);
            if (customerId) {
                const records = parseCustomerSheet(sheet.data);
                const count = await importSales(records, customerId);
                totalImported += count;
            }
            else {
                newCustomers++;
            }
        }
    }
    return { imported: totalImported, newCustomers, newProducts: 0 };
}
export default async function handler(req) {
    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    // Auth verification
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!token)
        return new Response('Unauthorized', { status: 401 });
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user)
        return new Response('Unauthorized', { status: 401 });
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
    try {
        const result = await syncSheets(spreadsheetId);
        return Response.json({ success: true, ...result });
    }
    catch (err) {
        console.error('Sync error:', err);
        return Response.json({ success: false, message: err.message }, { status: 500 });
    }
}
