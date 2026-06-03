-- ============================================================
-- FIX: إضافة جداول الجرد و RLS policies المفقودة
-- شغّل هذا الـ SQL في Supabase Dashboard > SQL Editor
-- ============================================================

-- إنشاء الجداول إن لم تكن موجودة
create table if not exists stocktake_sessions (
  id               uuid primary key default gen_random_uuid(),
  session_number   text not null,
  date             date not null,
  responsible      text,
  status           text not null default 'draft' check (status in ('draft', 'completed', 'approved')),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists stocktake_items (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references stocktake_sessions(id) on delete cascade,
  product_id   uuid not null references products(id) on delete restrict,
  system_qty   numeric(12,3) not null default 0,
  actual_qty   numeric(12,3),
  notes        text,
  created_at   timestamptz not null default now(),
  unique (session_id, product_id)
);

-- تفعيل RLS
alter table stocktake_sessions enable row level security;
alter table stocktake_items    enable row level security;

-- إضافة policies (متجاهل إن كانت موجودة)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'stocktake_sessions' and policyname = 'authenticated full access'
  ) then
    create policy "authenticated full access" on stocktake_sessions
      for all to authenticated using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where tablename = 'stocktake_items' and policyname = 'authenticated full access'
  ) then
    create policy "authenticated full access" on stocktake_items
      for all to authenticated using (true) with check (true);
  end if;
end $$;
