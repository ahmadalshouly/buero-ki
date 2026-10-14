-- BüroKI only reads the person's own letters. A letter addressed to someone else is
-- declined ('not_owner'); when it can't tell whose letter it is, it asks ('needs_owner').

alter type public.document_status add value if not exists 'needs_owner';
alter type public.document_status add value if not exists 'not_owner';

alter table public.documents
  add column addressed_to text;
