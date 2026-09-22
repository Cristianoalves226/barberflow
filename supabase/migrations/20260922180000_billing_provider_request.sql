-- Allow the application to explicitly choose the billing provider when
-- creating a subscription intent. The existing one-argument RPC remains
-- available for backward compatibility and continues to default to Mercado Pago.

create or replace function public.request_subscription_plan(
  target_plan_code text,
  target_provider text default 'mercado_pago'
)
returns public.tenant_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership public.barber_shop_members%rowtype;
  selected_plan public.billing_plans%rowtype;
  subscription public.tenant_subscriptions%rowtype;
  normalized_provider text;
begin
  normalized_provider := lower(trim(target_provider));

  if normalized_provider not in ('mercado_pago', 'cakto') then
    raise exception 'Provedor de cobrança inválido.';
  end if;

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
    normalized_provider,
    'pending',
    now()
  )
  on conflict (tenant_id) do update set
    requested_plan_id = excluded.requested_plan_id,
    provider = excluded.provider,
    provider_customer_id = null,
    provider_product_id = null,
    provider_offer_id = null,
    provider_subscription_id = null,
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

revoke all on function public.request_subscription_plan(text, text) from public;
grant execute on function public.request_subscription_plan(text, text) to authenticated;
