import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse, jsonResponse, mercadoPagoRequest } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceRoleKey);

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validSignature(request: Request, dataId: string) {
  const secret = Deno.env.get('MP_WEBHOOK_SECRET');
  const signature = request.headers.get('x-signature');
  const requestId = request.headers.get('x-request-id');
  if (!secret || !signature || !requestId) return false;

  const values = Object.fromEntries(signature.split(',').map((part) => {
    const [key, value] = part.trim().split('=');
    return [key, value];
  }));
  if (!values.ts || !values.v1) return false;

  const manifest = `id:${dataId};request-id:${requestId};ts:${values.ts};`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)));
  return expected === values.v1;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Método não permitido.', 405);

  const url = new URL(request.url);
  const payload = await request.json().catch(() => null);
  const dataId = String(payload?.data?.id || url.searchParams.get('data.id') || '');
  const eventType = String(payload?.type || url.searchParams.get('type') || url.searchParams.get('topic') || '');
  if (!dataId || !await validSignature(request, dataId)) return errorResponse('Assinatura do webhook inválida.', 401);

  const providerEventId = `${eventType}:${dataId}`;
  const { error: eventError } = await admin
    .from('billing_payment_events')
    .insert({
      provider_event_id: providerEventId,
      event_type: eventType || 'unknown',
      provider_subscription_id: dataId,
      payload,
    });
  if (eventError?.code === '23505') return jsonResponse({ received: true, duplicate: true });
  if (eventError) return errorResponse('Não foi possível registrar o evento.', 500);

  try {
    const preapproval = await mercadoPagoRequest(`/preapproval/${encodeURIComponent(dataId)}`);
    const tenantId = preapproval.external_reference;
    if (!tenantId) return jsonResponse({ received: true });

    const statusMap: Record<string, string> = {
      authorized: 'active',
      paused: 'past_due',
      cancelled: 'canceled',
      pending: 'pending',
    };
    const status = statusMap[preapproval.status] || 'incomplete';
    const { data: subscription } = await admin
      .from('tenant_subscriptions')
      .select('id')
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!subscription) return jsonResponse({ received: true });

    const { error: updateError } = await admin
      .from('tenant_subscriptions')
      .update({
        provider_subscription_id: dataId,
        status,
        current_period_start: preapproval.date_created || null,
        current_period_end: preapproval.next_payment_date || null,
        canceled_at: status === 'canceled' ? new Date().toISOString() : null,
      })
      .eq('id', subscription.id);
    if (updateError) throw updateError;

    await admin
      .from('billing_payment_events')
      .update({ tenant_id: tenantId, processed_at: new Date().toISOString() })
      .eq('provider_event_id', providerEventId)
      .eq('provider', 'mercado_pago');

    return jsonResponse({ received: true });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Falha ao processar webhook.', 502);
  }
});
