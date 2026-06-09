-- ============================================================
-- GreenBasket — دالة get_latest_purchase_costs
-- تُرجع آخر cost_per_kg لكل منتج بدلاً من جلب كل المشتريات في JS
-- شغّل هذا في Supabase → SQL Editor
-- ============================================================

create or replace function get_latest_purchase_costs(up_to_date date default null)
returns table(product_id uuid, cost_per_kg numeric)
language sql stable security definer
as $$
  select distinct on (product_id)
    product_id,
    cost_per_kg
  from purchases
  where (up_to_date is null or date::date <= up_to_date)
    and cost_per_kg > 0
  order by product_id, date desc;
$$;
