# TODO - IHIMS real OTP via Supabase Auth

## Goal
Replace the demo console-printed OTP login with real email-delivered OTP using Supabase Auth.

## Progress
- [x] Get Supabase project URL + publishable key from user
- [x] Update supabaseClient.js to use VITE_SUPABASE_PUBLISHABLE_KEY (anon/public)
- [x] Create .env with VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
- [x] Import supabase client into App.jsx
- [x] Add email field to seed accounts (admin@ihims.local, hr@ihims.local, staff@ihims.local)
- [x] Rewire LoginScreen to email-based flow:
  - [x] sendOtp via supabase.auth.signInWithOtp (shouldCreateUser: false)
  - [x] handleEmailSubmit validates account in registry by email, sends OTP
  - [x] handleOtpSubmit verifies via supabase.auth.verifyOtp and maps role from registry
  - [x] resendOtp re-sends code to pending email
- [x] Update login form JSX to email input + OTP stage
- [x] Add .login-info CSS style
- [x] npm run build passes
- [x] npm run lint passes (0 warnings, 0 errors)
- [x] Deploy to Vercel production (https://ihims.vercel.app)
- [x] Verified live site returns HTTP 200 with React root + bundle

## Verification checklist
- [x] Vercel env vars set (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY)
- [x] Deployed to https://ihims.vercel.app (200 OK, root + bundle present)
- [ ] Confirm Supabase Auth email provider (SMTP) configured so OTP emails are actually sent
- [ ] Confirm users (admin@ihims.local etc.) exist as Supabase Auth users matching registry emails

## GitHub push
- [x] Authenticated GitHub (gh auth / PAT)
- [x] Set git identity to noreply email (GitHub GH007 privacy fix)
- [x] Amended commit author + pushed to origin/master
- [x] Pushed to https://github.com/RanpoCM/ihims (commit c28dd0a, branch master, 14 files)
</content>
