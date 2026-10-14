-- The email address replies should go to when BüroKI sends an email for the person.
-- It can differ from the sign-in address; the person enters it before sending.

alter table public.profiles
  add column contact_email text check (contact_email is null or (length(contact_email) <= 254 and contact_email like '%_@_%._%'));
