-- BüroKI initial schema: profiles, cases, documents, tasks, drafts, chat messages.
-- Every row belongs to one user and row level security keeps it private.

-- Profiles -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  language text not null default 'en'
    check (language in ('en', 'de', 'ar', 'tr', 'uk', 'fa')),
  city text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, language)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'language', 'en'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Cases ----------------------------------------------------------------------

create type public.case_category as enum (
  'jobcenter', 'auslaenderbehoerde', 'familienkasse', 'krankenkasse',
  'finanzamt', 'buergeramt', 'housing', 'work', 'school', 'other'
);

create type public.case_status as enum ('open', 'waiting', 'closed');

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  category public.case_category not null default 'other',
  authority text,
  reference_number text,
  status public.case_status not null default 'open',
  -- Running summary the agent keeps up to date, in the user's language.
  summary text,
  -- Facts the agent learned about the case (household, income, what was sent).
  facts jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cases_user_id_idx on public.cases (user_id, updated_at desc);

-- Documents (letters in, letters out) ---------------------------------------

create type public.document_status as enum ('uploaded', 'analyzing', 'ready', 'failed');

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  file_name text,
  status public.document_status not null default 'uploaded',
  sender text,
  document_date date,
  title_de text,
  -- Short summary in the user's language.
  summary text,
  urgency text check (urgency in ('low', 'medium', 'high')),
  -- Full structured analysis returned by the agent.
  analysis jsonb,
  error text,
  created_at timestamptz not null default now()
);

create index documents_case_id_idx on public.documents (case_id, created_at desc);

-- Tasks and deadlines --------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index tasks_user_open_idx on public.tasks (user_id, done, due_date);

-- Drafted replies ------------------------------------------------------------

create type public.draft_status as enum ('draft', 'approved', 'sent');

create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  kind text not null default 'letter' check (kind in ('letter', 'email')),
  subject text not null,
  body_de text not null,
  body_translation text,
  notes text,
  status public.draft_status not null default 'draft',
  created_at timestamptz not null default now()
);

create index drafts_case_id_idx on public.drafts (case_id, created_at desc);

-- Chat with the case agent ---------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_case_id_idx on public.messages (case_id, created_at);

-- Keep cases.updated_at fresh when anything inside the case changes ---------

create function public.touch_case()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cases set updated_at = now() where id = new.case_id;
  return new;
end;
$$;

create trigger documents_touch_case after insert or update on public.documents
  for each row execute function public.touch_case();
create trigger tasks_touch_case after insert or update on public.tasks
  for each row execute function public.touch_case();
create trigger drafts_touch_case after insert or update on public.drafts
  for each row execute function public.touch_case();
create trigger messages_touch_case after insert on public.messages
  for each row execute function public.touch_case();

-- Row level security ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.documents enable row level security;
alter table public.tasks enable row level security;
alter table public.drafts enable row level security;
alter table public.messages enable row level security;

create policy "Own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "Own cases" on public.cases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Child rows must belong to the user and point at one of the user's cases.
create policy "Own documents" on public.documents
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy "Own tasks" on public.tasks
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy "Own drafts" on public.drafts
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

create policy "Own messages" on public.messages
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid())
  );

-- Storage: private bucket, files live under <user id>/<case id>/<file> -------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

create policy "Read own files" on storage.objects
  for select using (
    bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Upload own files" on storage.objects
  for insert with check (
    bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Delete own files" on storage.objects
  for delete using (
    bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text
  );
