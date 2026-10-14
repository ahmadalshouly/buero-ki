-- Files kept with a draft: the PDF the person exported (to have the exact letter they
-- sent) and photos proving it was sent (a post office receipt or tracking number).
alter table public.drafts
  add column pdf_path text,
  add column pdf_at timestamptz,
  add column proof_paths text[] not null default '{}';
