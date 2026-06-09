-- ============================================================
-- GreenBasket System — Permissions Migration
-- شغّل هذا الكود في Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- 1. جدول الأدوار
-- ============================================================
create table if not exists roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  is_system   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================================================
-- 2. جدول صلاحيات الأدوار
-- ============================================================
create table if not exists role_permissions (
  id       uuid primary key default gen_random_uuid(),
  role_id  uuid not null references roles(id) on delete cascade,
  screen   text not null,
  action   text not null,
  constraint role_permissions_unique unique (role_id, screen, action)
);

-- ============================================================
-- 3. جدول ملفات المستخدمين
-- ============================================================
create table if not exists user_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  name       text,
  role_id    uuid references roles(id) on delete set null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- إضافة role_id إن كان الجدول موجوداً من قبل بدونه
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'user_profiles' and column_name = 'role_id'
  ) then
    alter table user_profiles
      add column role_id uuid references roles(id) on delete set null;
  end if;

  -- إضافة is_active إن لم تكن موجودة
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'user_profiles' and column_name = 'is_active'
  ) then
    alter table user_profiles
      add column is_active boolean not null default true;
  end if;
end $$;

-- ============================================================
-- 4. RLS
-- ============================================================
alter table roles enable row level security;
alter table role_permissions enable row level security;
alter table user_profiles enable row level security;

-- أدوار
drop policy if exists "roles: authenticated read" on roles;
drop policy if exists "roles: authenticated write" on roles;
create policy "roles: authenticated read"
  on roles for select to authenticated using (true);
create policy "roles: authenticated write"
  on roles for all to authenticated using (true) with check (true);

-- صلاحيات الأدوار
drop policy if exists "role_permissions: authenticated read" on role_permissions;
drop policy if exists "role_permissions: authenticated write" on role_permissions;
create policy "role_permissions: authenticated read"
  on role_permissions for select to authenticated using (true);
create policy "role_permissions: authenticated write"
  on role_permissions for all to authenticated using (true) with check (true);

-- ملفات المستخدمين
drop policy if exists "user_profiles: authenticated read" on user_profiles;
drop policy if exists "user_profiles: authenticated write" on user_profiles;
create policy "user_profiles: authenticated read"
  on user_profiles for select to authenticated using (true);
create policy "user_profiles: authenticated write"
  on user_profiles for all to authenticated using (true) with check (true);

-- ============================================================
-- 5. بذر الأدوار الافتراضية
-- ============================================================
do $$
declare
  admin_id  uuid;
  manager_id uuid;
  viewer_id  uuid;

  all_screens text[] := array[
    'dashboard','purchases','sales','inventory','waste',
    'customers','customers.prices','cost_accounting','profits',
    'analytics','reports','account_statement','period_management',
    'settings','settings.users','settings.roles','sync'
  ];

  scr text;
begin

  -- مدير النظام
  insert into roles (name, description, is_system)
    values ('مدير النظام', 'صلاحيات كاملة على جميع الشاشات', true)
    on conflict do nothing
    returning id into admin_id;

  if admin_id is null then
    select id into admin_id from roles where name = 'مدير النظام' limit 1;
  end if;

  -- مدير
  insert into roles (name, description, is_system)
    values ('مدير', 'صلاحيات كاملة بدون إدارة المستخدمين والأدوار', false)
    on conflict do nothing
    returning id into manager_id;

  if manager_id is null then
    select id into manager_id from roles where name = 'مدير' limit 1;
  end if;

  -- مشاهد
  insert into roles (name, description, is_system)
    values ('مشاهد', 'عرض وطباعة وتصدير فقط', false)
    on conflict do nothing
    returning id into viewer_id;

  if viewer_id is null then
    select id into viewer_id from roles where name = 'مشاهد' limit 1;
  end if;

  -- ---- مدير النظام: كل الصلاحيات ----
  foreach scr in array all_screens loop
    -- view
    insert into role_permissions (role_id, screen, action)
      values (admin_id, scr, 'view') on conflict do nothing;
    -- add
    if scr not in ('dashboard','profits','analytics','reports','account_statement','settings','settings.roles','sync','customers.prices') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'add') on conflict do nothing;
    end if;
    -- edit
    if scr not in ('dashboard','profits','analytics','reports','account_statement','sync') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'edit') on conflict do nothing;
    end if;
    -- delete
    if scr not in ('dashboard','profits','analytics','reports','account_statement','settings','settings.roles','sync','customers.prices') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'delete') on conflict do nothing;
    end if;
    -- approve
    if scr in ('purchases','sales','inventory','cost_accounting','period_management') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'approve') on conflict do nothing;
    end if;
    -- post
    if scr in ('purchases','sales','inventory','period_management') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'post') on conflict do nothing;
    end if;
    -- print
    if scr not in ('dashboard','settings','settings.users','settings.roles','sync','customers.prices') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'print') on conflict do nothing;
    end if;
    -- export
    if scr not in ('dashboard','settings','settings.users','settings.roles','customers.prices') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'export') on conflict do nothing;
    end if;
    -- import
    if scr in ('purchases','sales','inventory','waste','sync') then
      insert into role_permissions (role_id, screen, action)
        values (admin_id, scr, 'import') on conflict do nothing;
    end if;
  end loop;

  -- ---- مدير: نفس مدير النظام بدون settings.users و settings.roles ----
  insert into role_permissions (role_id, screen, action)
    select manager_id, rp.screen, rp.action
    from role_permissions rp
    where rp.role_id = admin_id
      and rp.screen not in ('settings.users', 'settings.roles')
    on conflict do nothing;

  -- ---- مشاهد: عرض + طباعة + تصدير فقط ----
  foreach scr in array all_screens loop
    insert into role_permissions (role_id, screen, action)
      values (viewer_id, scr, 'view') on conflict do nothing;
  end loop;

  insert into role_permissions (role_id, screen, action)
    select viewer_id, rp.screen, rp.action
    from role_permissions rp
    where rp.role_id = admin_id
      and rp.action in ('print','export')
    on conflict do nothing;

end $$;

-- ============================================================
-- 6. دالة مساعدة: هل للمستخدم صلاحية؟
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
      and rp.screen = p_screen
      and rp.action = p_action
  );
$$;
