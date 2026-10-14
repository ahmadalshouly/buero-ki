-- Changes the chat agent made (for example tasks it added or removed), stored with
-- its answer so the app can show them under it and the agent remembers them.

alter table public.messages
  add column actions jsonb not null default '[]'::jsonb
    check (jsonb_typeof(actions) = 'array');
