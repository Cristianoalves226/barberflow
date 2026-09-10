-- BarberFlow appointment scheduling safety
-- Run after the MVP and team management migrations.

create extension if not exists btree_gist;

alter table public.appointments
  add column if not exists ends_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text;

-- Existing appointments receive their end time from the service duration.
update public.appointments appointment
set ends_at = appointment.starts_at + make_interval(mins => service.duration_minutes)
from public.services service
where service.id = appointment.service_id
  and appointment.ends_at is null;

update public.appointments
set barber_name = btrim(barber_name)
where barber_name <> btrim(barber_name);

alter table public.appointments
  alter column ends_at set not null;

alter table public.appointments
  drop constraint if exists appointments_time_order_check;
alter table public.appointments
  add constraint appointments_time_order_check
  check (ends_at > starts_at);

create index if not exists appointments_tenant_barber_time_idx
  on public.appointments (tenant_id, lower(barber_name), starts_at, ends_at);

-- Keep the range authoritative even when a service or start time is edited.
create or replace function public.set_appointment_end_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  service_duration integer;
begin
  select duration_minutes
  into service_duration
  from public.services
  where id = new.service_id
    and tenant_id = new.tenant_id;

  if service_duration is null then
    raise exception 'O serviço selecionado não pertence a esta barbearia.';
  end if;

  new.barber_name := btrim(new.barber_name);
  new.ends_at := new.starts_at + make_interval(mins => service_duration);

  if new.status = 'cancelled' then
    new.cancelled_at := coalesce(new.cancelled_at, now());
  else
    new.cancelled_at := null;
    new.cancellation_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists appointments_set_end_at on public.appointments;
create trigger appointments_set_end_at
before insert or update of tenant_id, service_id, starts_at, barber_name, status
on public.appointments
for each row execute function public.set_appointment_end_at();

-- The exclusion constraint is tenant- and barber-scoped. Half-open ranges
-- allow one appointment to start exactly when the previous one ends.
alter table public.appointments
  drop constraint if exists appointments_active_barber_no_overlap;
alter table public.appointments
  add constraint appointments_active_barber_no_overlap
  exclude using gist (
    tenant_id with =,
    (lower(barber_name)) with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status in ('scheduled', 'confirmed', 'in_progress'));

alter table public.appointments enable row level security;
revoke all on public.appointments from anon;
grant select, insert, update, delete on public.appointments to authenticated;

drop policy if exists "members can access their appointments" on public.appointments;
create policy "members can access their appointments"
on public.appointments
for all
to authenticated
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
