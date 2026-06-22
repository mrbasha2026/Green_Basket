-- ── Performance Indices Migration ─────────────────────────────────────────────
-- Run once in Supabase SQL Editor
-- Creates: 7 date-based indices + 2 RPC functions for DISTINCT ON queries

-- 1. sales
CREATE INDEX IF NOT EXISTS idx_sales_date
  ON sales(date);

CREATE INDEX IF NOT EXISTS idx_sales_product_date
  ON sales(product_id, date);

-- 2. purchases
CREATE INDEX IF NOT EXISTS idx_purchases_date
  ON purchases(date);

CREATE INDEX IF NOT EXISTS idx_purchases_product_date
  ON purchases(product_id, date);

-- 3. inventory_daily
CREATE INDEX IF NOT EXISTS idx_inventory_daily_product_date
  ON inventory_daily(product_id, date);

-- 4. waste_log
CREATE INDEX IF NOT EXISTS idx_waste_log_date
  ON waste_log(date);

CREATE INDEX IF NOT EXISTS idx_waste_log_product_date
  ON waste_log(product_id, date);


-- 5. RPC: earliest inventory record per product
--    Replaces full-table JS dedup in useEarliestInventory
CREATE OR REPLACE FUNCTION get_earliest_inventory()
RETURNS TABLE (
  id                  uuid,
  product_id          uuid,
  date                date,
  opening_stock_kg    numeric,
  opening_cost_per_kg numeric,
  purchased_weight    numeric,
  purchase_cost       numeric,
  waste_kg            numeric,
  sales_kg            numeric,
  closing_stock_kg    numeric,
  weighted_avg_cost   numeric,
  product             jsonb
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    i.id,
    i.product_id,
    i.date,
    i.opening_stock_kg,
    i.opening_cost_per_kg,
    i.purchased_weight,
    i.purchase_cost,
    i.waste_kg,
    i.sales_kg,
    i.closing_stock_kg,
    i.weighted_avg_cost,
    to_jsonb(p) AS product
  FROM (
    SELECT DISTINCT ON (product_id) *
    FROM inventory_daily
    ORDER BY product_id, date ASC
  ) i
  LEFT JOIN products p ON p.id = i.product_id
$$;


-- 6. RPC: latest inventory record per product up to (and including) a given date
--    Replaces full-table JS dedup in useInventoryUpTo
CREATE OR REPLACE FUNCTION get_inventory_upto(p_date text)
RETURNS TABLE (
  id                  uuid,
  product_id          uuid,
  date                date,
  opening_stock_kg    numeric,
  opening_cost_per_kg numeric,
  purchased_weight    numeric,
  purchase_cost       numeric,
  waste_kg            numeric,
  sales_kg            numeric,
  closing_stock_kg    numeric,
  weighted_avg_cost   numeric,
  product             jsonb
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    i.id,
    i.product_id,
    i.date,
    i.opening_stock_kg,
    i.opening_cost_per_kg,
    i.purchased_weight,
    i.purchase_cost,
    i.waste_kg,
    i.sales_kg,
    i.closing_stock_kg,
    i.weighted_avg_cost,
    to_jsonb(p) AS product
  FROM (
    SELECT DISTINCT ON (product_id) *
    FROM inventory_daily
    WHERE date <= p_date::date
    ORDER BY product_id, date DESC
  ) i
  LEFT JOIN products p ON p.id = i.product_id
$$;
