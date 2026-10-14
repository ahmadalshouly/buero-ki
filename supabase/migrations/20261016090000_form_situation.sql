-- What the person told BüroKI about their situation when adding a form, so the agent
-- can fill in the form from it (also when reading the form again after a failure).
alter table public.forms
  add column situation text check (situation is null or char_length(situation) <= 4000);
