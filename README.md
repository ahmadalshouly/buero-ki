# BüroKI

A personal helper for German paperwork, built for people with an immigration background. You open a **case** for each matter (for example a Jobcenter Bürgergeld application), add the letters you receive, and an AI agent explains them in your language, tracks deadlines, drafts German replies and answers questions about the case.

What is in this version:

- **Cases** with a history timeline, letters, tasks and drafts. Cases can be edited, put on "waiting", closed or deleted.
- **Scan and explain**: up to 10 photographed pages or one PDF per letter. The agent returns an explanation, deadlines (with where each date came from), amounts, German terms and whether to get advice, in the person's language.
- **Today and Deadlines**: what is overdue, due this week and later, across all cases. Tasks can also be added by hand.
- **Reply drafting**: a formal German letter or email with a translation and "before you send" notes. Drafts can be edited, revised by the agent ("make it shorter"), opened in the email app and marked as sent.
- **Letters as PDF**: a reply can be saved as an A4 PDF laid out after DIN 5008, so it can be printed, signed and posted in a window envelope. The app warns when fields in [brackets] are still empty.
- **Form filling**: photograph a form or pick its PDF. The agent lists every field, explains it in the person's language and pre-fills what it knows from the profile, the case and other cases. Empty fields become plain questions, and the person can answer in their own words. PDFs with form fields come back filled in; photos and scans get a printable filling sheet.
- **Send emails for you**: BüroKI sends an email draft to the office from its own address, in the person's name. Replies go to the person's own email and they get a copy. Nothing is sent before they check the address and tap "Send now", and drafts with empty [brackets] cannot be sent.
- **Chat with the case** in any language.
- **Search** across cases and letters.
- **Onboarding** with language, name and explicit consent to AI processing.
- **Deadline reminders** on the phone (3 days before and on the day) and an optional **Face ID / fingerprint lock**.
- **Light and dark mode**, six languages (English, Deutsch, العربية, Türkçe, Українська, فارسی) with right-to-left layout.
- **Works offline** from a cached copy of your cases.

AI phone calls, the community translator marketplace and the lawyer/doctor directory come in later phases.

## Production features

| Area | What it does |
| --- | --- |
| Security | Row level security on every table; storage paths scoped to the user; the API key only lives in edge functions; letters are treated as data, never as instructions to the agent. |
| Privacy (GDPR) | Consent recorded with time and terms version; "Download my data" (Art. 15/20) and "Delete account" (Art. 17), which removes files, rows and the login. |
| Limits | Daily per-plan limits for each agent function, counted in `ai_usage`. Users cannot change their own plan. |
| Audit | `audit_log` records case, letter, task and draft changes. |
| Reliability | Every function validates input with zod, returns `{ error, code, requestId }` on failure and writes one JSON log line per request. |
| Quality | Typecheck, ESLint and Jest for the app; `deno check` and tests for the functions; migration and row-level-security tests on an in-memory Postgres. All run in GitHub Actions. |

## Layout

```
apps/mobile/            Expo (React Native) app for iOS, Android and web
  src/app/              Screens (Expo Router): (tabs)/ Today, Cases, Deadlines, Settings
  src/lib/api.ts        Data layer: Supabase, or demo mode with EXPO_PUBLIC_DEMO=1
  src/lib/queries.ts    TanStack Query hooks, cache persisted on the device
  src/locales/          UI translations
  src/__tests__/        Jest tests
supabase/
  migrations/           Schema, row level security, storage bucket, usage, audit log, timeline, search
  functions/
    _shared/            Request handler, Claude client, limits, case context, output schemas
    analyze-document/   Reads a letter, explains it, creates tasks, updates the case
    draft-reply/        Writes or revises a German letter or email with a translation
    case-chat/          Answers questions about one case
    fill-form/          Reads a form, pre-fills its fields and writes them into the PDF
    learn-facts/        Suggests facts about the person to remember; kept only if they agree
    send-email/         Sends a confirmed email draft through Resend
    export-data/        GDPR data export
    delete-account/     GDPR account deletion
    tests/              Deno tests
  tests/                Migration and row-level-security tests (PGlite)
.github/workflows/ci.yml
```

## Run the app

The app connects to the BüroKI Supabase project. To try it with sample data and no backend, set `EXPO_PUBLIC_DEMO=1` in `apps/mobile/.env`.

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone, or press `w` for the browser.

## Connect Supabase and Claude

**From GitHub:** add the repository secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` and `ANTHROPIC_API_KEY`, then run the **Deploy backend** workflow (Actions tab). It does everything below, including the sign-in email, and runs again whenever `supabase/` changes.

**Sending emails (optional):** create an account at [resend.com](https://resend.com), add and verify a domain you own (Resend shows the DNS records to add), create an API key, then add the repository secrets `RESEND_API_KEY` and `EMAIL_FROM` (an address on that domain, for example `post@mail.your-domain.de`) and run **Deploy backend** again. Without them, the app opens the email in the person's email app instead.

**From your computer:** with the [Supabase CLI](https://supabase.com/docs/guides/cli) installed, run

```bash
./scripts/setup-backend.sh <project-ref>
```

It links the project, creates the database, stores the Anthropic key as a function secret and deploys the functions. Then follow step 4 and 5 below. If your Anthropic key is not tied to a workspace, also run `export ANTHROPIC_WORKSPACE_ID=wrkspc_...` first.

**Step by step:**


1. Create a project at [supabase.com](https://supabase.com) (choose an EU region, for example Frankfurt).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and link the project:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
3. Add your Anthropic API key and deploy the functions:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy analyze-document draft-reply case-chat fill-form learn-facts send-email export-data delete-account
   ```
4. Sign-in uses a 6-digit email code. In the Supabase dashboard go to **Authentication > Email Templates > Magic Link** and make sure the template includes `{{ .Token }}`, for example: `Your BüroKI code is {{ .Token }}`.
5. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the project URL and publishable key from **Project Settings > API**. Restart `npx expo start`.

## Run the tests

```bash
cd apps/mobile && npm run typecheck && npm run lint && npm test
deno check supabase/functions/*/index.ts && deno test supabase/functions/tests/
cd supabase/tests && npm install && npm test
```

## Build the apps

The native `ios/` and `android/` folders are generated from `app.json` (`npx expo prebuild`), so they are not in the repository.

**Test builds on GitHub (no accounts needed).** Every push to `main` runs `.github/workflows/build-apps.yml`, which produces:

- `bueroki-android-apk`: an APK you can install on any Android phone (allow "install unknown apps").
- `bueroki-ios-simulator`: the app for the iOS Simulator on a Mac.

Download them from the workflow run's **Artifacts**. The builds use the BüroKI Supabase project set in `apps/mobile/src/lib/supabase.ts`. The repository secrets `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` point them at another project.

**Real iPhones and the stores (EAS).** Installing on an iPhone outside the Simulator needs an Apple Developer account. Builds run in Expo's cloud, so no Mac is needed:

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest init                      # links the app to your Expo account
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --environment preview --environment production
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value sb_publishable_... --environment preview --environment production
npx eas-cli@latest build --platform all --profile preview      # installable test builds
npx eas-cli@latest build --platform all --profile production   # store builds
npx eas-cli@latest submit --platform all
```

After `eas init`, add an `EXPO_TOKEN` secret on GitHub and every `v*` tag also starts production EAS builds.

**Locally**, with Android Studio or Xcode installed: `npm run android` or `npm run ios`.

## Notes on the AI

- Claude is called through the Anthropic API only from the edge functions, so the API key never reaches the phone. The model is set in `supabase/functions/_shared/anthropic.ts`.
- Answers use structured JSON output, so the app always gets the same fields (summary, actions, deadlines, terms).
- The agent explains and drafts but does not give individual legal advice. It flags when someone should see a Beratungsstelle or a lawyer, in line with the Rechtsdienstleistungsgesetz. Have a German lawyer confirm this before launch.
- Every function runs as the signed-in user, so row level security applies to everything the agent reads and writes. Only `delete-account` uses the service role, and only to remove the person's own files and login.
- Plan limits live in `supabase/functions/_shared/limits.ts` (enforced) and `apps/mobile/src/lib/limits.ts` (shown in Settings). Keep them in sync.
