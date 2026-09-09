-- BarberFlow MVP schema
-- Development/demo tenant strategy:
-- the frontend does not require authentication yet. The anon key can read and
-- write only the fixed demo tenant below. Replace these policies with
-- auth.uid()-based membership policies before using this database with real
-- customer data.

create extension if not exists pgcrypto;

create table if not exists public.barber_shops (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.barber_shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  phone text,
  notes text,
  last_visit_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.barber_shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  duration_minutes integer not null check (duration_minutes > 0),
  price_cents integer not null check (price_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.barber_shops(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  barber_name text not null check (char_length(trim(barber_name)) > 0),
  starts_at timestamptz not null,
  status text not null default 'scheduled' check (
    status in ('scheduled', 'confirmed', 'in_progress', 'completed', 'cancelled')
  ),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.barber_shops(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_cents integer not null check (amount_cents > 0),
  description text not null check (char_length(trim(description)) > 0),
  occurred_on date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_tenant_name_idx on public.clients (tenant_id, name);
create index if not exists services_tenant_active_idx on public.services (tenant_id, active);
create index if not exists appointments_tenant_starts_at_idx on public.appointments (tenant_id, starts_at);
create index if not exists appointments_tenant_client_idx on public.appointments (tenant_id, client_id);
create index if not exists finance_tenant_occurred_on_idx on public.finance_movements (tenant_id, occurred_on desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists barber_shops_set_updated_at on public.barber_shops;
create trigger barber_shops_set_updated_at before update on public.barber_shops
for each row execute function public.set_updated_at();
drop trigger if exists clients_set_updated_at on public.clients;
create trigger clients_set_updated_at before update on public.clients
for each row execute function public.set_updated_at();
drop trigger if exists services_set_updated_at on public.services;
create trigger services_set_updated_at before update on public.services
for each row execute function public.set_updated_at();
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();
drop trigger if exists finance_movements_set_updated_at on public.finance_movements;
create trigger finance_movements_set_updated_at before update on public.finance_movements
for each row execute function public.set_updated_at();

alter table public.barber_shops enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.finance_movements enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.barber_shops to anon, authenticated;
grant select, insert, update, delete on public.clients to anon, authenticated;
grant select, insert, update, delete on public.services to anon, authenticated;
grant select, insert, update, delete on public.appointments to anon, authenticated;
grant select, insert, update, delete on public.finance_movements to anon, authenticated;

drop policy if exists "demo tenant shop access" on public.barber_shops;
create policy "demo tenant shop access" on public.barber_shops
for all to anon, authenticated
using (id = '00000000-0000-0000-0000-000000000001')
with check (id = '00000000-0000-0000-0000-000000000001');

drop policy if exists "demo tenant clients access" on public.clients;
create policy "demo tenant clients access" on public.clients
for all to anon, authenticated
using (tenant_id = '00000000-0000-0000-0000-000000000001')
with check (tenant_id = '00000000-0000-0000-0000-000000000001');

drop policy if exists "demo tenant services access" on public.services;
create policy "demo tenant services access" on public.services
for all to anon, authenticated
using (tenant_id = '00000000-0000-0000-0000-000000000001')
with check (tenant_id = '00000000-0000-0000-0000-000000000001');

drop policy if exists "demo tenant appointments access" on public.appointments;
create policy "demo tenant appointments access" on public.appointments
for all to anon, authenticated
using (tenant_id = '00000000-0000-0000-0000-000000000001')
with check (tenant_id = '00000000-0000-0000-0000-000000000001');

drop policy if exists "demo tenant finance access" on public.finance_movements;
create policy "demo tenant finance access" on public.finance_movements
for all to anon, authenticated
using (tenant_id = '00000000-0000-0000-0000-000000000001')
with check (tenant_id = '00000000-0000-0000-0000-000000000001');

insert into public.barber_shops (id, name)
values ('00000000-0000-0000-0000-000000000001', 'BarberFlow Demo')
on conflict (id) do nothing;
