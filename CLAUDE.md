# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

KlinikModern — a multi-tenant (multi-clinic) SaaS practice-management system for dental/medical clinics in Turkey. Next.js 14 App Router + TypeScript + Prisma/PostgreSQL + Tailwind. UI copy, comments, and commit messages are in Turkish; keep new user-facing text in Turkish.

## Commands

```bash
npm run dev              # dev server (via scripts/dev-stable.mjs — auto-restarts on crash)
npm run dev:next         # plain `next dev` if you don't need the stability wrapper
npm run build            # ensures Postgres is up, cleans .next, then `next build`
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
```

Prisma:
```bash
npm run prisma:generate
npm run prisma:migrate -- --name <name>   # dev migration (interactive `prisma migrate dev`)
npm run prisma:migrate:deploy              # apply pending migrations non-interactively (CI/prod)
npm run prisma:seed
```
In a non-interactive shell, `prisma migrate dev` will refuse to run. Generate the migration SQL manually instead:
```bash
npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/<timestamp>_<name>/migration.sql
npx prisma migrate deploy
npx prisma generate
```
On Windows, if `prisma generate` fails with `EPERM ... query_engine-windows.dll.node`, a running `next dev` process has the engine DLL locked — stop it first.

Tests (all `tsx`-run scripts, no Jest/Vitest):
```bash
npm run test:smoke          # scripts/smoke-api.ts — basic API smoke test (needs SMOKE_BASE_URL)
npm run test:integration    # scripts/integration-basic.ts
npm run test:stock-ledger   # scripts/stock-ledger-test.ts
npm run test:working-hours  # scripts/working-hours-rules-test.ts
npm run test:visual         # scripts/visual-audit.mjs — Playwright screenshot audit across viewports (needs local Chrome + CHROME_PATH)
```
There is no single-test runner; each script is standalone (`npx tsx scripts/<file>.ts`). Read the script before running — several expect a running dev server (`SMOKE_BASE_URL`/`INTEGRATION_BASE_URL`, default `http://localhost:3001`) and seeded demo data.

Other useful scripts: `npm run worker:sms` (standalone SMS queue worker, only relevant if `REDIS_URL` is set), `npm run preflight:prod`, `npm run backup:db`, `npm run verify:redis:realtime`.

## Architecture

### Multi-tenancy is manual, not row-level-security

Every tenant-owned Prisma model has an `institutionId` column. There is no DB-level tenant isolation — **every query must filter by it explicitly**. The standard pattern in API routes:
```ts
const auth = await requireAuth("patients:read");
if (auth.error) return auth.error;
where: { ...(auth.user.institutionId ? { institutionId: auth.user.institutionId } : {}) }
```
`SUPERADMIN` has no `institutionId` and intentionally sees across all tenants. Omitting the filter is the single most dangerous mistake possible in this codebase — it leaks data across clinics.

### Auth flow: `requireAuth()` (`src/lib/api.ts`)

Every API route starts with `const auth = await requireAuth(permission); if (auth.error) return auth.error;`. This one function, in order:
1. Decodes the JWT cookie (`klinik_token`) — no DB hit.
2. Applies SUPERADMIN "role preview" (a cookie-based UI impersonation of a lower role for testing).
3. Checks the user is still active and `tokenVersion` still matches (password changes / "log out everywhere" bump this) — short-TTL in-memory cache, not per-request DB hits.
4. Checks the requested `permission` string against the DB-backed role→permission matrix (`src/lib/rbac.ts` + `role-permission-store.ts`, editable at Superadmin → Rol Yetkileri). `"*"` grants everything.
5. For non-superadmin: requires `institutionId`, then checks the (cached) institution's billing/service state — `isActive`, `serviceMode` (`SUSPENDED`/`READ_ONLY`/`LIMITED`), `suspendedUntil`, demo expiry, and overdue-invoice payment grace — and can reject or throttle writes accordingly.

There are **two separate, must-stay-in-sync** permission layers:
- `middleware.ts` — static `ROLE_DENIED_PAGES` / `API_ROLE_DENIED` maps for whole-page/prefix denials that are fixed business rules (not meant to be superadmin-configurable, e.g. MUHASEBE can't see patient pages).
- `src/lib/role-permissions.ts` (DB-backed via `role-permission-store.ts`) — the fine-grained, superadmin-editable permission matrix used by `requireAuth`.
Don't hardcode a rule in `middleware.ts` that's supposed to be managed from the Rol Yetkileri screen — that makes the screen lie.

`ghost` sessions are a superadmin's invisible impersonation of a clinic account (support access) — they bypass clinic-side role/permission checks but every action is still written to the audit log with `isGhost`/`actorRole`, just filtered out of the clinic's own `/log` view.

### Route groups

- `src/app/(panel)/...` — the clinic-facing app (staff/doctor/owner UI), behind `middleware.ts` auth + role page-guards.
- `src/app/superadmin/...` — platform operator UI, gated by `role === "SUPERADMIN"` and a separate DB-backed module-access check (`superadmin-modules.ts`) applied in `middleware.ts`.
- `src/app/api/...` — route handlers; each does its own `requireAuth(permission)`.
- `src/app/randevu-al/[kurum]`, `src/app/sms-onay/[token]`, `src/app/api/public/...` — unauthenticated public pages/APIs (booking requests, SMS consent links). New public routes must be added to `PUBLIC_PREFIXES` in `middleware.ts` or they 401.

### Sensitive data handling

- `src/lib/field-crypto.ts` — AES-256-GCM field-level encryption (`FIELD_ENCRYPTION_KEY`) for KVKK-sensitive patient fields (medical history, notes) and stored documents. Encryption is skipped (with a warning) if the key isn't set — fine for local dev, required in production.
- `PatientAccessLog` records every patient-record view for accountability (KVKK).
- Never log or expose decrypted sensitive fields outside the request that needs them.

### Notifications: everything goes through one gate

`src/lib/notification-dispatch.ts` (`dispatchPatientMessage`) is the **only** allowed entry point for any automated or manual message to a patient (appointment created/changed/reminder, payment reminder, birthday, bulk SMS, etc.). It resolves SMS vs WhatsApp channel, enforces the patient's SMS consent (`PatientSmsPreference`), reserves/refunds the clinic's SMS credit balance atomically, and de-duplicates via `idempotencyKey`. Do not call `src/lib/sms.ts#sendSms` or `src/lib/whatsapp.ts#sendWhatsapp` directly from a new feature — route it through `dispatchPatientMessage` instead. (The few existing direct calls — platform→clinic billing SMS, pre-signup booking OTP, live WhatsApp chat replies — are deliberate, documented exceptions, not precedent to copy.)

Related pieces:
- `PatientSmsPreference` / `PatientSmsPreferenceEvent` / `PatientSmsConsentToken` — a patient's SMS consent is opt-in, collected via a token-based link (`/sms-onay/[token]`), sent automatically on patient creation, and append-only audited.
- `SmsDispatch` — single log of every dispatched message (sent, failed, or suppressed for missing consent).
- WhatsApp is per-clinic: `WhatsappProviderConfig.institutionId` is required (no shared/platform-wide provider — each clinic's messages must go out from its own number). A clinic can only use WhatsApp at all if Superadmin has flipped `Institution.whatsappEnabled`; the clinic then self-configures its own Meta Cloud API credentials.
- See `docs/ILETISIM-MIMARISI-RAPORU.md` for the full design rationale.

### Realtime updates

`src/lib/realtime-bus.ts` implements a per-institution "version counter" (SSE-based) — mutations call `bumpRealtimeInstitution(institutionId)` (done automatically inside `writeAudit`), and clients long-poll/subscribe to detect changes and refetch. Falls back to in-process pub/sub without `REDIS_URL`; use Redis for multi-instance deployments.

### Background jobs

`src/lib/scheduler.ts` starts an in-process interval-based scheduler (guarded by a `globalThis` symbol against Next.js dev hot-reload double-start) running hourly sweeps: invoice reminders, patient payment reminders, birthday SMS, and a more frequent appointment-reminder sweep. Controlled by `ENABLE_IN_PROCESS_SCHEDULER`. A separate optional Redis-queue SMS worker (`npm run worker:sms`) exists for `POST /api/sms?mode=queue`.

### Patient record structure

`Patient` is the hub entity — appointments, examinations, payments, prescriptions, lab orders, installment plans (`taksitPlanlari`), treatment plans, documents, consents, packages, etc. all hang off it. Patients are soft-deleted (`archivedAt`/`archivedById`/`archiveReason`), never hard-deleted. When adding a new patient-related feature, follow the existing convention: Prisma model → API route (`requireAuth` + institution filter) → panel page, per `.github/copilot-instructions.md`.

### Money handling

Prisma `Decimal` fields throughout (payments, invoices, prices) — don't switch to JS `number` for currency math; use `Prisma.Decimal`/string-safe arithmetic as the existing `src/lib/billing.ts`, `payment-ledger.ts`, `stock-ledger.ts` do.
