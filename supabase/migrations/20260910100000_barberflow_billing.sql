-- BarberFlow billing structure.
-- This migration prepares plans and Mercado Pago reconciliation without
-- processing payments in the browser. A trusted Edge Function/webhook must
-- be added before any checkout or subscription status is activated.

create table if not exists public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9][a-z0-9_-]{1,48}$'),
  name text not null,
  description text not null default '',
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year')),
  trial_days integer not null default 14 check (trial_days between 0 and 365),
  features jsonb not null default '[]'::jsonb check (jsonb_typeof(features) = 'array'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.barber_shops(id) on delete cascade,
  plan_id uuid references public.billing_plans(id) on delete restrict,
  requested_plan_id uuid references public.billing_plans(id) on delete restrict,
  provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago')),
  provider_subscription_id text,
  status text not null default 'trialing'
    check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'pending')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_ends_at timestamptz,
  canceled_at timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end is null or current_period_start is null or current_period_end > current_period_start),
  check (trial_ends_at is null or current_period_start is null or trial_ends_at >= current_period_start)
);

create unique index if not exists tenant_subscriptions_provider_id_idx
  on public.tenant_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;
create index if not exists tenant_subscriptions_tenant_status_idx
  on public.tenant_subscriptions (tenant_id, status);

-- Rows written by a trusted Mercado Pago webhook/reconciliation function.
-- Authenticated clients deliberately receive no grants on this table.
create table if not exists public.billing_payment_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.barber_shops(id) on delete set null,
  provider text not null default 'mercado_pago'
    check (provider in ('mercado_pago')),
  provider_event_id text not null,
  event_type text not null,
  provider_payment_id text,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);
create index if not exists billing_payment_events_tenant_created_idx
  on public.billing_payment_events (tenant_id, created_at desc);

create index if not exists billing_plans_active_idx
  on public.billing_plans (active, created_at);

drop trigger if exists billing_plans_set_updated_at on public.billing_plans;
create trigger billing_plans_set_updated_at
before update on public.billing_plans
for each row execute function public.set_updated_at();

drop trigger if exists tenant_subscriptions_set_updated_at on public.tenant_subscriptions;
create trigger tenant_subscriptions_set_updated_at
before update on public.tenant_subscriptions
for each row execute function public.set_updated_at();

-- Prices intentionally remain null until the commercial offer is approved.
insert into public.billing_plans
  (code, name, description, price_cents, billing_interval, trial_days, features)
values
  ('essencial', 'Essencial', 'Para organizar a rotina da sua barbearia.', null, 'month', 14,
    '["Agenda e clientes", "Serviços e financeiro"]'::jsonb),
  ('profissional', 'Profissional', 'Mais controle para equipes em crescimento.', null, 'month', 14,
    '["Tudo do Essencial", "Equipe e permissões", "Relatórios"]'::jsonb),
  ('premium', 'Premium', 'Estrutura preparada para operações maiores.', null, 'month', 14,
    '["Tudo do Profissional", "Suporte prioritário", "Recursos avançados"]'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  billing_interval = excluded.billing_interval,
  trial_days = excluded.trial_days,
  features = excluded.features,
  updated_at = now();

-- Give existing tenants a visible trial without inventing a price or a
-- provider subscription. New tenants can be initialized by the same trigger.
insert into public.tenant_subscriptions
  (tenant_id, plan_id, status, current_period_start, trial_ends_at)
select
  shop.id,
  plan.id,
  'trialing',
  now(),
  now() + make_interval(days => plan.trial_days)
from public.barber_shops shop
cross join public.billing_plans plan
where plan.code = 'essencial'
on conflict (tenant_id) do nothing;

create or replace function public.initialize_tenant_billing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_plan_id uuid;
  default_trial_days integer;
begin
  select id, trial_days into default_plan_id, default_trial_days
  from public.billing_plans
  where code = 'essencial' and active
  limit 1;

  if default_plan_id is not null then
    insert into public.tenant_subscriptions
      (tenant_id, plan_id, status, current_period_start, trial_ends_at)
    values (
      new.id,
      default_plan_id,
      'trialing',
      now(),
      now() + make_interval(days => default_trial_days)
    )
    on conflict (tenant_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists barber_shop_initialize_billing on public.barber_shops;
create trigger barber_shop_initialize_billing
after insert on public.barber_shops
for each row execute function public.initialize_tenant_billing();

-- The browser can only request an intent for its own tenant. It cannot set a
-- provider id, price, status, period or any other payment result.
create or replace function public.request_subscription_plan(target_plan_code text)
returns public.tenant_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership public.barber_shop_members%rowtype;
  selected_plan public.billing_plans%rowtype;
  subscription public.tenant_subscriptions%rowtype;
begin
  select * into current_membership
  from public.barber_shop_members
  where user_id = auth.uid()
  limit 1;

  if current_membership.tenant_id is null or current_membership.role <> 'owner' then
    raise exception 'Apenas o proprietário pode alterar a intenção do plano.';
  end if;

  select * into selected_plan
  from public.billing_plans
  where code = lower(trim(target_plan_code))
    and active;

  if selected_plan.id is null then
    raise exception 'Plano não encontrado ou indisponível.';
  end if;

  insert into public.tenant_subscriptions (
    tenant_id, plan_id, requested_plan_id, provider, status,
    current_period_start
  )
  values (
    current_membership.tenant_id, selected_plan.id, selected_plan.id,
    'mercado_pago', 'pending', now()
  )
  on conflict (tenant_id) do update set
    requested_plan_id = excluded.requested_plan_id,
    status = case
      when tenant_subscriptions.plan_id = excluded.requested_plan_id
        then case when tenant_subscriptions.status = 'canceled' then 'pending' else tenant_subscriptions.status end
      else 'pending'
    end,
    updated_at = now()
  returning * into subscription;

  return subscription;
end;
$$;

alter table public.billing_plans enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_payment_events enable row level security;

revoke all on public.billing_plans from anon, authenticated;
revoke all on public.tenant_subscriptions from anon, authenticated;
revoke all on public.billing_payment_events from anon, authenticated;
grant select on public.billing_plans to authenticated;
grant select on public.tenant_subscriptions to authenticated;

drop policy if exists "authenticated users can view active billing plans" on public.billing_plans;
create policy "authenticated users can view active billing plans"
on public.billing_plans
for select to authenticated
using (active = true);

drop policy if exists "members can view tenant subscription" on public.tenant_subscriptions;
create policy "members can view tenant subscription"
on public.tenant_subscriptions
for select to authenticated
using (
  exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = tenant_subscriptions.tenant_id
      and member.user_id = auth.uid()
  )
);

revoke all on function public.initialize_tenant_billing() from public;
revoke all on function public.request_subscription_plan(text) from public;
grant execute on function public.request_subscription_plan(text) to authenticated;
