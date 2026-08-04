create extension if not exists pgcrypto;

create table if not exists public.ask_ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Ask AI chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours')
);

alter table public.ask_ai_conversations
alter column expires_at set default (now() + interval '48 hours');

create table if not exists public.ask_ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ask_ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ask_ai_conversations_user_updated_idx
on public.ask_ai_conversations(user_id, updated_at desc);

create index if not exists ask_ai_conversations_expires_idx
on public.ask_ai_conversations(expires_at);

create index if not exists ask_ai_messages_conversation_created_idx
on public.ask_ai_messages(conversation_id, created_at);

create index if not exists ask_ai_messages_user_created_idx
on public.ask_ai_messages(user_id, created_at desc);

alter table public.ask_ai_conversations enable row level security;
alter table public.ask_ai_messages enable row level security;

drop policy if exists "Users can read own ask ai conversations" on public.ask_ai_conversations;
create policy "Users can read own ask ai conversations"
on public.ask_ai_conversations for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own ask ai conversations" on public.ask_ai_conversations;
create policy "Users can insert own ask ai conversations"
on public.ask_ai_conversations for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own ask ai conversations" on public.ask_ai_conversations;
create policy "Users can update own ask ai conversations"
on public.ask_ai_conversations for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ask ai conversations" on public.ask_ai_conversations;
create policy "Users can delete own ask ai conversations"
on public.ask_ai_conversations for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own ask ai messages" on public.ask_ai_messages;
create policy "Users can read own ask ai messages"
on public.ask_ai_messages for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own ask ai messages" on public.ask_ai_messages;
create policy "Users can insert own ask ai messages"
on public.ask_ai_messages for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own ask ai messages" on public.ask_ai_messages;
create policy "Users can delete own ask ai messages"
on public.ask_ai_messages for delete
using (auth.uid() = user_id);
