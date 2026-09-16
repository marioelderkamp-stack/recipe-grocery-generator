-- Usage log for the ai-chat edge function. Lives in `private` (like
-- household_write_allowed()) so it is never exposed via PostgREST/anon key —
-- only the edge function's service-role key can read or write it. This is
-- what the function's budget check (rate limit + monthly cost cap) reads.
create table if not exists private.ai_usage (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  input_tokens integer not null,
  output_tokens integer not null,
  estimated_cost_cents numeric(10, 4) not null
);

create index if not exists ai_usage_created_at_idx on private.ai_usage (created_at);
