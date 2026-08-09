# IHIMS — Supabase & Vercel Setup Guide

This guide explains how IHIMS connects to your Supabase project and how it's
deployed to Vercel, including how authentication (email OTP) works.

---

## 1. Supabase Connection

IHIMS uses a **single Supabase integration today**: email OTP authentication.
All app data (employees, training, recognition, etc.) is stored in the
browser's `localStorage` (self-contained), so no database tables are required
for the app to function.

### The two env vars used by the app

| Variable | Purpose | Where set |
|----------|---------|-----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL, e.g. `https://abcd1234.supabase.co` | local `.env` + Vercel |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your Supabase **publishable (anon)** key | local `.env` + Vercel |

These are read in `src/supabaseClient.js` and `src/App.jsx` (for the OTP call).

### Where to find them in Supabase

1. Open your project at https://supabase.com/dashboard
2. Go to **Project Settings → API**
3. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **Publishable key** (or legacy `anon`/`public` key) → `VITE_SUPABASE_PUBLISHABLE_KEY`

> The publishable/anon key is meant to be public (it's embedded in the
> browser). It is not a secret. Never put your **service_role** key in the
> frontend.

### Local development

Your `.env` file already contains both values. To change them, edit `.env`
(never commit it — it's gitignored). A template is in `.env.example`.

---

## 2. Authentication (email OTP)

Logging in uses Supabase Auth's **email magic-link / OTP** flow:

1. User enters an email on the landing page.
2. The app calls `POST /auth/v1/otp` with `shouldCreateUser: true`.
3. Supabase emails a 6-digit code to that address.
4. User enters the code; the app calls `verifyOtp` to create a session.
5. The role (admin / hr / staff) is mapped from the local account registry by
   email. Unknown emails default to `staff`.

### Important: SMTP/email delivery must be enabled

If your Supabase project returns **`Error sending confirmation email`**
(HTTP 500), it means email delivery isn't configured yet. To fix:

1. Supabase Dashboard → **Authentication → Providers → Email**
2. Enable the **Email** provider.
3. Under **Authentication → Settings → SMTP**, either:
   - Use Supabase's **built-in email** (may be rate-limited on free tier), or
   - Configure a **Custom SMTP** provider (Resend, SendGrid, AWS SES, etc.)
     and set a verified **sender address**.
4. Set your **Site URL** / redirect URL (e.g. `https://ihims.vercel.app`)
   under **Authentication → URL Configuration**.

### Demo fallback (works even without SMTP)

The app has a built-in fallback so login never locks you out:

- If `VITE_OTP_DEMO=true` is set, no email is sent — the code is shown
  directly on screen.
- Even without that flag, if Supabase email delivery fails at runtime, the app
  automatically falls back to showing the code on-screen (logged to console).

To force demo mode on Vercel, add an env var `VITE_OTP_DEMO=true`.

### Demo login accounts (local registry)

| Email | Role |
|-------|------|
| `admin@ihims.local` | Admin |
| `hr@ihims.local` | HR Manager |
| `staff@ihims.local` | Staff |

These emails are only used to map roles from the local registry. Any email can
request an OTP; unknown ones become `staff`.

---

## 3. Vercel Deployment

The project is already deployed and linked:

- **Dashboard**: https://vercel.com/dev-ours/ihims
- **Production URL**: https://ihims.vercel.app
- **Team**: dev-ours (DevOurs)

### Re-deploying manually (CLI)

```bash
# 1. Log in (if needed)
npx vercel login

# 2. Link this folder to the Vercel project (once)
npx vercel link --yes --project ihims

# 3. Set env vars (already done, but shown for reference)
#    These are read at build time because they start with VITE_
echo "https://bxnpyhquxmqmrthxtntz.supabase.co" | npx vercel env add VITE_SUPABASE_URL production --yes
echo "sb_publishable_0l6R4Ul6OjL8GsnsOeLNIA_KiKyqsch" | npx vercel env add VITE_SUPABASE_PUBLISHABLE_KEY production --yes

# 4. Deploy to production
npx vercel deploy --prod --yes
```

### Deployment via GitHub (auto)

The Vercel project is connected to the GitHub repo
`https://github.com/RanpoCM/ihims`. Any push to the `master` branch triggers
an automatic production deployment.

### Vercel env vars (already configured)

| Variable | Value | Type |
|----------|-------|------|
| `VITE_SUPABASE_URL` | `https://bxnpyhquxmqmrthxtntz.supabase.co` | Sensitive |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_0l6R4Ul6OjL8GsnsOeLNIA_KiKyqsch` | Sensitive |

> `VITE_`-prefixed vars are embedded in the client bundle (visible in
> DevTools) — this is expected and safe for the publishable key.

---

## 4. Optional: Database schema

A reference schema is in `src/supabaseSchema.sql` (profiles, employees,
training, competencies, recognition, succession). It is **not required** for
the app to run because the app currently uses `localStorage`. If you later want
to move data to Supabase, run that SQL in the **Supabase SQL editor** and
enable RLS policies as documented.

---

## 5. Troubleshooting

- **"Error sending confirmation email"** — SMTP not configured; see section 2.
- **"No account is registered with this email"** — This message no longer
  appears; any email is accepted and unknown ones default to `staff`.
- **Login always shows a code on-screen** — Either `VITE_OTP_DEMO=true` is set,
  or Supabase email delivery is failing (check the browser console for the
  real error).
- **Deployed site shows default Vite page** — Redeploy; the build output dir is
  `dist` and the framework auto-detected is Vite.
