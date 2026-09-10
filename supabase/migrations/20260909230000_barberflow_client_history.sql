-- BarberFlow richer clients and secure appointment history.
-- Run after the existing MVP, team management and appointment safety migrations.

alter table public.clients
  add column if not exists birthday date,
  add column if not exists preferences text;

create index if not exists clients_tenant_birthday_idx
  on public.clients (tenant_id, birthday);

-- SECURITY INVOKER keeps the caller's authentication context and RLS policies
-- in force while returning only appointments from the caller's tenant.
create or replace function public.get_client_history(target_client_id uuid)
returns table (
  id uuid,
  client_id uuid,
  service_id uuid,
  service_name text,
  barber_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  notes text,
  amount_cents integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    appointment.id,
    appointment.client_id,
    appointment.service_id,
    service.name,
    appointment.barber_name,
    appointment.starts_at,
    appointment.ends_at,
    appointment.status,
    appointment.notes,
    service.price_cents
  from public.appointments appointment
  join public.clients client
    on client.id = appointment.client_id
   and client.tenant_id = appointment.tenant_id
  join public.services service
    on service.id = appointment.service_id
   and service.tenant_id = appointment.tenant_id
  where appointment.client_id = target_client_id
    and exists (
      select 1
      from public.barber_shop_members member
      where member.tenant_id = appointment.tenant_id
        and member.user_id = auth.uid()
    )
  order by appointment.starts_at desc;
$$;

revoke all on function public.get_client_history(uuid) from public;
grant execute on function public.get_client_history(uuid) to authenticated;
