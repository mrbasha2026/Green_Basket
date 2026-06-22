-- Session 3: إضافة حقول VAT لجدولي sales و purchases
-- شغّل في Supabase → SQL Editor

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_amount  numeric  NOT NULL DEFAULT 0;

ALTER TABLE purchases
  ADD COLUMN IF NOT EXISTS vat_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_amount  numeric  NOT NULL DEFAULT 0;
