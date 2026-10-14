-- Form filling: a form (PDF or photographed pages) added to a case. The agent lists
-- its fields, explains them and pre-fills what it knows; the person checks the values
-- and gets the filled PDF back.

create table public.forms (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  page_paths text[] not null default '{}',
  mime_type text not null,
  file_name text,
  status text not null default 'uploaded' check (status in ('uploaded', 'analyzing', 'ready', 'failed')),
  -- True when the PDF has real form fields, so the app can return the same PDF filled in.
  fillable boolean not null default false,
  title_de text,
  -- Title, summary and instructions in the user's language.
  title text,
  summary text,
  instructions text,
  -- Every field with its explanation and value, as returned by the agent and edited by the person.
  fields jsonb not null default '[]'::jsonb,
  filled_path text,
  filled_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index forms_case_id_idx on public.forms (case_id, created_at desc);

alter table public.forms enable row level security;

create policy "Own forms" on public.forms
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

create function public.touch_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger forms_touch before update on public.forms
  for each row execute function public.touch_form();
create trigger forms_touch_case after insert or update on public.forms
  for each row execute function public.touch_case();
create trigger forms_audit after insert or update of status or delete on public.forms
  for each row execute function public.write_audit();

-- Show forms in the case timeline --------------------------------------------

create or replace view public.case_timeline
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
  from public.tasks t where t.completed_at is not null
  union all
  select f.case_id, f.id, 'form', f.created_at, coalesce(f.title_de, f.file_name), f.summary, null
  from public.forms f;
