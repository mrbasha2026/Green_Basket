-- ============================================================
-- GreenBasket System — Supabase Schema
-- انسخ هذا الكود كاملاً وشغّله في Supabase → SQL Editor
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================

-- 1. المنتجات
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  name_ar       text not null,
  name_en       text,
  category      text not null check (category in ('خضار', 'فاكهة', 'أعشاب')),
  unit          text not null default 'كج',
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2. أسماء المنتجات البديلة (للمطابقة مع Google Sheet)
create table if not exists product_aliases (
  id          uuid primary key default gen_random_uuid(),
  alias       text not null,
  product_id  uuid not null references products(id) on delete cascade,
  unique (alias)
);

-- 3. العملاء
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null,
  type        text not null check (type in ('مستشفى', 'فندق', 'مطعم', 'تجزئة')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 4. ربط ورقة Sheet بعميل
create table if not exists customer_sheet_mapping (
  id              uuid primary key default gen_random_uuid(),
  sheet_name      text not null,
  customer_id     uuid not null references customers(id) on delete cascade,
  spreadsheet_id  text,
  created_at      timestamptz not null default now(),
  unique (sheet_name)
);

-- 5. المشتريات
create table if not exists purchases (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references products(id),
  date                date not null,
  cartons_qty         numeric not null default 0,
  price_per_carton    numeric not null default 0,
  weight_per_carton   numeric not null default 0,
  waste_kg            numeric not null default 0,
  total_cost          numeric generated always as (cartons_qty * price_per_carton) stored,
  total_weight        numeric generated always as (cartons_qty * weight_per_carton) stored,
  cost_per_kg         numeric not null default 0,
  source              text not null default 'web' check (source in ('web', 'google_sheet')),
  notes               text,
  created_at          timestamptz not null default now(),
  unique (product_id, date)
);

-- 6. المبيعات
create table if not exists sales (
  id                      uuid primary key default gen_random_uuid(),
  product_id              uuid not null references products(id),
  customer_id             uuid not null references customers(id),
  date                    date not null,
  qty_kg                  numeric not null default 0,
  purchase_price_per_kg   numeric not null default 0,
  price_per_kg            numeric not null default 0,
  total_purchase          numeric generated always as (qty_kg * purchase_price_per_kg) stored,
  total_amount            numeric generated always as (qty_kg * price_per_kg) stored,
  source                  text not null default 'web' check (source in ('web', 'google_sheet')),
  created_at              timestamptz not null default now(),
  unique (product_id, customer_id, date, source)
);

-- 7. المخزون اليومي
create table if not exists inventory_daily (
  id                    uuid primary key default gen_random_uuid(),
  product_id            uuid not null references products(id),
  date                  date not null,
  opening_stock_kg      numeric not null default 0,
  opening_cost_per_kg   numeric not null default 0,
  purchased_weight      numeric not null default 0,
  purchase_cost         numeric not null default 0,
  waste_kg              numeric not null default 0,
  sales_kg              numeric not null default 0,
  closing_stock_kg      numeric not null default 0,
  weighted_avg_cost     numeric not null default 0,
  unique (product_id, date)
);

-- 8. سجل الهدر
create table if not exists waste_log (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references products(id),
  date        date not null,
  waste_kg    numeric not null default 0,
  reason      text,
  source      text not null default 'web' check (source in ('web', 'google_sheet')),
  created_at  timestamptz not null default now()
);

-- 9. فئات التكاليف
create table if not exists cost_categories (
  id          uuid primary key default gen_random_uuid(),
  name_ar     text not null,
  type        text not null check (type in ('fixed', 'variable')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- 10. التكاليف غير المباشرة (Overhead)
create table if not exists overhead_entries (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references cost_categories(id),
  period_year     integer not null,
  period_month    integer not null check (period_month between 1 and 12),
  amount          numeric not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (category_id, period_year, period_month)
);

-- 11. توزيع التكاليف على الأصناف
create table if not exists cost_allocation (
  id                        uuid primary key default gen_random_uuid(),
  product_id                uuid not null references products(id),
  period_year               integer not null,
  period_month              integer not null,
  revenue                   numeric not null default 0,
  revenue_share_pct         numeric not null default 0,
  direct_cost               numeric not null default 0,
  waste_cost                numeric not null default 0,
  allocated_overhead        numeric not null default 0,
  total_full_cost           numeric not null default 0,
  gross_profit              numeric not null default 0,
  net_profit                numeric not null default 0,
  qty_sold_kg               numeric not null default 0,
  full_cost_per_kg          numeric not null default 0,
  breakeven_price_kg        numeric not null default 0,
  contribution_margin       numeric not null default 0,
  contribution_margin_pct   numeric not null default 0,
  unique (product_id, period_year, period_month)
);

-- 12. قائمة الدخل الشهرية (P&L)
create table if not exists monthly_pl (
  id                    uuid primary key default gen_random_uuid(),
  period_year           integer not null,
  period_month          integer not null,
  total_revenue         numeric not null default 0,
  total_purchase_cost   numeric not null default 0,
  total_waste_cost      numeric not null default 0,
  gross_profit          numeric not null default 0,
  gross_margin_pct      numeric not null default 0,
  overhead_salaries     numeric not null default 0,
  overhead_rent         numeric not null default 0,
  overhead_transport    numeric not null default 0,
  overhead_utilities    numeric not null default 0,
  overhead_other        numeric not null default 0,
  total_overhead        numeric not null default 0,
  net_profit            numeric not null default 0,
  net_margin_pct        numeric not null default 0,
  is_closed             boolean not null default false,
  closed_at             timestamptz,
  created_at            timestamptz not null default now(),
  unique (period_year, period_month)
);

-- 13. أسعار البيع الافتراضية (عميل × صنف)
create table if not exists customer_product_prices (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  product_id    uuid not null references products(id) on delete cascade,
  price_per_kg  numeric not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (customer_id, product_id)
);

-- 14. سجل المزامنة
create table if not exists sync_log (
  id                    uuid primary key default gen_random_uuid(),
  synced_at             timestamptz not null default now(),
  trigger_type          text,
  status                text,
  records_imported      integer not null default 0,
  new_customers_found   integer not null default 0,
  new_products_found    integer not null default 0,
  errors                jsonb,
  details               text
);

-- 14. انتظار المراجعة (عملاء / أصناف جديدة من الـ Sync)
create table if not exists sync_pending_review (
  id                uuid primary key default gen_random_uuid(),
  type              text,
  raw_name          text not null,
  suggested_match   text,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at        timestamptz not null default now()
);


-- 15. جلسات الجرد
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

-- 16. بنود الجرد
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

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table products               enable row level security;
alter table product_aliases        enable row level security;
alter table customers              enable row level security;
alter table customer_sheet_mapping enable row level security;
alter table purchases              enable row level security;
alter table sales                  enable row level security;
alter table inventory_daily        enable row level security;
alter table waste_log              enable row level security;
alter table cost_categories        enable row level security;
alter table overhead_entries       enable row level security;
alter table cost_allocation        enable row level security;
alter table monthly_pl             enable row level security;
alter table customer_product_prices enable row level security;
alter table sync_log               enable row level security;
alter table sync_pending_review    enable row level security;
alter table stocktake_sessions     enable row level security;
alter table stocktake_items        enable row level security;

-- المستخدمون المسجلون يملكون صلاحية كاملة
create policy "authenticated full access" on products               for all to authenticated using (true) with check (true);
create policy "authenticated full access" on product_aliases        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on customers              for all to authenticated using (true) with check (true);
create policy "authenticated full access" on customer_sheet_mapping for all to authenticated using (true) with check (true);
create policy "authenticated full access" on purchases              for all to authenticated using (true) with check (true);
create policy "authenticated full access" on sales                  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on inventory_daily        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on waste_log              for all to authenticated using (true) with check (true);
create policy "authenticated full access" on cost_categories        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on overhead_entries       for all to authenticated using (true) with check (true);
create policy "authenticated full access" on cost_allocation        for all to authenticated using (true) with check (true);
create policy "authenticated full access" on monthly_pl             for all to authenticated using (true) with check (true);
create policy "authenticated full access" on customer_product_prices for all to authenticated using (true) with check (true);
create policy "authenticated full access" on sync_log               for all to authenticated using (true) with check (true);
create policy "authenticated full access" on sync_pending_review    for all to authenticated using (true) with check (true);
create policy "authenticated full access" on stocktake_sessions     for all to authenticated using (true) with check (true);
create policy "authenticated full access" on stocktake_items        for all to authenticated using (true) with check (true);


-- ============================================================
-- SEED DATA — البيانات الأساسية
-- ============================================================

-- فئات التكاليف
insert into cost_categories (name_ar, type) values
  ('رواتب الموظفين',          'fixed'),
  ('إيجار المستودع',          'fixed'),
  ('فواتير كهرباء ومبردات',  'fixed'),
  ('فواتير مياه',             'fixed'),
  ('مصاريف النقل والتوصيل',  'variable'),
  ('مصاريف أخرى',            'variable')
on conflict do nothing;

-- الأصناف الأساسية (خضار، فاكهة، أعشاب)
insert into products (name_ar, name_en, category, unit, sort_order) values
  -- خضار
  ('طماطم',      'TOMATO',         'خضار', 'كج',  1),
  ('خيار',       'CUCUMBER',       'خضار', 'كج',  2),
  ('بصل احمر',   'RED ONION',      'خضار', 'كج',  3),
  ('بصل ابيض',   'WHITE ONION',    'خضار', 'كج',  4),
  ('كرنب',       'CABBAGE',        'خضار', 'كج',  5),
  ('جزر',        'CARROT',         'خضار', 'كج',  6),
  ('بطاطس',      'POTATO',         'خضار', 'كج',  7),
  ('كوسة',       'ZUCCHINI',       'خضار', 'كج',  8),
  ('فلفل احمر',  'RED PEPPER',     'خضار', 'كج',  9),
  ('فلفل اخضر',  'GREEN PEPPER',   'خضار', 'كج', 10),
  ('باذنجان',    'EGGPLANT',       'خضار', 'كج', 11),
  ('بروكلي',     'BROCCOLI',       'خضار', 'كج', 12),
  ('قرنبيط',     'CAULIFLOWER',    'خضار', 'كج', 13),
  ('خس',         'LETTUCE',        'خضار', 'كج', 14),
  ('ثوم',        'GARLIC',         'خضار', 'كج', 15),
  ('بامية',      'OKRA',           'خضار', 'كج', 16),
  ('فجل',        'RADISH',         'خضار', 'كج', 17),
  -- أعشاب
  ('بقدونس',     'PARSLEY',        'أعشاب', 'كج', 30),
  ('كزبرة',      'CORIANDER',      'أعشاب', 'كج', 31),
  ('نعناع',      'MINT',           'أعشاب', 'كج', 32),
  ('كراث',       'LEEK',           'أعشاب', 'كج', 33),
  -- فاكهة
  ('موز',        'BANANA',         'فاكهة', 'كج', 50),
  ('تفاح',       'APPLE',          'فاكهة', 'كج', 51),
  ('برتقال',     'ORANGE',         'فاكهة', 'كج', 52),
  ('مانجو',      'MANGO',          'فاكهة', 'كج', 53),
  ('عنب',        'GRAPE',          'فاكهة', 'كج', 54),
  ('بطيخ',       'WATERMELON',     'فاكهة', 'كج', 55),
  ('شمام',       'CANTALOUPE',     'فاكهة', 'كج', 56),
  ('كمثرى',      'PEAR',           'فاكهة', 'كج', 57),
  ('فراولة',     'STRAWBERRY',     'فاكهة', 'كج', 58)
on conflict do nothing;

-- أسماء بديلة للمطابقة مع Google Sheet (الاسم الإنجليزي بالأحرف الكبيرة)
insert into product_aliases (alias, product_id)
select upper(p.name_en), p.id
from products p
where p.name_en is not null
on conflict (alias) do nothing;
