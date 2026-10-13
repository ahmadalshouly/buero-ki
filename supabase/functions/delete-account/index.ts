// GDPR Art. 17: deletes the signed-in person's files, data and login. Requires the
// confirmation word so a stray request cannot wipe an account.
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { z } from "npm:zod@4.6.7";
import { handler } from "../_shared/http.ts";

const Input = z.strictObject({ confirm: z.literal("DELETE") });

Deno.serve(handler("delete-account", Input, async ({ userId, log }) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // Storage objects are not removed by the cascade, so list and remove them first.
  const bucket = admin.storage.from("documents");
  const { data: caseDirs } = await bucket.list(userId, { limit: 1000 });
  let removed = 0;
  for (const dir of caseDirs ?? []) {
    const { data: files } = await bucket.list(`${userId}/${dir.name}`, { limit: 1000 });
    const paths = (files ?? []).map((f) => `${userId}/${dir.name}/${f.name}`);
    if (paths.length) {
      const { error } = await bucket.remove(paths);
      if (error) throw new Error(`storage: ${error.message}`);
      removed += paths.length;
    }
  }

  // Cascades remove profile, cases and everything below them. audit_log has no FK.
  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) throw new Error(`auth: ${authError.message}`);
  await admin.from("audit_log").delete().eq("user_id", userId);

  log("account deleted", { files: removed });
  return { deleted: true, files: removed };
}, { requireConsent: false }));
