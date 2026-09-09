import { createClient } from '@supabase/supabase-js';

export const DEMO_TENANT_ID = '00000000-0000-0000-0000-000000000001';

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

export async function loadBarberFlowData() {
  const client = requireClient();
  const [appointmentsResult, clientsResult, servicesResult, financeResult] =
    await Promise.all([
      client
        .from('appointments')
        .select(
          'id, client_id, service_id, barber_name, starts_at, status, clients(name), services(name, price_cents)'
        )
        .eq('tenant_id', DEMO_TENANT_ID)
        .order('starts_at', { ascending: true }),
      client
        .from('clients')
        .select('id, name, phone, last_visit_at, created_at')
        .eq('tenant_id', DEMO_TENANT_ID)
        .order('name', { ascending: true }),
      client
        .from('services')
        .select('id, name, duration_minutes, price_cents, active')
        .eq('tenant_id', DEMO_TENANT_ID)
        .eq('active', true)
        .order('name', { ascending: true }),
      client
        .from('finance_movements')
        .select('id, type, amount_cents, description, occurred_on, created_at')
        .eq('tenant_id', DEMO_TENANT_ID)
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
      date: appointment.starts_at.slice(0, 10),
      time: timeLabel(appointment.starts_at),
      client: appointment.clients?.name || 'Cliente removido',
      clientId: appointment.client_id,
      service: appointment.services?.name || 'Serviço removido',
      serviceId: appointment.service_id,
      amountCents: appointment.services?.price_cents || 0,
      barber: appointment.barber_name,
      status: statusLabels[appointment.status] || appointment.status,
      statusKey: appointment.status,
    })),
    clients: clientsResult.data.map((clientRow) => ({
      id: clientRow.id,
      name: clientRow.name,
      phone: clientRow.phone || '—',
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

export async function createClientRecord({ name, phone }) {
  const { data, error } = await requireClient()
    .from('clients')
    .insert({
      tenant_id: DEMO_TENANT_ID,
      name: name.trim(),
      phone: phone.trim() || null,
    })
    .select('id')
    .single();
  throwIfError(error);
  return data;
}

export async function createServiceRecord({ name, durationMinutes, priceCents }) {
  const { data, error } = await requireClient()
    .from('services')
    .insert({
      tenant_id: DEMO_TENANT_ID,
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
  const { data, error } = await requireClient()
    .from('appointments')
    .insert({
      tenant_id: DEMO_TENANT_ID,
      client_id: clientId,
      service_id: serviceId,
      barber_name: barber.trim(),
      starts_at: `${date}T${time}:00`,
      status: 'scheduled',
    })
    .select('id')
    .single();
  throwIfError(error);
  return data;
}

export async function createFinanceMovement({
  type,
  amountCents,
  description,
  date,
}) {
  const { data, error } = await requireClient()
    .from('finance_movements')
    .insert({
      tenant_id: DEMO_TENANT_ID,
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
