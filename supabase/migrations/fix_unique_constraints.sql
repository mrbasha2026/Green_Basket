-- إزالة قيد unique(product_id, date) من جدول purchases
-- السبب: يمنع شراء نفس المنتج مرتين في يوم واحد
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_product_id_date_key;

-- إزالة قيد unique(product_id, customer_id, date, source) من جدول sales
-- السبب: يمنع فاتورتين لنفس العميل لنفس المنتج في يوم واحد
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_product_id_customer_id_date_source_key;
