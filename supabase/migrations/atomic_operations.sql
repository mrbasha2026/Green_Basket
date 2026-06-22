-- ── Atomic Operations Migration ──────────────────────────────────────────────
-- Session 7: منع Race Conditions في أرقام الفواتير وعمليات الفترات المحاسبية
-- Run once in Supabase SQL Editor

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. جدول عدّادات الفواتير
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS invoice_counters (
  prefix       TEXT    PRIMARY KEY,
  last_number  INTEGER NOT NULL DEFAULT 0
);

-- RLS: لا يُسمح بالوصول المباشر — كل الكتابة عبر SECURITY DEFINER function فقط
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- تهيئة العدّادات من الفواتير الموجودة (آمن للتشغيل على DB حية)
INSERT INTO invoice_counters (prefix, last_number)
SELECT
  SPLIT_PART(invoice_number, '-', 1),
  MAX(CAST(SPLIT_PART(invoice_number, '-', 2) AS INTEGER))
FROM sales
WHERE invoice_number IS NOT NULL
  AND invoice_number LIKE '%-%'
  AND SPLIT_PART(invoice_number, '-', 2) ~ '^\d+$'
GROUP BY SPLIT_PART(invoice_number, '-', 1)
ON CONFLICT (prefix) DO UPDATE
  SET last_number = GREATEST(invoice_counters.last_number, EXCLUDED.last_number);

INSERT INTO invoice_counters (prefix, last_number)
SELECT
  SPLIT_PART(invoice_number, '-', 1),
  MAX(CAST(SPLIT_PART(invoice_number, '-', 2) AS INTEGER))
FROM purchases
WHERE invoice_number IS NOT NULL
  AND invoice_number LIKE '%-%'
  AND SPLIT_PART(invoice_number, '-', 2) ~ '^\d+$'
GROUP BY SPLIT_PART(invoice_number, '-', 1)
ON CONFLICT (prefix) DO UPDATE
  SET last_number = GREATEST(invoice_counters.last_number, EXCLUDED.last_number);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. توليد رقم فاتورة ذري (بدون Race Condition)
-- ═══════════════════════════════════════════════════════════════════════════════
-- يستخدم INSERT ... ON CONFLICT DO UPDATE ... RETURNING وهو ذري في PostgreSQL
-- أمثلة: get_next_invoice_number('SIM') → 'SIM-00001'
CREATE OR REPLACE FUNCTION get_next_invoice_number(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  INSERT INTO invoice_counters (prefix, last_number)
  VALUES (p_prefix, 1)
  ON CONFLICT (prefix) DO UPDATE
    SET last_number = invoice_counters.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN p_prefix || '-' || LPAD(v_next::TEXT, 5, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION get_next_invoice_number(TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. حفظ WAC الشهري ذرياً في transaction واحدة
-- ═══════════════════════════════════════════════════════════════════════════════
-- يستبدل 3 عمليات متسلسلة (upsert + batch updates + upsert + insert)
-- بـ transaction واحدة لا تتجزأ
CREATE OR REPLACE FUNCTION save_period_wac(
  p_year          INTEGER,
  p_month         INTEGER,
  p_close_rows    JSONB,   -- [{product_id, closing_qty, closing_value, closing_wac}]
  p_sales_updates JSONB,   -- [{id, wac}]
  p_notes         TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- أ. حفظ أرصدة الإغلاق
  INSERT INTO inventory_period_close (
    product_id, period_year, period_month,
    closing_qty, closing_value, closing_wac
  )
  SELECT
    (r->>'product_id')::UUID,
    p_year,
    p_month,
    (r->>'closing_qty')::NUMERIC,
    (r->>'closing_value')::NUMERIC,
    (r->>'closing_wac')::NUMERIC
  FROM jsonb_array_elements(p_close_rows) AS r
  ON CONFLICT (product_id, period_year, period_month) DO UPDATE
    SET closing_qty   = EXCLUDED.closing_qty,
        closing_value = EXCLUDED.closing_value,
        closing_wac   = EXCLUDED.closing_wac;

  -- ب. تحديث تكلفة WAC في سطور المبيعات
  UPDATE sales
  SET purchase_price_per_kg = (u->>'wac')::NUMERIC
  FROM jsonb_array_elements(p_sales_updates) AS u
  WHERE sales.id = (u->>'id')::UUID;

  -- ج. تسجيل وقت احتساب WAC في حالة الفترة
  INSERT INTO accounting_periods (period_year, period_month, status, wac_calculated_at)
  VALUES (p_year, p_month, 'open', NOW())
  ON CONFLICT (period_year, period_month) DO UPDATE
    SET wac_calculated_at = NOW();

  -- د. سجل الأحداث
  INSERT INTO accounting_period_log (period_year, period_month, action, notes)
  VALUES (p_year, p_month, 'calculate', p_notes);
END;
$$;

GRANT EXECUTE ON FUNCTION save_period_wac(INTEGER, INTEGER, JSONB, JSONB, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. إغلاق فترة محاسبية ذرياً
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION close_accounting_period(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO accounting_periods (period_year, period_month, status, closed_at)
  VALUES (p_year, p_month, 'closed', NOW())
  ON CONFLICT (period_year, period_month) DO UPDATE
    SET status    = 'closed',
        closed_at = NOW();

  INSERT INTO accounting_period_log (period_year, period_month, action, notes)
  VALUES (p_year, p_month, 'close', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION close_accounting_period(INTEGER, INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. فتح فترة محاسبية ذرياً
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION open_accounting_period(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO accounting_periods (period_year, period_month, status, closed_at)
  VALUES (p_year, p_month, 'open', NULL)
  ON CONFLICT (period_year, period_month) DO UPDATE
    SET status    = 'open',
        closed_at = NULL;
  -- wac_calculated_at مُحتفظ به — يُحذف عند إعادة الاحتساب

  -- حذف رصيد الإغلاق لإعادة الاحتساب لاحقاً
  DELETE FROM inventory_period_close
  WHERE period_year = p_year AND period_month = p_month;

  INSERT INTO accounting_period_log (period_year, period_month, action, notes)
  VALUES (p_year, p_month, 'open', NULL);
END;
$$;

GRANT EXECUTE ON FUNCTION open_accounting_period(INTEGER, INTEGER) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- ملاحظة: UNIQUE constraint على invoice_number
-- ═══════════════════════════════════════════════════════════════════════════════
-- لم يُضَف لأن النموذج الحالي يسمح لعدة سطور (منتجات مختلفة) بمشاركة نفس
-- invoice_number في فاتورة واحدة. الحماية من التكرار تأتي عبر العداد الذري.
