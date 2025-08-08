-- database/schema.sql (revised for production safety)
-- Conversations
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  platform text not null,
  message text not null,
  response text not null,
  agent text not null,
  cost integer not null default 0,
  timestamp timestamptz default now(),
  created_at timestamptz default now()
);

-- Leads
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  score integer not null default 0,
  qualification text,
  location text default 'Nigeria',
  business_size text default 'unknown',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Voice cache metadata (we store audio in Redis)
create table if not exists voice_cache (
  id uuid primary key default gen_random_uuid(),
  text_hash text not null,
  agent_type text not null,
  storage text default 'redis',
  access_count integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(text_hash, agent_type)
);

-- Agent performance daily rollup (optional)
create table if not exists agent_performance (
  id uuid primary key default gen_random_uuid(),
  agent text not null,
  date date not null,
  conversations_count integer not null default 0,
  total_cost integer not null default 0,
  created_at timestamptz default now(),
  unique(agent, date)
);

-- Indexes
create index if not exists idx_conv_session on conversations(session_id);
create index if not exists idx_conv_agent on conversations(agent);
create index if not exists idx_conv_ts on conversations(timestamp);
create index if not exists idx_leads_phone on leads(phone);
create index if not exists idx_voice_cache_hash on voice_cache(text_hash);

-- Triggers
create or replace function update_updated_at_column()
returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;

drop trigger if exists trg_leads_updated on leads;
create trigger trg_leads_updated before update on leads
for each row execute function update_updated_at_column();

drop trigger if exists trg_voice_updated on voice_cache;
create trigger trg_voice_updated before update on voice_cache
for each row execute function update_updated_at_column();
