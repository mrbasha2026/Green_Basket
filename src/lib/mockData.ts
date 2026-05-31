import type {
  Product, Customer, Purchase, Sale, InventoryDaily,
  WasteLog, CostCategory, OverheadEntry, MonthlyPL,
} from '@/types'
import { todayISO } from './utils'

const today = todayISO()
const yesterday = new Date(today)
yesterday.setDate(yesterday.getDate() - 1)
const yd = yesterday.toISOString().split('T')[0]

export const mockProducts: Product[] = [
  { id: 'p1', name_ar: 'طماطم', name_en: 'Tomato', category: 'خضار', unit: 'كج', is_active: true, sort_order: 1, created_at: today, updated_at: today },
  { id: 'p2', name_ar: 'خيار', name_en: 'Cucumber', category: 'خضار', unit: 'كج', is_active: true, sort_order: 2, created_at: today, updated_at: today },
  { id: 'p3', name_ar: 'بصل احمر', name_en: 'Red Onion', category: 'خضار', unit: 'كج', is_active: true, sort_order: 3, created_at: today, updated_at: today },
  { id: 'p4', name_ar: 'جزر', name_en: 'Carrot', category: 'خضار', unit: 'كج', is_active: true, sort_order: 4, created_at: today, updated_at: today },
  { id: 'p5', name_ar: 'موز', name_en: 'Banana', category: 'فاكهة', unit: 'كج', is_active: true, sort_order: 5, created_at: today, updated_at: today },
  { id: 'p6', name_ar: 'تفاح', name_en: 'Apple', category: 'فاكهة', unit: 'كج', is_active: true, sort_order: 6, created_at: today, updated_at: today },
]

export const mockCustomers: Customer[] = [
  { id: 'c1', name_ar: 'مستشفى ملك عبدالله', type: 'مستشفى', is_active: true, created_at: today, updated_at: today },
  { id: 'c2', name_ar: 'بيتوتي', type: 'مطعم', is_active: true, created_at: today, updated_at: today },
  { id: 'c3', name_ar: 'فندق', type: 'فندق', is_active: true, created_at: today, updated_at: today },
  { id: 'c4', name_ar: 'باب البلد', type: 'مطعم', is_active: true, created_at: today, updated_at: today },
]

export const mockPurchases: Purchase[] = [
  { id: 'pu1', product_id: 'p1', date: today, cartons_qty: 10, price_per_carton: 50, weight_per_carton: 10, waste_kg: 2, total_cost: 500, total_weight: 100, cost_per_kg: 5.1, source: 'web', notes: null, created_at: today, product: mockProducts[0] },
  { id: 'pu2', product_id: 'p2', date: today, cartons_qty: 8, price_per_carton: 40, weight_per_carton: 12, waste_kg: 1, total_cost: 320, total_weight: 96, cost_per_kg: 3.37, source: 'web', notes: null, created_at: today, product: mockProducts[1] },
  { id: 'pu3', product_id: 'p3', date: today, cartons_qty: 15, price_per_carton: 30, weight_per_carton: 15, waste_kg: 5, total_cost: 450, total_weight: 225, cost_per_kg: 2.05, source: 'web', notes: null, created_at: today, product: mockProducts[2] },
  { id: 'pu4', product_id: 'p5', date: yd, cartons_qty: 20, price_per_carton: 25, weight_per_carton: 18, waste_kg: 3, total_cost: 500, total_weight: 360, cost_per_kg: 1.4, source: 'google_sheet', notes: null, created_at: yd, product: mockProducts[4] },
]

export const mockSales: Sale[] = [
  { id: 's1', product_id: 'p1', customer_id: 'c1', date: today, qty_kg: 30, purchase_price_per_kg: 5.1, price_per_kg: 8, total_purchase: 153, total_amount: 240, source: 'web', created_at: today, product: mockProducts[0], customer: mockCustomers[0] },
  { id: 's2', product_id: 'p2', customer_id: 'c1', date: today, qty_kg: 20, purchase_price_per_kg: 3.37, price_per_kg: 6, total_purchase: 67.4, total_amount: 120, source: 'web', created_at: today, product: mockProducts[1], customer: mockCustomers[0] },
  { id: 's3', product_id: 'p1', customer_id: 'c2', date: today, qty_kg: 15, purchase_price_per_kg: 5.1, price_per_kg: 7.5, total_purchase: 76.5, total_amount: 112.5, source: 'web', created_at: today, product: mockProducts[0], customer: mockCustomers[1] },
  { id: 's4', product_id: 'p5', customer_id: 'c3', date: yd, qty_kg: 50, purchase_price_per_kg: 1.4, price_per_kg: 3, total_purchase: 70, total_amount: 150, source: 'google_sheet', created_at: yd, product: mockProducts[4], customer: mockCustomers[2] },
]

export const mockInventory: InventoryDaily[] = [
  { id: 'i1', product_id: 'p1', date: today, opening_stock_kg: 20, opening_cost_per_kg: 5, purchased_weight: 98, purchase_cost: 500, waste_kg: 2, sales_kg: 45, closing_stock_kg: 71, weighted_avg_cost: 5.1, product: mockProducts[0] },
  { id: 'i2', product_id: 'p2', date: today, opening_stock_kg: 10, opening_cost_per_kg: 3.2, purchased_weight: 95, purchase_cost: 320, waste_kg: 1, sales_kg: 20, closing_stock_kg: 84, weighted_avg_cost: 3.37, product: mockProducts[1] },
  { id: 'i3', product_id: 'p3', date: today, opening_stock_kg: 30, opening_cost_per_kg: 2, purchased_weight: 220, purchase_cost: 450, waste_kg: 5, sales_kg: 0, closing_stock_kg: 245, weighted_avg_cost: 2.05, product: mockProducts[2] },
  { id: 'i4', product_id: 'p4', date: today, opening_stock_kg: 5, opening_cost_per_kg: 1.8, purchased_weight: 0, purchase_cost: 0, waste_kg: 0, sales_kg: 0, closing_stock_kg: 5, weighted_avg_cost: 1.8, product: mockProducts[3] },
]

export const mockWaste: WasteLog[] = [
  { id: 'w1', product_id: 'p1', date: today, waste_kg: 2, reason: 'تلف طبيعي', source: 'web', created_at: today, product: mockProducts[0] },
  { id: 'w2', product_id: 'p2', date: today, waste_kg: 1, reason: 'تلف طبيعي', source: 'web', created_at: today, product: mockProducts[1] },
  { id: 'w3', product_id: 'p3', date: today, waste_kg: 5, reason: 'حرارة', source: 'web', created_at: today, product: mockProducts[2] },
]

export const mockCostCategories: CostCategory[] = [
  { id: 'cc1', name_ar: 'رواتب الموظفين', type: 'fixed', is_active: true, created_at: today },
  { id: 'cc2', name_ar: 'إيجار المستودع', type: 'fixed', is_active: true, created_at: today },
  { id: 'cc3', name_ar: 'فواتير كهرباء ومبردات', type: 'fixed', is_active: true, created_at: today },
  { id: 'cc4', name_ar: 'فواتير مياه', type: 'fixed', is_active: true, created_at: today },
  { id: 'cc5', name_ar: 'مصاريف النقل والتوصيل', type: 'variable', is_active: true, created_at: today },
  { id: 'cc6', name_ar: 'مصاريف أخرى', type: 'variable', is_active: true, created_at: today },
]

const now = new Date()
export const mockOverheadEntries: OverheadEntry[] = [
  { id: 'oe1', category_id: 'cc1', period_year: now.getFullYear(), period_month: now.getMonth() + 1, amount: 15000, notes: null, created_at: today, category: mockCostCategories[0] },
  { id: 'oe2', category_id: 'cc2', period_year: now.getFullYear(), period_month: now.getMonth() + 1, amount: 5000, notes: null, created_at: today, category: mockCostCategories[1] },
  { id: 'oe3', category_id: 'cc3', period_year: now.getFullYear(), period_month: now.getMonth() + 1, amount: 2000, notes: null, created_at: today, category: mockCostCategories[2] },
  { id: 'oe4', category_id: 'cc4', period_year: now.getFullYear(), period_month: now.getMonth() + 1, amount: 500, notes: null, created_at: today, category: mockCostCategories[3] },
  { id: 'oe5', category_id: 'cc5', period_year: now.getFullYear(), period_month: now.getMonth() + 1, amount: 3000, notes: null, created_at: today, category: mockCostCategories[4] },
  { id: 'oe6', category_id: 'cc6', period_year: now.getFullYear(), period_month: now.getMonth() + 1, amount: 1000, notes: null, created_at: today, category: mockCostCategories[5] },
]

export const mockMonthlyPL: MonthlyPL = {
  id: 'pl1',
  period_year: now.getFullYear(),
  period_month: now.getMonth() + 1,
  total_revenue: 85000,
  total_purchase_cost: 55000,
  total_waste_cost: 2500,
  gross_profit: 27500,
  gross_margin_pct: 32.35,
  overhead_salaries: 15000,
  overhead_rent: 5000,
  overhead_transport: 3000,
  overhead_utilities: 2500,
  overhead_other: 1000,
  total_overhead: 26500,
  net_profit: 1000,
  net_margin_pct: 1.18,
  is_closed: false,
  closed_at: null,
  created_at: today,
}
