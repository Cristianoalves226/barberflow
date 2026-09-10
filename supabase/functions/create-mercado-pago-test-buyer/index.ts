import { corsHeaders, errorResponse, jsonResponse } from '../_shared/http.ts';

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return errorResponse('Método não permitido.', 405);

  const setupSecret = Deno.env.get('MP_TEST_SETUP_SECRET');
  const suppliedSecret = request.headers.get('x-setup-secret');
  if (!setupSecret || !suppliedSecret || !constantTimeEqual(setupSecret, suppliedSecret)) {
    return errorResponse('Não autorizado.', 401);
  }

  const token = Deno.env.get('MP_ACCESS_TOKEN');
  if (!token) return errorResponse('MP_ACCESS_TOKEN não configurado.', 500);

  try {
    const response = await fetch('https://api.mercadopago.com/users/test_user', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        site_id: 'MLB',
        description: 'BarberFlow Buyer Test',
        user_type: 'buyer',
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      return errorResponse(body?.message || body?.error || 'Mercado Pago recusou a criação da conta.', 502);
    }

    return jsonResponse({
      id: body.id,
      email: body.email,
      nickname: body.nickname,
      password: body.password,
      siteId: body.site_id,
      userType: body.user_type,
    });
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : 'Falha ao criar comprador de teste.', 502);
  }
});
