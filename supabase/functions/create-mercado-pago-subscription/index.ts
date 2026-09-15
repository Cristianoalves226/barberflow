import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  mercadoPagoRequest,
} from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(supabaseUrl, serviceRoleKey);

/**
 * Obtém a URL oficial de checkout retornada pelo Mercado Pago.
 *
 * O Mercado Pago está retornando init_point na assinatura atual.
 * sandbox_init_point fica apenas como fallback.
 */
function checkoutUrl(
  preapproval: Record<string, unknown>,
) {
  return (
    preapproval.init_point ||
    preapproval.sandbox_init_point
  );
}

Deno.serve(async (request) => {
  console.log('CREATE_SUBSCRIPTION_INICIO', {
    method: request.method,
    timestamp: new Date().toISOString(),
  });

  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders,
    });
  }

  if (request.method !== 'POST') {
    return errorResponse(
      'Método não permitido.',
      405,
    );
  }

  const authorization =
    request.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return errorResponse(
      'Autenticação obrigatória.',
      401,
    );
  }

  const userClient = createClient(
    supabaseUrl,
    anonKey,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    },
  );

  const { data: userData, error: userError } =
    await userClient.auth.getUser();

  console.log('STEP_1_AUTH', {
    authenticated: !!userData.user,
    error: userError?.message ?? null,
  });

  if (userError || !userData.user) {
    return errorResponse(
      'Sessão inválida ou expirada.',
      401,
    );
  }

  const {
    data: membership,
    error: membershipError,
  } = await admin
    .from('barber_shop_members')
    .select('tenant_id, role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  console.log('STEP_2_MEMBERSHIP', {
    found: !!membership,
    role: membership?.role ?? null,
    error: membershipError?.message ?? null,
  });

  if (membershipError) {
    return errorResponse(
      'Não foi possível validar a barbearia.',
      500,
    );
  }

  if (
    !membership ||
    membership.role !== 'owner'
  ) {
    return errorResponse(
      'Apenas o proprietário pode iniciar a assinatura.',
      403,
    );
  }

  const {
    data: subscription,
    error: subscriptionError,
  } = await admin
    .from('tenant_subscriptions')
    .select(
      'id, requested_plan_id, provider_subscription_id',
    )
    .eq('tenant_id', membership.tenant_id)
    .maybeSingle();

  console.log('STEP_3_SUBSCRIPTION', {
    found: !!subscription,
    requested_plan_id:
      subscription?.requested_plan_id ?? null,
    provider_subscription_id:
      !!subscription?.provider_subscription_id,
    error:
      subscriptionError?.message ?? null,
  });

  if (
    subscriptionError ||
    !subscription?.requested_plan_id
  ) {
    return errorResponse(
      'Selecione um plano antes de iniciar a assinatura.',
    );
  }

  const {
    data: plan,
    error: planError,
  } = await admin
    .from('billing_plans')
    .select(
      'id, name, price_cents, billing_interval, active',
    )
    .eq('id', subscription.requested_plan_id)
    .eq('active', true)
    .maybeSingle();

  console.log('STEP_4_PLAN', {
    found: !!plan,
    name: plan?.name ?? null,
    price_cents: plan?.price_cents ?? null,
    billing_interval:
      plan?.billing_interval ?? null,
    error: planError?.message ?? null,
  });

  if (
    planError ||
    !plan ||
    !Number.isInteger(plan.price_cents) ||
    plan.price_cents <= 0
  ) {
    return errorResponse(
      'O plano selecionado ainda não possui preço configurado.',
    );
  }

  const baseUrl =
    Deno.env.get('PUBLIC_APP_URL') ||
    'https://cristianoalves226.github.io/barberflow/';

  const notificationUrl =
    `${supabaseUrl}/functions/v1/mercado-pago-webhook`;

  const testPayerEmail =
    Deno.env.get('MP_TEST_PAYER_EMAIL');

  const period =
    plan.billing_interval === 'year'
      ? {
          frequency: 1,
          frequency_type: 'years',
        }
      : {
          frequency: 1,
          frequency_type: 'months',
        };

  try {
    /*
     * =========================================================
     * VERIFICAR ASSINATURA EXISTENTE
     * =========================================================
     */

    if (subscription.provider_subscription_id) {
      console.log(
        'STEP_4A_EXISTING_SUBSCRIPTION',
        {
          provider_subscription_id:
            subscription.provider_subscription_id,
        },
      );

      try {
        console.log(
          'STEP_4B_BEFORE_GET_PREAPPROVAL',
        );

        const existing =
          await mercadoPagoRequest(
            `/preapproval/${encodeURIComponent(
              subscription.provider_subscription_id,
            )}`,
          );

        console.log(
          'STEP_4C_AFTER_GET_PREAPPROVAL',
          {
            id: existing?.id ?? null,
            status: existing?.status ?? null,
            hasInitPoint:
              !!existing?.init_point,
            hasSandboxInitPoint:
              !!existing?.sandbox_init_point,
          },
        );

        if (existing.status === 'authorized') {
          return errorResponse(
            'Esta barbearia já possui uma assinatura ativa.',
            409,
          );
        }

        const existingInitPoint =
          checkoutUrl(existing);

        console.log(
          'STEP_4C_CHECKOUT_URL',
          {
            hasInitPoint:
              !!existingInitPoint,
            initPointType:
              typeof existingInitPoint,
            source:
              existing?.init_point
                ? 'init_point'
                : existing?.sandbox_init_point
                  ? 'sandbox_init_point'
                  : 'none',
          },
        );

        if (existingInitPoint) {
          console.log(
            'STEP_4C_RETURNING_EXISTING_CHECKOUT',
            {
              subscriptionId:
                existing.id,
              source:
                existing?.init_point
                  ? 'init_point'
                  : 'sandbox_init_point',
            },
          );

          return jsonResponse({
            id: existing.id,
            initPoint: existingInitPoint,
            reused: true,
          });
        }

        return errorResponse(
          'A assinatura pendente não possui uma URL de checkout válida.',
          502,
        );
      } catch (error) {
        console.error(
          'STEP_4D_EXISTING_SUBSCRIPTION_ERROR',
          error,
        );

        const message =
          error instanceof Error
            ? error.message
            : '';

        console.log(
          'STEP_4D_EXISTING_SUBSCRIPTION_ERROR_MESSAGE',
          {
            message,
          },
        );

        if (!message.includes('HTTP 404')) {
          throw error;
        }

        console.log(
          'STEP_4E_CLEARING_INVALID_SUBSCRIPTION',
        );

        const {
          error: clearError,
        } = await admin
          .from('tenant_subscriptions')
          .update({
            provider_subscription_id: null,
            status: 'incomplete',
          })
          .eq(
            'id',
            subscription.id,
          )
          .eq(
            'tenant_id',
            membership.tenant_id,
          );

        if (clearError) {
          console.error(
            'STEP_4F_CLEAR_INVALID_SUBSCRIPTION_ERROR',
            clearError,
          );

          throw new Error(
            'Não foi possível liberar a assinatura inválida.',
          );
        }

        console.log(
          'STEP_4G_INVALID_SUBSCRIPTION_CLEARED',
        );
      }
    }

    /*
     * =========================================================
     * CRIAR NOVA ASSINATURA
     * =========================================================
     */

    const payerEmail =
      testPayerEmail ||
      userData.user.email;

    if (!payerEmail) {
      throw new Error(
        'Configure MP_TEST_PAYER_EMAIL para o ambiente de teste.',
      );
    }

    console.log(
      'STEP_5_BEFORE_MERCADO_PAGO',
      {
        payerEmailConfigured:
          !!payerEmail,
        environment:
          Deno.env.get(
            'MP_ENVIRONMENT',
          ) ?? 'not_configured',
        billingInterval:
          plan.billing_interval,
        amount:
          plan.price_cents / 100,
      },
    );

    const preapproval =
      await mercadoPagoRequest(
        '/preapproval',
        {
          method: 'POST',
          body: JSON.stringify({
            reason:
              `BarberFlow - ${plan.name}`,

            external_reference:
              membership.tenant_id,

            payer_email:
              payerEmail,

            back_url:
              baseUrl,

            notification_url:
              notificationUrl,

            auto_recurring: {
              ...period,

              transaction_amount:
                plan.price_cents / 100,

              currency_id: 'BRL',
            },

            status: 'pending',
          }),
        },
      );

    console.log(
      'MERCADO_PAGO_CHECKOUT_DEBUG:',
      JSON.stringify({
        id: preapproval.id,
        status: preapproval.status,

        init_point:
          preapproval.init_point ??
          null,

        sandbox_init_point:
          preapproval.sandbox_init_point ??
          null,
      }),
    );

    const {
      error: updateError,
    } = await admin
      .from('tenant_subscriptions')
      .update({
        provider_subscription_id:
          String(preapproval.id),

        status: 'pending',
      })
      .eq(
        'id',
        subscription.id,
      )
      .eq(
        'tenant_id',
        membership.tenant_id,
      );

    if (updateError) {
      throw new Error(
        'Não foi possível salvar a assinatura criada.',
      );
    }

    const initPoint =
      checkoutUrl(preapproval);

    console.log(
      'STEP_6_CHECKOUT_URL',
      {
        hasInitPoint:
          !!initPoint,

        initPointType:
          typeof initPoint,

        source:
          preapproval?.init_point
            ? 'init_point'
            : preapproval?.sandbox_init_point
              ? 'sandbox_init_point'
              : 'none',
      },
    );

    if (!initPoint) {
      throw new Error(
        'O Mercado Pago criou a assinatura, mas não retornou uma URL de checkout válida.',
      );
    }

    return jsonResponse({
      id: preapproval.id,

      initPoint,

      status:
        preapproval.status ??
        'pending',

      reused: false,
    });
  } catch (error) {
    console.error(
      'CREATE_SUBSCRIPTION_ERROR:',
      error,
    );

    return errorResponse(
      error instanceof Error
        ? error.message
        : 'Falha ao criar assinatura.',
      502,
    );
  }
});
