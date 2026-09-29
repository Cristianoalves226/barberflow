-- BarberFlow: billing provider abstraction for Cakto + Mercado Pago.
-- This migration only prepares the billing model. It does not activate Cakto
-- checkout or change the existing Mercado Pago flow.

alter table public.tenant_subscriptions
  add column if not exists provider_customer_id text,
  add column if not exists provider_product_id text,
  add column if not exists provider_offer_id text;

alter table public.billing_payment_events
  drop constraint if exists billing_payment_events_provider_check;

alter table public.billing_payment_events
  add constraint billing_payment_events_provider_check
  check (provider in ('mercado_pago', 'cakto'));

alter table public.tenant_subscriptions
  drop constraint if exists tenant_subscriptions_provider_check;

alter table public.tenant_subscriptions
  add constraint tenant_subscriptions_provider_check
  check (provider in ('mercado_pago', 'cakto'));

create index if not exists tenant_subscriptions_provider_customer_idx
  on public.tenant_subscriptions (provider, provider_customer_id)
  where provider_customer_id is not null;

create index if not exists tenant_subscriptions_provider_product_idx
  on public.tenant_subscriptions (provider, provider_product_id)
  where provider_product_id is not null;

create index if not exists tenant_subscriptions_provider_offer_idx
  on public.tenant_subscriptions (provider, provider_offer_id)
  where provider_offer_id is not null;

-- Keep the existing provider when changing a plan. The trusted checkout
-- integration is responsible for assigning the provider-specific identifiers.
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
    current_membership.tenant_id,
    selected_plan.id,
    selected_plan.id,
    'mercado_pago',
    'pending',
    now()
  )
  on conflict (tenant_id) do update set
    requested_plan_id = excluded.requested_plan_id,
    status = case
      when tenant_subscriptions.plan_id = excluded.requested_plan_id
        then case
          when tenant_subscriptions.status = 'canceled' then 'pending'
          else tenant_subscriptions.status
        end
      else 'pending'
    end,
    updated_at = now()
  returning * into subscription;

  return subscription;
end;
$$;

revoke all on function public.request_subscription_plan(text) from public;
grant execute on function public.request_subscription_plan(text) to authenticated;

comment on column public.tenant_subscriptions.provider is
  'Billing provider used by the tenant subscription: mercado_pago or cakto.';

comment on column public.tenant_subscriptions.provider_customer_id is
  'Provider-side customer identifier, when supplied by the billing provider.';

comment on column public.tenant_subscriptions.provider_product_id is
  'Provider-side product identifier used to map the commercial plan.';

comment on column public.tenant_subscriptions.provider_offer_id is
  'Provider-side offer/price identifier used to map the commercial plan.';

comment on table public.billing_payment_events is
  'Provider-neutral billing event ledger used for webhook idempotency and reconciliation.';
