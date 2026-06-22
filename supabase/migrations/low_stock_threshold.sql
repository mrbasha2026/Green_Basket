-- إضافة حقل حد التنبيه المخصص لكل صنف
ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold numeric DEFAULT 10;
COMMENT ON COLUMN products.low_stock_threshold IS 'حد الكمية الدنيا التي يصدر عندها تنبيه المخزون المنخفض (كج)';
