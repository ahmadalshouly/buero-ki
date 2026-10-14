// Runs every migration in an in-memory Postgres (PGlite) with small stand-ins for
// Supabase's auth and storage schemas, then checks row-level security and triggers.
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { before, test } from "node:test";

const MIGRATIONS = join(import.meta.dirname, "..", "migrations");
const AMINA = "11111111-1111-1111-1111-111111111111";
const BORIS = "22222222-2222-2222-2222-222222222222";
const db = new PGlite({ extensions: { pg_trgm } });

const STUBS = `
create schema auth; create schema storage; create schema extensions;
create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.role', true), ''), 'authenticated') $$;
create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid, bucket_id text, name text);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
create role authenticated;`;

/** Runs SQL as a signed-in user, with row-level security applied. */
async function as(uid, sql, params) {
  await db.exec(`set request.uid = '${uid}'; set role authenticated;`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role;");
  }
}

before(async () => {
  await db.exec(STUBS);
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  await db.exec(`
    grant usage on schema public, extensions, auth to authenticated;
    grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public, auth to authenticated;
    insert into auth.users values ('${AMINA}', '{"language": "ar"}'), ('${BORIS}', '{}');`);
});

test("new users get a profile in their sign-up language", async () => {
  const { rows } = await db.query("select id, language, plan from public.profiles order by id");
  assert.deepEqual(rows.map((r) => [r.language, r.plan]), [["ar", "free"], ["en", "free"]]);
});

test("people only see their own cases and cannot write into others'", async () => {
  await as(AMINA, "insert into public.cases (title, category) values ('Bürgergeld', 'jobcenter')");
  const mine = await as(AMINA, "select id from public.cases");
  assert.equal(mine.rows.length, 1);
  assert.equal((await as(BORIS, "select id from public.cases")).rows.length, 0);
  await assert.rejects(
    as(BORIS, "insert into public.tasks (case_id, title) values ($1, 'sneaky')", [mine.rows[0].id]),
    /row-level security/,
  );
  const upd = await as(BORIS, "update public.cases set title = 'hacked' returning id");
  assert.equal(upd.rows.length, 0);
});

test("the plan can only be changed by the billing system", async () => {
  await assert.rejects(as(AMINA, "update public.profiles set plan = 'org'"), /billing system/);
  await as(AMINA, "update public.profiles set full_name = 'Amina', ai_consent_at = now()");
});

test("tasks are stamped when done, and letters default to one page", async () => {
  const caseId = (await as(AMINA, "select id from public.cases")).rows[0].id;
  await as(AMINA, "insert into public.documents (case_id, storage_path, mime_type, title_de, summary) values ($1, 'a/b/1.jpg', 'image/jpeg', 'Aufforderung zur Mitwirkung', 'Send papers')", [caseId]);
  await as(AMINA, "insert into public.tasks (case_id, title) values ($1, 'Send rental contract')", [caseId]);
  await as(AMINA, "update public.tasks set done = true");
  const task = (await as(AMINA, "select completed_at, source from public.tasks")).rows[0];
  assert.ok(task.completed_at);
  assert.equal(task.source, "agent");
  await as(AMINA, "update public.tasks set done = false");
  assert.equal((await as(AMINA, "select completed_at from public.tasks")).rows[0].completed_at, null);
  assert.equal((await as(AMINA, "select page_count from public.documents")).rows[0].page_count, 1);
});

test("the timeline, search and audit log reflect what happened", async () => {
  const caseId = (await as(AMINA, "select id from public.cases")).rows[0].id;
  await as(AMINA, "insert into public.drafts (case_id, subject, body_de) values ($1, 'Unterlagen', 'Text')", [caseId]);
  await as(AMINA, "update public.drafts set status = 'sent', sent_at = now()");
  // The exported PDF and proof photos are kept with the draft, and only the owner can change them.
  await as(AMINA, "update public.drafts set pdf_path = 'a/b/draft.pdf', pdf_at = now(), proof_paths = array['a/b/receipt.jpg']");
  assert.deepEqual((await as(AMINA, "select proof_paths from public.drafts")).rows[0].proof_paths, ["a/b/receipt.jpg"]);
  assert.equal((await as(BORIS, "update public.drafts set proof_paths = '{}' returning id")).rows.length, 0);
  const kinds = (await as(AMINA, "select kind from public.case_timeline")).rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ["document", "draft", "sent"]);
  assert.equal((await as(BORIS, "select * from public.case_timeline")).rows.length, 0);

  const hits = await as(AMINA, "select kind from public.search_everything('mitwirkung')");
  assert.deepEqual(hits.rows.map((r) => r.kind), ["document"]);
  assert.equal((await as(BORIS, "select * from public.search_everything('mitwirkung')")).rows.length, 0);

  const audit = (await as(AMINA, "select action, entity from public.audit_log")).rows.map((r) => `${r.action}:${r.entity}`);
  assert.ok(audit.includes("insert:cases"));
  assert.equal((await as(BORIS, "select * from public.audit_log")).rows.length, 0);
});

test("forms are private, keep their fields and show in the timeline", async () => {
  const caseId = (await as(AMINA, "select id from public.cases")).rows[0].id;
  const fields = JSON.stringify([{ key: "name", label_de: "Familienname", value: "Amina" }]);
  await as(AMINA, "insert into public.forms (case_id, storage_path, mime_type, title_de, fields) values ($1, 'a/b/f.pdf', 'application/pdf', 'Hauptantrag', $2)", [caseId, fields]);
  await assert.rejects(
    as(BORIS, "insert into public.forms (case_id, storage_path, mime_type) values ($1, 'x', 'application/pdf')", [caseId]),
    /row-level security/,
  );
  assert.equal((await as(BORIS, "select id from public.forms")).rows.length, 0);
  const before = (await as(AMINA, "select updated_at from public.forms")).rows[0].updated_at;
  await as(AMINA, "update public.forms set status = 'ready'");
  const form = (await as(AMINA, "select fields, updated_at from public.forms")).rows[0];
  assert.equal(form.fields[0].value, "Amina");
  assert.ok(form.updated_at >= before);
  const kinds = (await as(AMINA, "select kind from public.case_timeline where kind = 'form'")).rows;
  assert.equal(kinds.length, 1);
});

test("usage is counted per function and cannot be erased by the user", async () => {
  await as(AMINA, "insert into public.ai_usage (function_name, model, input_tokens) values ('case-chat', 'm', 10), ('case-chat', 'm', 5)");
  assert.equal((await as(AMINA, "select public.ai_calls_last_day('case-chat') n")).rows[0].n, 2);
  assert.equal((await as(BORIS, "select public.ai_calls_last_day('case-chat') n")).rows[0].n, 0);
  await as(AMINA, "delete from public.ai_usage");
  assert.equal((await as(AMINA, "select public.ai_calls_last_day('case-chat') n")).rows[0].n, 2);
});

test("facts stay private, and keeping a correction replaces the old fact", async () => {
  const caseId = (await as(AMINA, "select id from public.cases")).rows[0].id;
  const old = (await as(AMINA, "insert into public.user_facts (category, fact, status, source) values ('housing', 'You live in Berlin-Mitte', 'kept', 'user') returning id, decided_at")).rows[0];
  assert.ok(old.decided_at);
  const fix = (await as(AMINA, "insert into public.user_facts (category, fact, case_id, replaces_id) values ('housing', 'You live in Berlin-Neukölln', $1, $2) returning id, decided_at", [caseId, old.id])).rows[0];
  assert.equal(fix.decided_at, null);

  assert.equal((await as(BORIS, "select * from public.user_facts")).rows.length, 0);
  assert.equal((await as(BORIS, "update public.user_facts set fact = 'x' returning id")).rows.length, 0);
  await assert.rejects(
    as(BORIS, "insert into public.user_facts (fact, case_id) values ('sneaky', $1)", [caseId]),
    /row-level security/,
  );

  await as(AMINA, "update public.user_facts set status = 'kept' where id = $1", [fix.id]);
  const rows = (await as(AMINA, "select fact, status from public.user_facts")).rows;
  assert.deepEqual(rows.map((r) => [r.fact, r.status]), [["You live in Berlin-Neukölln", "kept"]]);
});

test("facts suggested from a letter point at the person's own letter only", async () => {
  const doc = (await as(AMINA, "select id, case_id from public.documents limit 1")).rows[0];
  const row = (await as(AMINA, "insert into public.user_facts (fact, case_id, document_id, origin) values ('Your address is Hauptstraße 5', $1, $2, 'letter') returning origin", [doc.case_id, doc.id])).rows[0];
  assert.equal(row.origin, "letter");
  await assert.rejects(as(BORIS, "insert into public.user_facts (fact, document_id) values ('sneaky', $1)", [doc.id]), /row-level security/);
  await assert.rejects(as(AMINA, "insert into public.user_facts (fact, origin) values ('x', 'gossip')"), /check constraint/);
});

test("sent emails are counted per person and cannot be erased or faked for others", async () => {
  const caseId = (await as(AMINA, "select id from public.cases limit 1")).rows[0].id;
  const draft = (await as(AMINA, "insert into public.drafts (case_id, kind, subject, body_de) values ($1, 'email', 'Termin', 'Hallo') returning id", [caseId])).rows[0];
  await as(AMINA, "insert into public.sent_emails (case_id, draft_id, to_address, subject) values ($1, $2, 'amt@example.de', 'Termin')", [caseId, draft.id]);
  await as(AMINA, "update public.drafts set status = 'sent', sent_at = now(), sent_to = 'amt@example.de', sent_via = 'bueroki' where id = $1", [draft.id]);
  assert.equal((await as(AMINA, "select public.emails_sent_last_day() n")).rows[0].n, 1);
  assert.equal((await as(BORIS, "select public.emails_sent_last_day() n")).rows[0].n, 0);
  await as(AMINA, "delete from public.sent_emails");
  assert.equal((await as(AMINA, "select public.emails_sent_last_day() n")).rows[0].n, 1);
  assert.equal((await as(BORIS, "select * from public.sent_emails")).rows.length, 0);
  await assert.rejects(
    as(BORIS, "insert into public.sent_emails (case_id, to_address, subject) values ($1, 'x@example.de', 'x')", [caseId]),
    /row-level security/,
  );
  await assert.rejects(as(AMINA, "update public.drafts set sent_via = 'pigeon' where id = $1", [draft.id]), /check constraint/);
  await as(AMINA, "update public.profiles set contact_email = 'amina@example.org' where id = $1", [AMINA]);
  await assert.rejects(as(AMINA, "update public.profiles set contact_email = 'not an email' where id = $1", [AMINA]), /check constraint/);
});

test("a letter can wait for its owner or be declined, keeping only whom it is addressed to", async () => {
  const caseId = (await as(AMINA, "select id from public.cases limit 1")).rows[0].id;
  const doc = (await as(AMINA, "insert into public.documents (case_id, storage_path, mime_type) values ($1, 'p', 'application/pdf') returning id", [caseId])).rows[0];
  await as(AMINA, "update public.documents set status = 'needs_owner', addressed_to = 'Frau Fatima Noori' where id = $1", [doc.id]);
  await as(AMINA, "update public.documents set status = 'not_owner' where id = $1", [doc.id]);
  const { rows } = await as(AMINA, "select status, addressed_to from public.documents where id = $1", [doc.id]);
  assert.deepEqual(rows[0], { status: "not_owner", addressed_to: "Frau Fatima Noori" });
  await assert.rejects(as(AMINA, "update public.documents set status = 'borrowed' where id = $1", [doc.id]), /invalid input value/);
});

test("deleting the login removes all of the person's data", async () => {
  await db.exec(`delete from auth.users where id = '${AMINA}'`);
  for (const table of ["profiles", "cases", "documents", "forms", "tasks", "drafts", "user_facts", "sent_emails"]) {
    const { rows } = await db.query(`select count(*)::int n from public.${table} where ${table === "profiles" ? "id" : "user_id"} = $1`, [AMINA]);
    assert.equal(rows[0].n, 0, table);
  }
});
