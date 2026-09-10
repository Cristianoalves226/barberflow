import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, errorResponse, jsonResponse, mercadoPagoRequest } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Método não permitido.', 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return errorResponse('Autenticação obrigatória.', 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return errorResponse('Sessão inválida ou expirada.', 401);

  const { data: membership, error: membershipError } = await admin
    .from('barber_shop_members')
    .select('tenant_id, role')
    .eq('user_id', userData.user.id)
    .maybeSingle();
  if (membershipError) return errorResponse('Não foi possível validar a barbearia.', 500);
  if (!membership || membership.role !== 'owner') return errorResponse('Apenas o proprietário pode iniciar a assinatura.', 403);

  const { data: subscription, error: subscriptionError } = await admin
    .from('tenant_subscriptions')
    .select('id, requested_plan_id, provider_subscription_id')
    .eq('tenant_id', membership.tenant_id)
    .maybeSingle();
  if (subscriptionError || !subscription?.requested_plan_id) {
    return errorResponse('Selecione um plano antes de iniciar a assinatura.');
  }
  const { data: plan, error: planError } = await admin
    .from('billing_plans')
    .select('id, name, price_cents, billing_interval, active')
    .eq('id', subscription.requested_plan_id)
    .eq('active', true)
    .maybeSingle();
  if (planError || !plan || !Number.isInteger(plan.price_cents) || plan.price_cents <= 0) {
    return errorResponse('O plano selecionado ainda não possui preço configurado.');
  }

  const baseUrl = Deno.env.get('PUBLIC_APP_URL') || 'https://cristianoalves226.github.io/barberflow/';
  const notificationUrl = `${supabaseUrl}/functions/v1/mercado-pago-webhook`;
  const testPayerEmail = Deno.env.get('MP_TEST_PAYER_EMAIL');
  const period = plan.billing_interval === 'year'
    ? { frequency: 1, frequency_type: 'years' }
    : { frequency: 1, frequency_type: 'months' };

  try {
    if (subscription.provider_subscription_id) {
      const existing = await mercadoPagoRequest(
        `/preapproval/${encodeURIComponent(subscription.provider_subscription_id)}`,
      );
      if (existing.status === 'authorized') {
        return errorResponse('Esta barbearia já possui uma assinatura ativa.', 409);
      }
      const existingInitPoint = existing.init_point || existing.sandbox_init_point;
      if (existingInitPoint) {
        return jsonResponse({
          id: existing.id,
          initPoint: existingInitPoint,
          reused: true,
        });
      }
      return errorResponse('A assinatura pendente não possui uma URL de checkout válida.', 502);
    }

    const payerEmail = testPayerEmail || userData.user.email;
    if (!payerEmail) {
      throw new Error('Configure MP_TEST_PAYER_EMAIL para o ambiente de teste.');
    }

    const preapproval = await mercadoPagoRequest('/preapproval', {
      method: 'POST',
      body: JSON.stringify({
        reason: `BarberFlow - ${plan.name}`,
        external_reference: membership.tenant_id,
        payer_email: payerEmail,
        back_url: baseUrl,
        notification_url: notificationUrl,
        auto_recurring: {
          ...period,
          transaction_amount: plan.price_cents / 100,
          currency_id: 'BRL',
        },
        status: 'pending',
      }),
    });

    const { error: updateError } = await admin
      .from('tenant_subscriptions')
      .update({
        provider_subscription_id: String(preapproval.id),
        status: 'pending',
      })
      .eq('id', subscription.id)
      .eq('tenant_id', membership.tenant_id);
    if (updateError) throw new Error('Não foi possível salvar a assinatura criada.');

    return jsonResponse({
      id: preapproval.id,
      initPoint: preapproval.init_point || preapproval.sandbox_init_point,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Falha ao criar assinatura.', 502);
  }
});
