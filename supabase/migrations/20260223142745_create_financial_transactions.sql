CREATE TABLE public.financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id uuid NOT NULL
    REFERENCES public.orders(id)
    ON DELETE RESTRICT,

  stripe_payment_intent_id text,
  stripe_charge_id text,

  transaction_type text NOT NULL CHECK (
    transaction_type IN (
      'payment',
      'refund',
      'dispute',
      'dispute_lost',
      'dispute_won',
      'adjustment'
    )
  ),

  amount integer NOT NULL, -- cents
  currency text NOT NULL DEFAULT 'usd',

  metadata jsonb,

  created_at timestamptz NOT NULL DEFAULT now()
);