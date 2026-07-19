create extension if not exists "uuid-ossp";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  created_at timestamptz default now()
);

create table if not exists public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz default now()
);

create table if not exists public.items (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  sku text not null unique,
  category_id uuid references public.categories(id) on delete set null,
  size text,
  current_stock integer not null default 0,
  low_stock_threshold integer not null default 5,
  colors text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid,
  item_id uuid,
  action text not null,
  previous_stock integer,
  new_stock integer,
  timestamp timestamptz default now()
);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace trigger trg_items_updated_at
before update on public.items
for each row
execute function public.handle_updated_at();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.audit_logs enable row level security;

create policy if not exists profiles_select_own on public.profiles
for select using (auth.uid() = id);

create policy if not exists profiles_insert_own on public.profiles
for insert with check (auth.uid() = id);

create policy if not exists categories_read on public.categories
for select using (true);

create policy if not exists categories_write on public.categories
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy if not exists items_read on public.items
for select using (auth.role() = 'authenticated');

create policy if not exists items_write on public.items
for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy if not exists audit_logs_read on public.audit_logs
for select using (auth.role() = 'authenticated');

create policy if not exists audit_logs_write on public.audit_logs
for insert with check (auth.role() = 'authenticated');
