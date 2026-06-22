-- ── Audit Log Migration ────────────────────────────────────────────────────────
-- Run once in Supabase SQL Editor
-- Creates: audit_log table, is_deleted columns, triggers on sales + purchases

-- 1. Add is_deleted to sales
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add is_deleted to purchases
ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Create audit_log table
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name    TEXT         NOT NULL,
  operation     TEXT         NOT NULL,  -- 'INSERT' | 'UPDATE' | 'DELETE'
  record_id     UUID,
  old_data      JSONB,
  new_data      JSONB,
  user_id       UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index for fast lookups by table + time
CREATE INDEX IF NOT EXISTS idx_audit_log_table_created
  ON audit_log (table_name, created_at DESC);

-- 4. RLS on audit_log: authenticated users can read; inserts only via trigger
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_read_authenticated" ON audit_log;
CREATE POLICY "audit_log_read_authenticated"
  ON audit_log FOR SELECT
  TO authenticated
  USING (TRUE);

-- 5. Trigger function (SECURITY DEFINER so it bypasses RLS for inserts)
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (table_name, operation, record_id, old_data, new_data, user_id)
  VALUES (
    TG_TABLE_NAME,
    TG_OP,
    CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    auth.uid()
  );
  RETURN NULL;  -- AFTER trigger; return value ignored
END;
$$;

-- 6. Trigger on sales
DROP TRIGGER IF EXISTS trg_audit_sales ON sales;
CREATE TRIGGER trg_audit_sales
  AFTER INSERT OR UPDATE OR DELETE ON sales
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- 7. Trigger on purchases
DROP TRIGGER IF EXISTS trg_audit_purchases ON purchases;
CREATE TRIGGER trg_audit_purchases
  AFTER INSERT OR UPDATE OR DELETE ON purchases
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();
