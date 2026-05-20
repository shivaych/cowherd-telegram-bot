-- Cowherd Acharya Telegram Bot — DB integration
-- Run this in the Supabase SQL editor (gunakul schema context)
-- Safe to run multiple times (idempotent)

create table if not exists gunakul.telegram_accounts (
  id                 uuid        primary key default gen_random_uuid(),
  acharya_id         uuid        references gunakul.mst_acharyas(id) on delete cascade,
  user_id            uuid        references gunakul.mst_users(id) on delete cascade,
  phone              text,
  telegram_user_id   bigint      not null,
  telegram_chat_id   bigint      not null,
  username           text,
  first_name         text,
  preferred_lang     text        not null default 'bn',
  selected_module_id text        not null default 'M01-daily-care',
  mode               text        not null default 'ask',
  state              jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (telegram_user_id, acharya_id)
);

-- Indexes for frequent lookups
create index if not exists idx_telegram_accounts_user_id
  on gunakul.telegram_accounts(user_id);

create index if not exists idx_telegram_accounts_acharya_id
  on gunakul.telegram_accounts(acharya_id);

-- updated_at trigger
create or replace function gunakul.set_telegram_accounts_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_telegram_accounts_updated_at on gunakul.telegram_accounts;
create trigger trg_telegram_accounts_updated_at
  before update on gunakul.telegram_accounts
  for each row execute function gunakul.set_telegram_accounts_updated_at();

-- Log tables for the bot (in gunakul schema so they aggregate across acharyas)

create table if not exists gunakul.log_chat (
  id           uuid        primary key default gen_random_uuid(),
  acharya_id   uuid        references gunakul.mst_acharyas(id) on delete set null,
  user_id      uuid        references gunakul.mst_users(id) on delete set null,
  module_id    text,
  lang         text,
  user_msg     text,
  bot_reply    text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_log_chat_user_id    on gunakul.log_chat(user_id);
create index if not exists idx_log_chat_acharya_id on gunakul.log_chat(acharya_id);
create index if not exists idx_log_chat_created_at on gunakul.log_chat(created_at desc);

create table if not exists gunakul.log_quiz (
  id           uuid        primary key default gen_random_uuid(),
  acharya_id   uuid        references gunakul.mst_acharyas(id) on delete set null,
  user_id      uuid        references gunakul.mst_users(id) on delete set null,
  module_id    text,
  lang         text,
  score        integer,
  total        integer,
  created_at   timestamptz not null default now()
);

create index if not exists idx_log_quiz_user_id    on gunakul.log_quiz(user_id);
create index if not exists idx_log_quiz_acharya_id on gunakul.log_quiz(acharya_id);

create table if not exists gunakul.log_apply (
  id           uuid        primary key default gen_random_uuid(),
  acharya_id   uuid        references gunakul.mst_acharyas(id) on delete set null,
  user_id      uuid        references gunakul.mst_users(id) on delete set null,
  module_id    text,
  lang         text,
  score        integer,
  has_photo    boolean     not null default false,
  feedback     text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_log_apply_user_id    on gunakul.log_apply(user_id);
create index if not exists idx_log_apply_acharya_id on gunakul.log_apply(acharya_id);

create table if not exists gunakul.log_progress (
  id           uuid        primary key default gen_random_uuid(),
  acharya_id   uuid        references gunakul.mst_acharyas(id) on delete set null,
  user_id      uuid        references gunakul.mst_users(id) on delete set null,
  module_id    text,
  section_id   uuid,
  event        text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_log_progress_user_id    on gunakul.log_progress(user_id);
create index if not exists idx_log_progress_acharya_id on gunakul.log_progress(acharya_id);

-- AI usage log (mirrors what ai-logger.ts writes)
create table if not exists gunakul.log_ai_usage (
  id                  uuid        primary key default gen_random_uuid(),
  ts                  timestamptz not null,
  acharya_id          uuid        references gunakul.mst_acharyas(id) on delete set null,
  service             text        not null,
  model               text        not null,
  status              text        not null,
  duration_ms         integer,
  input_tokens        integer,
  output_tokens       integer,
  cached_input_tokens integer,
  chars               integer,
  lang                text,
  has_image           boolean     not null default false,
  cost_usd            numeric(12,6) not null default 0,
  error_message       text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_log_ai_usage_acharya_id on gunakul.log_ai_usage(acharya_id);
create index if not exists idx_log_ai_usage_ts         on gunakul.log_ai_usage(ts desc);
