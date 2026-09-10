update public.billing_plans
set price_cents = 5990,
    updated_at = now()
where code = 'profissional'
  and (price_cents is null or price_cents <> 5990);
