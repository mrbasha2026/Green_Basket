-- ══════════════════════════════════════════════════════
-- إدارة الفترات المحاسبية
-- ══════════════════════════════════════════════════════

-- 1. حالة الفترات
CREATE TABLE IF NOT EXISTS accounting_periods (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_year   INTEGER NOT NULL,
  period_month  INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  wac_calculated_at TIMESTAMPTZ,
  closed_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (period_year, period_month)
);

-- 2. رصيد إغلاق كل منتج لكل فترة
CREATE TABLE IF NOT EXISTS inventory_period_close (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  period_year   INTEGER NOT NULL,
  period_month  INTEGER NOT NULL,
  closing_qty   NUMERIC(12,3) NOT NULL DEFAULT 0,
  closing_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  closing_wac   NUMERIC(10,4) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (product_id, period_year, period_month)
);

-- 3. سجل أحداث الفترات (audit log)
CREATE TABLE IF NOT EXISTS accounting_period_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_year   INTEGER NOT NULL,
  period_month  INTEGER NOT NULL,
  action        TEXT NOT NULL CHECK (action IN ('calculate', 'close', 'open')),
  performed_at  TIMESTAMPTZ DEFAULT NOW(),
  notes         TEXT
);

-- ── RLS ────────────────────────────────────────────────
ALTER TABLE accounting_periods      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_period_close  ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_period_log   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated" ON accounting_periods      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated" ON inventory_period_close  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated" ON accounting_period_log   FOR ALL TO authenticated USING (true) WITH CHECK (true);
