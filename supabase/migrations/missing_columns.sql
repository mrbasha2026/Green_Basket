-- ══════════════════════════════════════════════════════════════
-- GreenBasket — Missing Tables & Columns
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor
-- آمن للتشغيل على قاعدة بيانات حية (IF NOT EXISTS / IF NOT EXISTS)
-- ══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────
-- 1. جدول الموردين (suppliers)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar     TEXT NOT NULL,
  phone       TEXT,
  city        TEXT,
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  is_default  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "suppliers: authenticated full access" ON suppliers;
CREATE POLICY "suppliers: authenticated full access"
  ON suppliers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 2. جدول إعدادات الموقع (site_settings)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS site_settings (
  id          TEXT PRIMARY KEY DEFAULT 'default',
  data        JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO site_settings (id, data)
VALUES ('default', '{}')
ON CONFLICT DO NOTHING;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "site_settings: authenticated full access" ON site_settings;
CREATE POLICY "site_settings: authenticated full access"
  ON site_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ──────────────────────────────────────────────────────────────
-- 3. أعمدة ناقصة في جدول purchases
-- ──────────────────────────────────────────────────────────────
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS invoice_number   TEXT,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT CHECK (transaction_type IN ('شراء', 'مرتجع_مشتريات')),
  ADD COLUMN IF NOT EXISTS supplier_id      UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_ref     TEXT;

-- ──────────────────────────────────────────────────────────────
-- 4. أعمدة ناقصة في جدول sales
-- ──────────────────────────────────────────────────────────────
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS invoice_number   TEXT,
  ADD COLUMN IF NOT EXISTS transaction_type TEXT CHECK (transaction_type IN ('بيع', 'مرتجع_مبيعات'));
