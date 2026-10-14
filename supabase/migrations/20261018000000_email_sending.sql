-- Sending emails on the person's behalf: BüroKI sends a draft from its own address,
-- with replies going to the person. Each sent email is recorded for daily limits.

alter table public.drafts
  add column sent_to text,
  add column sent_via text check (sent_via in ('self', 'bueroki'));

create table public.sent_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  case_id uuid not null references public.cases (id) on delete cascade,
  draft_id uuid references public.drafts (id) on delete set null,
  to_address text not null,
  subject text not null,
  provider_id text,
  created_at timestamptz not null default now()
);

create index sent_emails_user_idx on public.sent_emails (user_id, created_at desc);

alter table public.sent_emails enable row level security;

-- Read and append only, like ai_usage: rows cannot be removed to get around limits.
create policy "Read own sent emails" on public.sent_emails
  for select using (user_id = auth.uid());
create policy "Record own sent emails" on public.sent_emails
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
    and (draft_id is null or exists (select 1 from public.drafts d where d.id = draft_id and d.user_id = auth.uid()))
  );

create function public.emails_sent_last_day()
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::int from public.sent_emails
  where user_id = auth.uid() and created_at > now() - interval '24 hours';
$$;
