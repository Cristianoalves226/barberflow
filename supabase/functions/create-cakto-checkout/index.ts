import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceRoleKey);

const planConfig: Record<string, { urlEnv: string; offerEnv: string }> = {
  essencial: {
    urlEnv: 'CAKTO_ESSENCIAL_CHECKOUT_URL',
    offerEnv: 'CAKTO_ESSENCIAL_OFFER_ID',
  },
  profissional: {
    urlEnv: 'CAKTO_PROFISSIONAL_CHECKOUT_URL',
    offerEnv: 'CAKTO_PROFISSIONAL_OFFER_ID',
  },
  premium: {
    urlEnv: 'CAKTO_PREMIUM_CHECKOUT_URL',
    offerEnv: 'CAKTO_PREMIUM_OFFER_ID',
  },
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return errorResponse('Método não permitido.', 405);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return errorResponse('Autenticação obrigatória.', 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return errorResponse('Sessão inválida ou expirada.', 401);
  }

  const body = await request.json().catch(() => null);
  const planCode = String(body?.planCode ?? '').trim().toLowerCase();
  const config = planConfig[planCode];

  if (!config) {
    return errorResponse('Plano Cakto inválido.', 400);
  }

  const checkoutBaseUrl = Deno.env.get(config.urlEnv)?.trim();
  const offerId = Deno.env.get(config.offerEnv)?.trim();

  if (!checkoutBaseUrl) {
    return errorResponse(`Configure ${config.urlEnv} antes de iniciar o checkout.`, 503);
  }

  const { data: membership, error: membershipError } = await admin
    .from('barber_shop_members')
    .select('tenant_id, role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (membershipError) return errorResponse('Não foi possível validar a barbearia.', 500);
  if (!membership || membership.role !== 'owner') {
    return errorResponse('Apenas o proprietário pode iniciar a assinatura.', 403);
  }

  const { data: subscription, error: subscriptionError } = await userClient
    .rpc('request_subscription_plan', {
      target_plan_code: planCode,
      target_provider: 'cakto',
    });

  if (subscriptionError || !subscription) {
    console.error('CAKTO_PLAN_REQUEST_ERROR', subscriptionError);
    return errorResponse('Não foi possível preparar a assinatura Cakto.', 500);
  }

  const url = new URL(checkoutBaseUrl);
  url.searchParams.set('callback', membership.tenant_id);

  const { error: updateError } = await admin
    .from('tenant_subscriptions')
    .update({
      provider: 'cakto',
      provider_offer_id: offerId || null,
      provider_product_id: Deno.env.get('CAKTO_PRODUCT_ID')?.trim() || null,
      status: 'pending',
    })
    .eq('id', subscription.id)
    .eq('tenant_id', membership.tenant_id);

  if (updateError) {
    console.error('CAKTO_SUBSCRIPTION_PREPARE_ERROR', updateError);
    return errorResponse('Não foi possível preparar o checkout Cakto.', 500);
  }

  console.log('CAKTO_CHECKOUT_CREATED', {
    tenantId: membership.tenant_id,
    planCode,
    hasOfferId: Boolean(offerId),
    hasProductId: Boolean(Deno.env.get('CAKTO_PRODUCT_ID')),
  });

  return jsonResponse({
    planCode,
    checkoutUrl: url.toString(),
    status: 'pending',
  });
});
