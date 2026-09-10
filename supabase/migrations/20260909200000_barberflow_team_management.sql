-- BarberFlow team management
-- Invitations are requests until the trusted signup trigger or an optional
-- server-side completion process accepts them.

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.barber_shops(id) on delete cascade,
  email text not null check (char_length(trim(email)) > 3),
  role text not null check (role in ('barber', 'manager')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_invitations_tenant_status_idx
  on public.team_invitations (tenant_id, status, created_at desc);
create unique index if not exists team_invitations_pending_email_idx
  on public.team_invitations (tenant_id, lower(email))
  where status = 'pending';

create or replace function public.is_team_admin(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.barber_shop_members member
    where member.tenant_id = target_tenant_id
      and member.user_id = auth.uid()
      and member.role in ('owner', 'manager')
  );
$$;

create or replace function public.get_team_members()
returns table (
  user_id uuid,
  email text,
  role text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select member.user_id, users.email::text, member.role, member.created_at
  from public.barber_shop_members member
  join auth.users users on users.id = member.user_id
  where member.tenant_id = (
    select own_membership.tenant_id
    from public.barber_shop_members own_membership
    where own_membership.user_id = auth.uid()
    limit 1
  )
  and exists (
    select 1
    from public.barber_shop_members viewer
    where viewer.tenant_id = member.tenant_id
      and viewer.user_id = auth.uid()
  )
  order by member.created_at;
$$;

create or replace function public.create_team_invitation(
  target_email text,
  target_role text
)
returns public.team_invitations
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership public.barber_shop_members%rowtype;
  invitation public.team_invitations%rowtype;
  normalized_email text;
begin
  normalized_email := lower(trim(target_email));
  if normalized_email is null
    or position('@' in normalized_email) < 2
    or target_role not in ('barber', 'manager') then
    raise exception 'Convite inválido.';
  end if;

  select * into current_membership
  from public.barber_shop_members
  where user_id = auth.uid()
  limit 1;

  if current_membership.tenant_id is null
    or current_membership.role not in ('owner', 'manager') then
    raise exception 'Apenas proprietários e gerentes podem convidar membros.';
  end if;

  if exists (
    select 1
    from auth.users existing_user
    join public.barber_shop_members existing_member
      on existing_member.user_id = existing_user.id
    where existing_member.tenant_id = current_membership.tenant_id
      and lower(existing_user.email) = normalized_email
  ) then
    raise exception 'Este e-mail já faz parte da equipe.';
  end if;

  insert into public.team_invitations (tenant_id, email, role, invited_by)
  values (current_membership.tenant_id, normalized_email, target_role, auth.uid())
  returning * into invitation;

  return invitation;
exception
  when unique_violation then
    raise exception 'Já existe um convite pendente para este e-mail.';
end;
$$;

create or replace function public.update_team_member_role(
  target_user_id uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership public.barber_shop_members%rowtype;
begin
  if target_role not in ('barber', 'manager') then
    raise exception 'Função inválida.';
  end if;

  select * into current_membership
  from public.barber_shop_members
  where user_id = auth.uid()
  limit 1;

  if current_membership.tenant_id is null
    or current_membership.role not in ('owner', 'manager') then
    raise exception 'Apenas proprietários e gerentes podem alterar funções.';
  end if;

  update public.barber_shop_members
  set role = target_role
  where tenant_id = current_membership.tenant_id
    and user_id = target_user_id
    and user_id <> auth.uid()
    and role <> 'owner';

  if not found then
    raise exception 'Membro não encontrado ou não pode ser alterado.';
  end if;
end;
$$;

create or replace function public.remove_team_member(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_membership public.barber_shop_members%rowtype;
begin
  select * into current_membership
  from public.barber_shop_members
  where user_id = auth.uid()
  limit 1;

  if current_membership.tenant_id is null
    or current_membership.role not in ('owner', 'manager') then
    raise exception 'Apenas proprietários e gerentes podem remover membros.';
  end if;

  delete from public.barber_shop_members
  where tenant_id = current_membership.tenant_id
    and user_id = target_user_id
    and user_id <> auth.uid()
    and role <> 'owner';

  if not found then
    raise exception 'Membro não encontrado ou não pode ser removido.';
  end if;
end;
$$;

alter table public.team_invitations enable row level security;

revoke all on public.team_invitations from anon;
revoke all on public.team_invitations from authenticated;
grant select on public.team_invitations to authenticated;

drop policy if exists "team admins and invitees can view invitations" on public.team_invitations;
create policy "team admins and invitees can view invitations"
on public.team_invitations
for select
to authenticated
using (
  public.is_team_admin(tenant_id)
  or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "members can view their team" on public.barber_shop_members;
create policy "members can view their team"
on public.barber_shop_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_team_admin(tenant_id)
);

revoke all on function public.is_team_admin(uuid) from public;
revoke all on function public.get_team_members() from public;
revoke all on function public.create_team_invitation(text, text) from public;
revoke all on function public.update_team_member_role(uuid, text) from public;
revoke all on function public.remove_team_member(uuid) from public;
grant execute on function public.is_team_admin(uuid) to authenticated;
grant execute on function public.get_team_members() to authenticated;
grant execute on function public.create_team_invitation(text, text) to authenticated;
grant execute on function public.update_team_member_role(uuid, text) to authenticated;
grant execute on function public.remove_team_member(uuid) to authenticated;

drop trigger if exists team_invitations_set_updated_at on public.team_invitations;
create trigger team_invitations_set_updated_at
before update on public.team_invitations
for each row execute function public.set_updated_at();

-- New accounts with one unambiguous pending invitation join that tenant
-- during the existing auth trigger. This avoids any privileged client flow.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_shop_id uuid;
  requested_shop_name text;
  pending_invitation public.team_invitations%rowtype;
  pending_invitation_count integer;
begin
  select count(*) into pending_invitation_count
  from public.team_invitations
  where lower(email) = lower(new.email)
    and status = 'pending'
    and expires_at > now();

  if pending_invitation_count = 1 then
    select * into pending_invitation
    from public.team_invitations
    where lower(email) = lower(new.email)
      and status = 'pending'
      and expires_at > now()
    limit 1;

    insert into public.barber_shop_members (tenant_id, user_id, role)
    values (pending_invitation.tenant_id, new.id, pending_invitation.role);

    update public.team_invitations
    set status = 'accepted', accepted_at = now()
    where id = pending_invitation.id;

    return new;
  end if;

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
