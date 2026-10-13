# BüroKI

A personal helper for German paperwork, built for people with an immigration background. You open a **case** for each matter (for example a Jobcenter Bürgergeld application), add the letters you receive, and an AI agent explains them in your language, tracks deadlines, drafts German replies and answers questions about the case.

This repository holds the first version (MVP) from the product plan:

- **Cases** with letters, tasks and drafts
- **Scan and explain**: photo or PDF in, explanation, deadlines and German terms out, in the user's language
- **Deadline tracking** pulled from every letter
- **Reply drafting**: formal German letter or email plus a translation and "before you send" notes
- **Chat with the case** in any language
- **Six languages**: English, Deutsch, العربية, Türkçe, Українська, فارسی (with right-to-left layout)

Sending emails, AI phone calls, the community translator marketplace and the lawyer/doctor directory come in later phases.

## Layout

```
apps/mobile/          Expo (React Native) app for iOS, Android and web
  src/app/            Screens (Expo Router)
  src/lib/api.ts      Data layer: Supabase, or demo mode when no Supabase is configured
  src/locales/        UI translations
supabase/
  migrations/         Database schema with row level security and the private storage bucket
  functions/          Edge functions that call Claude
    analyze-document/ Reads a letter, explains it, creates tasks, updates the case
    draft-reply/      Writes a German letter or email with a translation
    case-chat/        Answers questions about one case
```

## Run the app in demo mode

No accounts needed. The app shows a sample Jobcenter case.

```bash
cd apps/mobile
npm install
npx expo start
```

Scan the QR code with the Expo Go app on your phone, or press `w` for the browser.

## Connect Supabase and Claude

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
   supabase functions deploy analyze-document draft-reply case-chat
   ```
4. Sign-in uses a 6-digit email code. In the Supabase dashboard go to **Authentication > Email Templates > Magic Link** and make sure the template includes `{{ .Token }}`, for example: `Your BüroKI code is {{ .Token }}`.
5. Copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the project URL and publishable key from **Project Settings > API**. Restart `npx expo start`.

## Build for the app stores

The app uses [EAS](https://docs.expo.dev/eas/) to build in the cloud, so no Mac is needed for iOS builds.

```bash
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --platform all --profile preview
```

Store submission needs an Apple Developer account and a Google Play developer account.

## Notes on the AI

- Model: Claude Opus 5.5 via the Anthropic API, called only from the edge functions so the API key never reaches the phone.
- Answers use structured JSON output, so the app always gets the same fields (summary, actions, deadlines, terms).
- The agent explains and drafts but does not give individual legal advice. It flags when someone should see a Beratungsstelle or a lawyer, in line with the Rechtsdienstleistungsgesetz. Have a German lawyer confirm this before launch.
- Every function runs as the signed-in user, so row level security applies to everything the agent reads and writes.
