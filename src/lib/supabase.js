import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('seu-projeto') &&
    !supabaseAnonKey.includes('sua-chave')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function getAuthRedirectUrl() {
  if (typeof window === 'undefined') return undefined;

  const configuredBasePath = import.meta.env.BASE_URL;
  const currentPath = window.location.pathname || '/';
  const lastSegment = currentPath.slice(currentPath.lastIndexOf('/') + 1);
  const currentDirectory = currentPath.endsWith('/')
    ? currentPath
    : /\.[^/]+$/.test(lastSegment)
      ? `${currentPath.slice(0, currentPath.lastIndexOf('/') + 1) || '/'}`
      : `${currentPath}/`;
  const basePath =
    configuredBasePath && configuredBasePath !== '/'
      ? configuredBasePath
      : currentDirectory || '/';

  return new URL(basePath, window.location.origin).toString();
}

export async function getAuthSession() {
  const { data, error } = await requireClient().auth.getSession();
  throwIfError(error);
  return data.session;
}

export function subscribeToAuthState(callback) {
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => subscription?.unsubscribe();
}

export async function signInWithPassword({ email, password }) {
  const { data, error } = await requireClient().auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  throwIfError(error);
  return data.session;
}

export async function signUpWithPassword({ email, password, shopName }) {
  const { data, error } = await requireClient().auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        shop_name: shopName.trim(),
      },
    },
  });
  throwIfError(error);
  return data;
}

export async function resetPasswordForEmail(email) {
  const { error } = await requireClient().auth.resetPasswordForEmail(email.trim(), {
    redirectTo: getAuthRedirectUrl(),
  });
  throwIfError(error);
}

export async function updatePassword(password) {
  const { data, error } = await requireClient().auth.updateUser({ password });
  throwIfError(error);
  return data.user;
}

export async function signOut() {
  const { error } = await requireClient().auth.signOut();
  throwIfError(error);
}

const money = (cents) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format((cents || 0) / 100);

const dateLabel = (date) =>
  date
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(`${date}T12:00:00`))
    : '—';

const timeLabel = (date) =>
  new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));

const dateKeyFromTimestamp = (timestamp) => {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const appointmentTimestamp = (date, time) =>
  new Date(`${date}T${time}:00`).toISOString();

const statusLabels = {
  scheduled: 'Agendado',
  confirmed: 'Confirmado',
  in_progress: 'Em atendimento',
  completed: 'Concluído',
  cancelled: 'Cancelado',
};

function requireClient() {
  if (!supabase) {
    throw new Error('Supabase não está configurado.');
  }
  return supabase;
}

function throwIfError(error) {
  if (error) {
    throw new Error(`Supabase: ${error.message}`);
  }
}

function throwAppointmentError(error) {
  if (!error) return;
  if (
    error.code === '23P01' ||
    error.message?.includes('appointments_active_barber_no_overlap')
  ) {
    throw new Error(
      'Conflito de horário: este barbeiro já possui um atendimento nesse período. Escolha outro horário ou barbeiro.'
    );
  }
  throwIfError(error);
}

async function getCurrentMembership() {
  const session = await getAuthSession();
  if (!session?.user) {
    throw new Error('Sua sessão expirou. Entre novamente para continuar.');
  }

  const { data, error } = await requireClient()
    .from('barber_shop_members')
    .select('tenant_id, role, barber_shops(id, name)')
    .eq('user_id', session.user.id)
    .maybeSingle();
  throwIfError(error);

  if (!data?.tenant_id) {
    throw new Error('Sua conta ainda não possui uma barbearia vinculada.');
  }

  return data;
}

async function getCurrentTenantId() {
  return (await getCurrentMembership()).tenant_id;
}

export async function loadTeamData() {
  const client = requireClient();
  const membership = await getCurrentMembership();
  const [membersResult, invitationsResult] = await Promise.all([
    client.rpc('get_team_members'),
    client
      .from('team_invitations')
      .select('id, email, role, status, expires_at, created_at')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false }),
  ]);

  throwIfError(membersResult.error);
  throwIfError(invitationsResult.error);

  return {
    role: membership.role,
    members: (membersResult.data || []).map((member) => ({
      id: member.user_id,
      email: member.email || 'E-mail não disponível',
      role: member.role,
      createdAt: member.created_at,
    })),
    invitations: (invitationsResult.data || []).map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expires_at,
      createdAt: invitation.created_at,
    })),
  };
}

export const mercadoPagoCheckoutReady = true;

export async function loadBillingData() {
  const client = requireClient();
  const membership = await getCurrentMembership();
  const [plansResult, subscriptionResult] = await Promise.all([
    client
      .from('billing_plans')
      .select(
        'id, code, name, description, price_cents, currency, billing_interval, trial_days, features, active'
      )
      .eq('active', true)
      .order('price_cents', { ascending: true, nullsFirst: true }),
    client
      .from('tenant_subscriptions')
      .select(
        'id, plan_id, requested_plan_id, provider, status, current_period_start, current_period_end, trial_ends_at, canceled_at, cancel_at_period_end, plan:billing_plans!tenant_subscriptions_plan_id_fkey(id, code, name, description, price_cents, currency, billing_interval, trial_days, features)'
      )
      .eq('tenant_id', membership.tenant_id)
      .maybeSingle(),
  ]);

  throwIfError(plansResult.error);
  throwIfError(subscriptionResult.error);

  return {
    role: membership.role,
    plans: (plansResult.data || []).map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      priceCents: plan.price_cents,
      currency: plan.currency,
      billingInterval: plan.billing_interval,
      trialDays: plan.trial_days,
      features: Array.isArray(plan.features) ? plan.features : [],
    })),
    subscription: subscriptionResult.data
      ? {
          id: subscriptionResult.data.id,
          planId: subscriptionResult.data.plan_id,
          requestedPlanId: subscriptionResult.data.requested_plan_id,
          provider: subscriptionResult.data.provider,
          status: subscriptionResult.data.status,
          currentPeriodStart: subscriptionResult.data.current_period_start,
          currentPeriodEnd: subscriptionResult.data.current_period_end,
          trialEndsAt: subscriptionResult.data.trial_ends_at,
          canceledAt: subscriptionResult.data.canceled_at,
          cancelAtPeriodEnd: subscriptionResult.data.cancel_at_period_end,
          plan: subscriptionResult.data.plan
            ? {
                id: subscriptionResult.data.plan.id,
                code: subscriptionResult.data.plan.code,
                name: subscriptionResult.data.plan.name,
                description: subscriptionResult.data.plan.description,
                priceCents: subscriptionResult.data.plan.price_cents,
                currency: subscriptionResult.data.plan.currency,
                billingInterval: subscriptionResult.data.plan.billing_interval,
                trialDays: subscriptionResult.data.plan.trial_days,
                features: Array.isArray(subscriptionResult.data.plan.features)
                  ? subscriptionResult.data.plan.features
                  : [],
              }
            : null,
        }
      : null,
    checkoutReady: mercadoPagoCheckoutReady,
  };
}

export async function requestSubscriptionPlan(planCode) {
  if (!planCode?.trim()) {
    throw new Error('Selecione um plano antes de continuar.');
  }
  const { data, error } = await requireClient().rpc('request_subscription_plan', {
    target_plan_code: planCode.trim(),
  });
  throwIfError(error);
  return data;
}

export async function requestBillingCheckout() {
  if (!mercadoPagoCheckoutReady) {
    throw new Error(
      'Checkout ainda não disponível: configure uma Edge Function segura e o webhook do Mercado Pago antes de cobrar.'
    );
  }
  const { data, error } = await requireClient().functions.invoke('create-mercado-pago-subscription', {
    body: {},
  });
  throwIfError(error);

  if (!data?.initPoint) {
    throw new Error('O Mercado Pago não retornou uma URL de assinatura.');
  }

  return data;
}

export async function createTeamInvitation({ email, role }) {
  const { data, error } = await requireClient().rpc('create_team_invitation', {
    target_email: email.trim(),
    target_role: role,
  });
  throwIfError(error);
  return data;
}

export async function updateTeamMemberRole({ userId, role }) {
  const { error } = await requireClient().rpc('update_team_member_role', {
    target_user_id: userId,
    target_role: role,
  });
  throwIfError(error);
}

export async function removeTeamMember(userId) {
  const { error } = await requireClient().rpc('remove_team_member', {
    target_user_id: userId,
  });
  throwIfError(error);
}

export async function loadBarberFlowData() {
  const client = requireClient();
  const tenantId = await getCurrentTenantId();
  const [appointmentsResult, clientsResult, servicesResult, financeResult] =
    await Promise.all([
      client
        .from('appointments')
        .select(
          'id, client_id, service_id, barber_name, starts_at, ends_at, status, notes, cancelled_at, cancellation_reason, clients(name), services(name, price_cents)'
        )
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true }),
      client
        .from('clients')
        .select('id, name, phone, notes, birthday, preferences, last_visit_at, created_at')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true }),
      client
        .from('services')
        .select('id, name, duration_minutes, price_cents, active')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .order('name', { ascending: true }),
      client
        .from('finance_movements')
        .select('id, type, amount_cents, description, occurred_on, created_at')
        .eq('tenant_id', tenantId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false }),
    ]);

  [appointmentsResult, clientsResult, servicesResult, financeResult].forEach(
    (result) => throwIfError(result.error)
  );

  const serviceCounts = appointmentsResult.data.reduce((counts, appointment) => {
    counts[appointment.service_id] = (counts[appointment.service_id] || 0) + 1;
    return counts;
  }, {});

  return {
    appointments: appointmentsResult.data.map((appointment) => ({
      id: appointment.id,
      date: dateKeyFromTimestamp(appointment.starts_at),
      time: timeLabel(appointment.starts_at),
      client: appointment.clients?.name || 'Cliente removido',
      clientId: appointment.client_id,
      service: appointment.services?.name || 'Serviço removido',
      serviceId: appointment.service_id,
      amountCents: appointment.services?.price_cents || 0,
      barber: appointment.barber_name,
      status: statusLabels[appointment.status] || appointment.status,
      statusKey: appointment.status,
      endsAt: appointment.ends_at,
      notes: appointment.notes || '',
      cancelledAt: appointment.cancelled_at,
      cancellationReason: appointment.cancellation_reason || '',
    })),
    clients: clientsResult.data.map((clientRow) => ({
      id: clientRow.id,
      name: clientRow.name,
      phone: clientRow.phone || '—',
      notes: clientRow.notes || '',
      birthday: clientRow.birthday || '',
      preferences: clientRow.preferences || '',
      lastVisitAt: clientRow.last_visit_at,
      last: dateLabel(clientRow.last_visit_at),
      totalCents: 0,
      total: money(0),
    })),
    services: servicesResult.data.map((service) => ({
      id: service.id,
      name: service.name,
      durationMinutes: service.duration_minutes,
      duration: `${service.duration_minutes} min`,
      priceCents: service.price_cents,
      price: money(service.price_cents),
      count: serviceCounts[service.id] || 0,
    })),
    finance: financeResult.data.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amountCents: movement.amount_cents,
      description: movement.description,
      date: movement.occurred_on,
      dateLabel: dateLabel(movement.occurred_on),
    })),
  };
}

export async function loadClientHistory(clientId) {
  const { data, error } = await requireClient().rpc('get_client_history', {
    target_client_id: clientId,
  });
  throwIfError(error);

  return (data || []).map((appointment) => ({
    id: appointment.id,
    clientId: appointment.client_id,
    serviceId: appointment.service_id,
    service: appointment.service_name || 'Serviço removido',
    barber: appointment.barber_name,
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    statusKey: appointment.status,
    notes: appointment.notes || '',
    amountCents: appointment.amount_cents || 0,
  }));
}

export async function createClientRecord({ name, phone, notes, birthday, preferences }) {
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('clients')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes?.trim() || null,
      birthday: birthday || null,
      preferences: preferences?.trim() || null,
    })
    .select('id')
    .single();
  throwIfError(error);
  return data;
}

export async function updateClientRecord({
  id,
  name,
  phone,
  notes,
  birthday,
  preferences,
}) {
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('clients')
    .update({
      name: name.trim(),
      phone: phone.trim() || null,
      notes: notes?.trim() || null,
      birthday: birthday || null,
      preferences: preferences?.trim() || null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .single();
  throwIfError(error);
  return data;
}

export async function updateAppointmentRecord({
  id,
  clientId,
  serviceId,
  date,
  time,
  barber,
  status,
  notes,
}) {
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('appointments')
    .update({
      client_id: clientId,
      service_id: serviceId,
      barber_name: barber.trim(),
      starts_at: appointmentTimestamp(date, time),
      status,
      notes: notes?.trim() || null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .single();
  throwAppointmentError(error);
  return data;
}

export async function cancelAppointmentRecord({ id, reason = '' }) {
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('appointments')
    .update({
      status: 'cancelled',
      cancellation_reason: reason.trim() || null,
    })
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .single();
  throwAppointmentError(error);
  return data;
}

export async function createServiceRecord({ name, durationMinutes, priceCents }) {
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('services')
    .insert({
      tenant_id: tenantId,
      name: name.trim(),
      duration_minutes: durationMinutes,
      price_cents: priceCents,
    })
    .select('id')
    .single();
  throwIfError(error);
  return data;
}

export async function createAppointmentRecord({
  clientId,
  serviceId,
  date,
  time,
  barber,
}) {
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('appointments')
    .insert({
      tenant_id: tenantId,
      client_id: clientId,
      service_id: serviceId,
      barber_name: barber.trim(),
      starts_at: appointmentTimestamp(date, time),
      status: 'scheduled',
    })
    .select('id')
    .single();
  throwAppointmentError(error);
  return data;
}

export async function createFinanceMovement({
  type,
  amountCents,
  description,
  date,
}) {
  if (!['income', 'expense'].includes(type)) {
    throw new Error('Tipo de movimentação inválido.');
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 2147483647) {
    throw new Error('O valor deve ser maior que zero e estar dentro do limite permitido.');
  }
  if (!description?.trim()) {
    throw new Error('Informe uma descrição para a movimentação.');
  }
  const parsedDate = new Date(`${date}T12:00:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date || '') ||
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    throw new Error('Informe uma data válida para a movimentação.');
  }
  const tenantId = await getCurrentTenantId();
  const { data, error } = await requireClient()
    .from('finance_movements')
    .insert({
      tenant_id: tenantId,
      type,
      amount_cents: amountCents,
      description: description.trim(),
      occurred_on: date,
    })
    .select('id')
    .single();
  throwIfError(error);
  return data;
}
