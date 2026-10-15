-- Files sent along when BüroKI emails a draft: photos or PDFs the person added, or pages
-- of letters already in the case. Each entry is {path, name, mime, own}; "own" files were
-- uploaded for this email and are removed with the draft, letter pages are only referenced.
alter table public.drafts
  add column attachments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);
