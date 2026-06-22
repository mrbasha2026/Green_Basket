-- ============================================================
-- GreenBasket — تشديد RLS على الجداول العملياتية
-- شغّل هذا في Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- 1. تحديث user_has_permission لفحص is_active
--    مستخدم موقوف لا يحق له أي صلاحية حتى بانتهاء جلسته
-- ============================================================
create or replace function user_has_permission(p_screen text, p_action text)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1
    from user_profiles up
    join role_permissions rp on rp.role_id = up.role_id
    where up.id = auth.uid()
      and up.is_active = true
      and rp.screen = p_screen
      and rp.action = p_action
  );
$$;

-- ============================================================
-- 2. sales — استبدال "authenticated full access" بسياسات مفصّلة
-- ============================================================
drop policy if exists "authenticated full access" on sales;

create policy "sales: read"
  on sales for select to authenticated using (true);

create policy "sales: insert restricted"
  on sales for insert to authenticated
  with check (user_has_permission('sales', 'add'));

create policy "sales: update restricted"
  on sales for update to authenticated
  using (user_has_permission('sales', 'edit'))
  with check (user_has_permission('sales', 'edit'));

create policy "sales: delete restricted"
  on sales for delete to authenticated
  using (user_has_permission('sales', 'delete'));

-- ============================================================
-- 3. purchases — استبدال "authenticated full access" بسياسات مفصّلة
-- ============================================================
drop policy if exists "authenticated full access" on purchases;

create policy "purchases: read"
  on purchases for select to authenticated using (true);

create policy "purchases: insert restricted"
  on purchases for insert to authenticated
  with check (user_has_permission('purchases', 'add'));

create policy "purchases: update restricted"
  on purchases for update to authenticated
  using (user_has_permission('purchases', 'edit'))
  with check (user_has_permission('purchases', 'edit'));

create policy "purchases: delete restricted"
  on purchases for delete to authenticated
  using (user_has_permission('purchases', 'delete'));

-- ============================================================
-- 4. waste_log — استبدال "authenticated full access" بسياسات مفصّلة
-- ============================================================
drop policy if exists "authenticated full access" on waste_log;

create policy "waste_log: read"
  on waste_log for select to authenticated using (true);

create policy "waste_log: insert restricted"
  on waste_log for insert to authenticated
  with check (user_has_permission('waste', 'add'));

create policy "waste_log: update restricted"
  on waste_log for update to authenticated
  using (user_has_permission('waste', 'edit'))
  with check (user_has_permission('waste', 'edit'));

create policy "waste_log: delete restricted"
  on waste_log for delete to authenticated
  using (user_has_permission('waste', 'delete'));

-- ============================================================
-- 5. products — استبدال "authenticated full access" بسياسات مفصّلة
--    إدارة المنتجات تتطلب صلاحية inventory (كما هو مُعرَّف في ProductsSection)
-- ============================================================
drop policy if exists "authenticated full access" on products;

create policy "products: read"
  on products for select to authenticated using (true);

create policy "products: insert restricted"
  on products for insert to authenticated
  with check (user_has_permission('inventory', 'add'));

create policy "products: update restricted"
  on products for update to authenticated
  using (user_has_permission('inventory', 'edit'))
  with check (user_has_permission('inventory', 'edit'));

create policy "products: delete restricted"
  on products for delete to authenticated
  using (user_has_permission('inventory', 'delete'));
