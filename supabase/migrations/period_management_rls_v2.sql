-- ============================================================
-- GreenBasket — تشديد RLS لجداول الفترات المحاسبية
-- شغّل هذا في Supabase → SQL Editor
-- ============================================================

-- ── accounting_periods ───────────────────────────────────────
drop policy if exists "authenticated" on accounting_periods;

create policy "accounting_periods: read"
  on accounting_periods for select to authenticated using (true);

create policy "accounting_periods: write restricted"
  on accounting_periods for insert to authenticated
  with check (user_has_permission('period_management', 'edit'));

create policy "accounting_periods: update restricted"
  on accounting_periods for update to authenticated
  using (user_has_permission('period_management', 'edit'))
  with check (user_has_permission('period_management', 'edit'));

create policy "accounting_periods: delete restricted"
  on accounting_periods for delete to authenticated
  using (user_has_permission('period_management', 'edit'));

-- ── inventory_period_close ────────────────────────────────────
drop policy if exists "authenticated" on inventory_period_close;

create policy "inventory_period_close: read"
  on inventory_period_close for select to authenticated using (true);

create policy "inventory_period_close: write restricted"
  on inventory_period_close for insert to authenticated
  with check (user_has_permission('period_management', 'approve'));

create policy "inventory_period_close: update restricted"
  on inventory_period_close for update to authenticated
  using (user_has_permission('period_management', 'approve'))
  with check (user_has_permission('period_management', 'approve'));

create policy "inventory_period_close: delete restricted"
  on inventory_period_close for delete to authenticated
  using (user_has_permission('period_management', 'approve'));

-- ── accounting_period_log ─────────────────────────────────────
drop policy if exists "authenticated" on accounting_period_log;

create policy "accounting_period_log: read"
  on accounting_period_log for select to authenticated using (true);

-- السجل يُكتب بواسطة RPC أو من له صلاحية period_management approve
create policy "accounting_period_log: write restricted"
  on accounting_period_log for insert to authenticated
  with check (user_has_permission('period_management', 'approve'));
