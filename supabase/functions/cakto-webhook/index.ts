import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const webhookSecret = Deno.env.get('CAKTO_WEBHOOK_SECRET')!;
const admin = createClient(supabaseUrl, serviceRoleKey);

const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

function bytesToHex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function validSignature(rawBody: string, timestamp: string, signature: string) {
  if (!webhookSecret || !timestamp || !signature) return false;

  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber)) return false;
  if (Math.abs(Date.now() / 1000 - timestampNumber) > TIMESTAMP_TOLERANCE_SECONDS) return false;

  const expectedKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const digest = bytesToHex(
    await crypto.subtle.sign(
      'HMAC',
      expectedKey,
      new TextEncoder().encode(`${timestamp}.${rawBody}`),
    ),
  );

  const candidates = signature
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.startsWith('v1='));

  return candidates.some((candidate) => safeEqual(candidate, `v1=${digest}`));
}

function asOrderList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (data && typeof data === 'object') return [data as Record<string, unknown>];
  return [];
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function eventStatus(event: string) {
  switch (event) {
    case 'purchase_approved':
    case 'subscription_created':
    case 'subscription_renewed':
    case 'subscription_resumed':
    case 'subscription_late_recovered':
      return 'active';
    case 'subscription_renewal_refused':
    case 'subscription_paused':
    case 'subscription_late':
      return 'past_due';
    case 'subscription_canceled':
    case 'refund':
    case 'chargeback':
      return 'canceled';
    case 'purchase_refused':
      return 'incomplete';
    default:
      return null;
  }
}

function subscriptionId(data: Record<string, unknown>) {
  const subscription = data.subscription;
  if (!subscription || typeof subscription !== 'object') return '';
  const record = subscription as Record<string, unknown>;
  return String(record.id ?? record.subscriptionId ?? '');
}

async function resolveTenant(data: Record<string, unknown>) {
  const callback = String(data.callback ?? '').trim();
  if (!callback || !isUuid(callback)) return null;

  const { data: membership, error } = await admin
    .from('barber_shop_members')
    .select('tenant_id, user_id, role')
    .eq('tenant_id', callback)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (error || !membership) return null;

  const customer = data.customer;
  const customerEmail = customer && typeof customer === 'object'
    ? String((customer as Record<string, unknown>).email ?? '').trim().toLowerCase()
    : '';

  if (!customerEmail) return null;

  const { data: ownerData, error: ownerError } = await admin.auth.admin.getUserById(
    String(membership.user_id),
  );

  if (ownerError || !ownerData.user?.email) return null;

  const ownerEmail = ownerData.user.email.trim().toLowerCase();
  if (!safeEqual(ownerEmail, customerEmail)) return null;

  return {
    tenantId: String(membership.tenant_id),
    userId: String(membership.user_id),
  };
}

async function processOrder(event: string, data: Record<string, unknown>) {
  const providerEventId = `${event}:${String(data.id ?? '')}`;
  if (!data.id) return { processed: false, reason: 'missing_order_id' };

  const tenant = await resolveTenant(data);
  if (!tenant) {
    console.error('CAKTO_TENANT_NOT_RESOLVED', {
      event,
      orderId: String(data.id),
      hasCallback: Boolean(data.callback),
      customerEmailPresent: Boolean(
        data.customer && typeof data.customer === 'object'
          ? (data.customer as Record<string, unknown>).email
          : false,
      ),
    });
    return { processed: false, reason: 'tenant_not_resolved' };
  }

  const status = eventStatus(event);
  const providerSubscriptionId = subscriptionId(data);
  const offer = data.offer && typeof data.offer === 'object'
    ? data.offer as Record<string, unknown>
    : null;
  const offerId = String(offer?.id ?? '');
  const product = data.product && typeof data.product === 'object'
    ? data.product as Record<string, unknown>
    : null;
  const productId = String(product?.id ?? '');

  const { data: subscription, error: subscriptionError } = await admin
    .from('tenant_subscriptions')
    .select('id, requested_plan_id, plan_id, provider')
    .eq('tenant_id', tenant.tenantId)
    .maybeSingle();

  if (subscriptionError) throw subscriptionError;
  if (!subscription) return { processed: false, reason: 'subscription_not_found' };

  const update: Record<string, unknown> = {
    provider: 'cakto',
    provider_customer_id: data.customer && typeof data.customer === 'object'
      ? String((data.customer as Record<string, unknown>).id ?? '')
      : null,
    provider_product_id: productId || null,
    provider_offer_id: offerId || null,
  };

  if (providerSubscriptionId) update.provider_subscription_id = providerSubscriptionId;
  if (status) update.status = status;

  if (status === 'active' && subscription.requested_plan_id) {
    update.plan_id = subscription.requested_plan_id;
  }

  if (status === 'active') {
    update.canceled_at = null;
    update.cancel_at_period_end = false;
  }

  if (status === 'canceled') {
    update.canceled_at = String(data.canceledAt ?? data.refundedAt ?? new Date().toISOString());
    update.cancel_at_period_end = true;
  }

  if (status === 'past_due') {
    update.cancel_at_period_end = false;
  }

  if (data.createdAt) update.current_period_start = String(data.createdAt);
  if (data.paidAt && status === 'active') update.current_period_start = String(data.paidAt);

  const { error: updateError } = await admin
    .from('tenant_subscriptions')
    .update(update)
    .eq('id', subscription.id);

  if (updateError) throw updateError;

  const { error: eventUpdateError } = await admin
    .from('billing_payment_events')
    .update({
      tenant_id: tenant.tenantId,
      provider_subscription_id: providerSubscriptionId || null,
      processed_at: new Date().toISOString(),
    })
    .eq('provider', 'cakto')
    .eq('provider_event_id', providerEventId);

  if (eventUpdateError) throw eventUpdateError;

  console.log('CAKTO_WEBHOOK_PROCESSED', {
    event,
    orderId: String(data.id),
    tenantId: tenant.tenantId,
    status,
    offerId: offerId || null,
    productId: productId || null,
    hasProviderSubscriptionId: Boolean(providerSubscriptionId),
  });

  return { processed: true, status };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse('Método não permitido.', 405);
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get('X-Cakto-Timestamp') ?? '';
  const signature = request.headers.get('X-Cakto-Signature') ?? '';

  if (!await validSignature(rawBody, timestamp, signature)) {
    console.error('CAKTO_INVALID_SIGNATURE', {
      hasTimestamp: Boolean(timestamp),
      hasSignature: Boolean(signature),
      bodyLength: rawBody.length,
    });
    return errorResponse('Assinatura do webhook inválida.', 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return errorResponse('JSON inválido.', 400);
  }

  if (webhookSecret && String(payload.secret ?? '') !== webhookSecret) {
    return errorResponse('Webhook não autorizado.', 401);
  }

  const event = String(payload.event ?? '').trim();
  if (!event) return errorResponse('Evento não informado.', 400);

  if (event === 'checkout_abandonment') {
    return jsonResponse({ received: true, ignored: true, event });
  }

  const orders = asOrderList(payload.data);
  if (!orders.length) return errorResponse('Dados do pedido não informados.', 400);

  const results = [];

  for (const data of orders) {
    const orderId = String(data.id ?? '');
    if (!orderId) continue;

    const providerEventId = `${event}:${orderId}`;

    const { error: eventError } = await admin
      .from('billing_payment_events')
      .insert({
        provider: 'cakto',
        provider_event_id: providerEventId,
        event_type: event,
        provider_subscription_id: subscriptionId(data) || null,
        payload,
      });

    if (eventError?.code === '23505') {
      results.push({ orderId, duplicate: true });
      continue;
    }

    if (eventError) {
      console.error('CAKTO_EVENT_INSERT_ERROR', eventError);
      return errorResponse('Não foi possível registrar o evento.', 500);
    }

    try {
      results.push({
        orderId,
        ...(await processOrder(event, data)),
      });
    } catch (error) {
      console.error('CAKTO_WEBHOOK_PROCESSING_ERROR', {
        event,
        orderId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return errorResponse('Falha ao processar webhook.', 500);
    }
  }

  return jsonResponse({ received: true, event, results });
});
