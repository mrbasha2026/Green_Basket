export interface Product {
  id: string
  name_ar: string
  name_en: string | null
  category: 'خضار' | 'فاكهة' | 'أعشاب'
  unit: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export interface ProductAlias {
  id: string
  alias: string
  product_id: string
}

export interface Customer {
  id: string
  name_ar: string
  type: 'مستشفى' | 'فندق' | 'مطعم' | 'تجزئة'
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface CustomerSheetMapping {
  id: string
  sheet_name: string
  customer_id: string
  spreadsheet_id: string | null
  created_at: string
}

export interface Purchase {
  id: string
  product_id: string
  date: string
  cartons_qty: number
  price_per_carton: number
  weight_per_carton: number
  waste_kg: number
  total_cost: number
  total_weight: number
  cost_per_kg: number
  source: 'web' | 'google_sheet'
  notes: string | null
  created_at: string
  product?: Product
}

export interface Sale {
  id: string
  product_id: string
  customer_id: string
  date: string
  qty_kg: number
  purchase_price_per_kg: number
  price_per_kg: number
  total_purchase: number
  total_amount: number
  source: 'web' | 'google_sheet'
  created_at: string
  product?: Product
  customer?: Customer
}

export interface InventoryDaily {
  id: string
  product_id: string
  date: string
  opening_stock_kg: number
  opening_cost_per_kg: number
  purchased_weight: number
  purchase_cost: number
  waste_kg: number
  sales_kg: number
  closing_stock_kg: number
  weighted_avg_cost: number
  product?: Product
}

export interface WasteLog {
  id: string
  product_id: string
  date: string
  waste_kg: number
  reason: string | null
  source: 'web' | 'google_sheet'
  created_at: string
  product?: Product
}

export interface CostCategory {
  id: string
  name_ar: string
  type: 'fixed' | 'variable'
  is_active: boolean
  created_at: string
}

export interface OverheadEntry {
  id: string
  category_id: string
  period_year: number
  period_month: number
  amount: number
  notes: string | null
  created_at: string
  category?: CostCategory
}

export interface CostAllocation {
  id: string
  product_id: string
  period_year: number
  period_month: number
  revenue: number
  revenue_share_pct: number
  direct_cost: number
  waste_cost: number
  allocated_overhead: number
  total_full_cost: number
  gross_profit: number
  net_profit: number
  qty_sold_kg: number
  full_cost_per_kg: number
  breakeven_price_kg: number
  contribution_margin: number
  contribution_margin_pct: number
  product?: Product
}

export interface MonthlyPL {
  id: string
  period_year: number
  period_month: number
  total_revenue: number
  total_purchase_cost: number
  total_waste_cost: number
  gross_profit: number
  gross_margin_pct: number
  overhead_salaries: number
  overhead_rent: number
  overhead_transport: number
  overhead_utilities: number
  overhead_other: number
  total_overhead: number
  net_profit: number
  net_margin_pct: number
  is_closed: boolean
  closed_at: string | null
  created_at: string
}

export interface SyncLog {
  id: string
  synced_at: string
  trigger_type: string | null
  status: string | null
  records_imported: number
  new_customers_found: number
  new_products_found: number
  errors: Record<string, unknown> | null
  details: string | null
}

export interface SyncPendingReview {
  id: string
  type: string | null
  raw_name: string
  suggested_match: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

// Form + parser types
export interface PurchaseFormRow {
  product_id: string
  cartons_qty: number
  price_per_carton: number
  weight_per_carton: number
  waste_kg: number
}

export interface SaleFormRow {
  product_id: string
  qty_kg: number
  purchase_price_per_kg: number
  price_per_kg: number
  wac?: number
}

export interface SaleRecord {
  date: Date
  productName: string
  qty: number
  buyPrice: number
  sellPrice: number
  total: number
}

export interface PurchaseRecord {
  date: Date
  productName: string
  cartons: number
  price: number
  weight: number
  waste: number
}

export interface CostAllocationResult {
  product_id: string
  revenue: number
  revenue_share_pct: number
  direct_cost: number
  waste_cost: number
  allocated_overhead: number
  total_full_cost: number
  gross_profit: number
  net_profit: number
  qty_sold_kg: number
  full_cost_per_kg: number
  breakeven_price_kg: number
  contribution_margin: number
  contribution_margin_pct: number
}

export interface CustomerProductPrice {
  id: string
  customer_id: string
  product_id: string
  price_per_kg: number
  created_at: string
  updated_at: string
  customer?: Customer
  product?: Product
}

export interface MonthlyPLResult {
  total_revenue: number
  total_purchase_cost: number
  total_waste_cost: number
  gross_profit: number
  gross_margin_pct: number
  overhead_salaries: number
  overhead_rent: number
  overhead_transport: number
  overhead_utilities: number
  overhead_other: number
  total_overhead: number
  net_profit: number
  net_margin_pct: number
}
