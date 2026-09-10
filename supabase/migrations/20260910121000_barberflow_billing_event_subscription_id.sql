alter table public.billing_payment_events
  add column if not exists provider_subscription_id text;
