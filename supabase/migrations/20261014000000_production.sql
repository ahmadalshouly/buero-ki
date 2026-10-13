-- Production hardening: consent and preferences, multi-page letters, usage limits,
-- audit log, case timeline and search.

-- Profiles: onboarding, consent, preferences, plan ---------------------------

alter table public.profiles
  add column onboarded_at timestamptz,
  add column ai_consent_at timestamptz,
  add column terms_version text,
  add column notify_deadlines boolean not null default true,
  add column app_lock boolean not null default false,
  add column plan text not null default 'free' check (plan in ('free', 'plus', 'org'));

-- Users may edit their own preferences but never their plan.
create function public.protect_profile_plan()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan is distinct from old.plan and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'plan can only be changed by the billing system';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_plan before update on public.profiles
  for each row execute function public.protect_profile_plan();

-- Documents: several photographed pages per letter ---------------------------

alter table public.documents
  add column page_paths text[] not null default '{}',
  add column page_count int generated always as (greatest(cardinality(page_paths), 1)) stored;

update public.documents set page_paths = array[storage_path] where page_paths = '{}';

-- Tasks: added by the agent or by the person ----------------------------------

alter table public.tasks
  add column source text not null default 'agent' check (source in ('agent', 'user')),
  add column completed_at timestamptz;

create function public.stamp_task_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.done and not coalesce(old.done, false) then
    new.completed_at = now();
  elsif not new.done then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create trigger tasks_stamp_completion before insert or update on public.tasks
  for each row execute function public.stamp_task_completion();

-- Drafts: track edits and sending ---------------------------------------------

alter table public.drafts
  add column edited boolean not null default false,
  add column sent_at timestamptz,
  add column revision_of uuid references public.drafts (id) on delete set null;

-- AI usage: one row per agent call, used for daily limits and cost tracking ----

create table public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  function_name text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  created_at timestamptz not null default now()
);

create index ai_usage_user_fn_idx on public.ai_usage (user_id, function_name, created_at desc);

alter table public.ai_usage enable row level security;

-- Read and append only: rows cannot be changed or deleted to get around limits.
create policy "Read own usage" on public.ai_usage
  for select using (user_id = auth.uid());
create policy "Record own usage" on public.ai_usage
  for insert with check (user_id = auth.uid());

create function public.ai_calls_last_day(fn text)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::int from public.ai_usage
  where user_id = auth.uid() and function_name = fn and created_at > now() - interval '24 hours';
$$;

-- Audit log: who changed what, written by triggers ----------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  -- No foreign key: the delete-account function removes these rows itself.
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id uuid,
  case_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_user_idx on public.audit_log (user_id, created_at desc);
create index audit_log_case_idx on public.audit_log (case_id, created_at desc);

alter table public.audit_log enable row level security;
create policy "Read own audit log" on public.audit_log
  for select using (user_id = auth.uid());

create function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_data jsonb := to_jsonb(coalesce(new, old));
  detail jsonb := '{}'::jsonb;
begin
  -- Skip rows removed because the whole account is being deleted.
  if tg_op = 'DELETE' and not exists (select 1 from auth.users u where u.id = (row_data ->> 'user_id')::uuid) then
    return old;
  end if;
  if tg_table_name = 'documents' then
    detail := jsonb_build_object('status', row_data ->> 'status', 'title', row_data ->> 'title_de');
  elsif tg_table_name = 'drafts' then
    detail := jsonb_build_object('status', row_data ->> 'status', 'subject', row_data ->> 'subject');
  elsif tg_table_name = 'tasks' then
    detail := jsonb_build_object('done', row_data -> 'done', 'title', row_data ->> 'title');
  elsif tg_table_name = 'cases' then
    detail := jsonb_build_object('status', row_data ->> 'status', 'title', row_data ->> 'title');
  end if;

  insert into public.audit_log (user_id, action, entity, entity_id, case_id, detail)
  values (
    (row_data ->> 'user_id')::uuid,
    lower(tg_op),
    tg_table_name,
    (row_data ->> 'id')::uuid,
    coalesce((row_data ->> 'case_id')::uuid, case when tg_table_name = 'cases' then (row_data ->> 'id')::uuid end),
    detail
  );
  return coalesce(new, old);
end;
$$;

create trigger cases_audit after insert or update of status, title, category or delete on public.cases
  for each row execute function public.write_audit();
create trigger documents_audit after insert or update of status or delete on public.documents
  for each row execute function public.write_audit();
create trigger tasks_audit after insert or update of done or delete on public.tasks
  for each row execute function public.write_audit();
create trigger drafts_audit after insert or update of status or delete on public.drafts
  for each row execute function public.write_audit();

-- Case timeline: everything that happened in a case, newest first ------------

create view public.case_timeline
with (security_invoker = true)
as
  select d.case_id, d.id as item_id, 'document'::text as kind, d.created_at as at,
         coalesce(d.title_de, d.file_name) as title, d.summary as detail, d.urgency as tone
  from public.documents d
  union all
  select r.case_id, r.id, 'draft', r.created_at, r.subject, r.kind, null
  from public.drafts r
  union all
  select r.case_id, r.id, 'sent', r.sent_at, r.subject, r.kind, null
  from public.drafts r where r.sent_at is not null
  union all
  select t.case_id, t.id, 'task_done', t.completed_at, t.title, null, null
  from public.tasks t where t.completed_at is not null;

-- Search across cases and letters ---------------------------------------------

create extension if not exists pg_trgm with schema extensions;

create index cases_title_trgm on public.cases using gin (title extensions.gin_trgm_ops);
create index documents_text_trgm on public.documents
  using gin ((coalesce(title_de, '') || ' ' || coalesce(sender, '') || ' ' || coalesce(summary, '')) extensions.gin_trgm_ops);

create function public.search_everything(q text)
returns table (kind text, id uuid, case_id uuid, title text, detail text, at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'case', c.id, c.id, c.title, coalesce(c.authority, c.summary), c.updated_at
  from public.cases c
  where c.title ilike '%' || q || '%' or c.authority ilike '%' || q || '%'
     or c.reference_number ilike '%' || q || '%'
  union all
  select 'document', d.id, d.case_id, coalesce(d.title_de, d.file_name), d.summary, d.created_at
  from public.documents d
  where (coalesce(d.title_de, '') || ' ' || coalesce(d.sender, '') || ' ' || coalesce(d.summary, '')) ilike '%' || q || '%'
  order by 6 desc
  limit 30;
$$;
