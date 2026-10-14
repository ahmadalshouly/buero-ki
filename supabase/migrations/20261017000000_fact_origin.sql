-- Memory from everywhere: facts can now be suggested from letters, forms and letter
-- instructions, not only the chat. Each fact records where it came from.

alter table public.user_facts
  add column origin text check (origin in ('chat', 'letter', 'form', 'draft', 'note', 'user')),
  add column document_id uuid references public.documents (id) on delete set null;

update public.user_facts set origin = 'user' where source = 'user' and origin is null;

drop policy "Own facts" on public.user_facts;
create policy "Own facts" on public.user_facts
  for all using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id and c.user_id = auth.uid()))
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id and d.user_id = auth.uid()))
  );
