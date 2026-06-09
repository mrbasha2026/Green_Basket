-- ============================================================
-- GreenBasket — تشديد سياسات RLS للجداول الحساسة
-- شغّل هذا في Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- roles — القراءة مفتوحة للمصادقين، الكتابة لأصحاب صلاحية settings.roles
-- ============================================================
drop policy if exists "roles: authenticated write" on roles;

create policy "roles: write restricted"
  on roles for insert to authenticated
  with check (user_has_permission('settings.roles', 'edit'));

create policy "roles: update restricted"
  on roles for update to authenticated
  using (user_has_permission('settings.roles', 'edit'))
  with check (user_has_permission('settings.roles', 'edit'));

create policy "roles: delete restricted"
  on roles for delete to authenticated
  using (user_has_permission('settings.roles', 'edit'));

-- ============================================================
-- role_permissions — القراءة مفتوحة، الكتابة لأصحاب صلاحية settings.roles
-- ============================================================
drop policy if exists "role_permissions: authenticated write" on role_permissions;

create policy "role_permissions: write restricted"
  on role_permissions for insert to authenticated
  with check (user_has_permission('settings.roles', 'edit'));

create policy "role_permissions: update restricted"
  on role_permissions for update to authenticated
  using (user_has_permission('settings.roles', 'edit'))
  with check (user_has_permission('settings.roles', 'edit'));

create policy "role_permissions: delete restricted"
  on role_permissions for delete to authenticated
  using (user_has_permission('settings.roles', 'edit'));

-- ============================================================
-- user_profiles — القراءة للمستخدم نفسه أو من له صلاحية settings.users
--                الكتابة مقيّدة بصلاحية settings.users (إنشاء المستخدمين عبر API)
-- ============================================================
drop policy if exists "user_profiles: authenticated read"  on user_profiles;
drop policy if exists "user_profiles: authenticated write" on user_profiles;

-- القراءة: المستخدم يرى ملفه أو من له صلاحية settings.users view
create policy "user_profiles: read own or admin"
  on user_profiles for select to authenticated
  using (
    id = auth.uid()
    or user_has_permission('settings.users', 'view')
  );

-- الإدراج: فقط من له صلاحية settings.users add (أو bootstrap: لا role_id)
create policy "user_profiles: insert restricted"
  on user_profiles for insert to authenticated
  with check (
    user_has_permission('settings.users', 'add')
    -- يسمح بالإدراج إذا كان المستخدم الحالي لا يملك role_id بعد (أول إعداد)
    or not exists (
      select 1 from user_profiles up2
      where up2.id = auth.uid() and up2.role_id is not null
    )
  );

-- التعديل: المستخدم يعدّل ملفه (بيانات غير حساسة) أو من له صلاحية settings.users edit
create policy "user_profiles: update restricted"
  on user_profiles for update to authenticated
  using (
    id = auth.uid()
    or user_has_permission('settings.users', 'edit')
  )
  with check (
    id = auth.uid()
    or user_has_permission('settings.users', 'edit')
  );

-- الحذف: فقط من له صلاحية settings.users delete
create policy "user_profiles: delete restricted"
  on user_profiles for delete to authenticated
  using (user_has_permission('settings.users', 'delete'));
