-- BarberFlow MVP schema
-- Authenticated users are scoped to shops through barber_shop_members.

create extension if not exists pgcrypto;

create table if not exists public.barber_shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.barber_shops alter column id set default gen_random_uuid();

create table if not exists public.barber_shop_members (
  tenant_id uuid not null references public.barber_shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'barber', 'manager')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id),
  unique (user_id)
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
create index if not exists barber_shop_members_user_idx on public.barber_shop_members (user_id);
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_shop_id uuid;
  requested_shop_name text;
begin
  requested_shop_name := nullif(trim(new.raw_user_meta_data ->> 'shop_name'), '');

  insert into public.barber_shops (name)
  values (
    coalesce(
      requested_shop_name,
      'Barbearia de ' || split_part(coalesce(new.email, 'novo usuário'), '@', 1)
    )
  )
  returning id into new_shop_id;

  insert into public.barber_shop_members (tenant_id, user_id, role)
  values (new_shop_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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
alter table public.barber_shop_members enable row level security;
alter table public.clients enable row level security;
alter table public.services enable row level security;
alter table public.appointments enable row level security;
alter table public.finance_movements enable row level security;

revoke all on public.barber_shops from anon;
revoke all on public.barber_shop_members from anon;
revoke all on public.clients from anon;
revoke all on public.services from anon;
revoke all on public.appointments from anon;
revoke all on public.finance_movements from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.barber_shops to authenticated;
grant select on public.barber_shop_members to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.finance_movements to authenticated;

drop policy if exists "demo tenant shop access" on public.barber_shops;
drop policy if exists "members can access their shop" on public.barber_shops;
create policy "members can access their shop" on public.barber_shops
for all to authenticated
using (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = barber_shops.id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = barber_shops.id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "members can view own memberships" on public.barber_shop_members;
create policy "members can view own memberships" on public.barber_shop_members
for select to authenticated
using (user_id = auth.uid());

drop policy if exists "demo tenant clients access" on public.clients;
drop policy if exists "members can access their clients" on public.clients;
create policy "members can access their clients" on public.clients
for all to authenticated
using (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = clients.tenant_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = clients.tenant_id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "demo tenant services access" on public.services;
drop policy if exists "members can access their services" on public.services;
create policy "members can access their services" on public.services
for all to authenticated
using (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = services.tenant_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = services.tenant_id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "demo tenant appointments access" on public.appointments;
drop policy if exists "members can access their appointments" on public.appointments;
create policy "members can access their appointments" on public.appointments
for all to authenticated
using (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = appointments.tenant_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = appointments.tenant_id
      and member.user_id = auth.uid()
  )
);

drop policy if exists "demo tenant finance access" on public.finance_movements;
drop policy if exists "members can access their finance" on public.finance_movements;
create policy "members can access their finance" on public.finance_movements
for all to authenticated
using (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = finance_movements.tenant_id
      and member.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = finance_movements.tenant_id
      and member.user_id = auth.uid()
  )
);
