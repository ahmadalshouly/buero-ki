-- Memory: facts about the person the agent may reuse across cases. The agent only
-- suggests facts (pending); nothing is used until the person keeps it, and they can
-- see and delete every fact at any time.

alter table public.profiles
  -- Off: the agent stops suggesting new facts. Kept facts stay until deleted.
  add column memory_enabled boolean not null default true;

create type public.fact_status as enum ('pending', 'kept');

create table public.user_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category text not null default 'other'
    check (category in ('identity', 'residence', 'family', 'work', 'money', 'housing', 'health', 'contact', 'other')),
  -- One short sentence in the person's language, e.g. "You live in Berlin-Neukölln".
  fact text not null check (char_length(fact) between 1 and 300),
  status public.fact_status not null default 'pending',
  -- Where the fact came up, so the chat can ask about it there.
  case_id uuid references public.cases (id) on delete set null,
  -- A kept fact this one corrects (e.g. a new address); removed when this one is kept.
  replaces_id uuid references public.user_facts (id) on delete set null,
  source text not null default 'agent' check (source in ('agent', 'user')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index user_facts_user_idx on public.user_facts (user_id, status, created_at desc);

alter table public.user_facts enable row level security;

create policy "Own facts" on public.user_facts
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()))
  );

create function public.decide_fact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'kept' and (tg_op = 'INSERT' or old.status is distinct from 'kept') then
    new.decided_at = now();
  end if;
  return new;
end;
$$;

create trigger user_facts_decide before insert or update on public.user_facts
  for each row execute function public.decide_fact();

-- Runs as the person (security invoker), so it can only remove their own facts.
create function public.replace_fact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'kept' and new.replaces_id is not null then
    delete from public.user_facts where id = new.replaces_id and user_id = new.user_id;
  end if;
  return new;
end;
$$;

create trigger user_facts_replace after insert or update of status on public.user_facts
  for each row execute function public.replace_fact();
