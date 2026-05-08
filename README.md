# Earn2Keep App

The coach/admin web application for **app.earn2keep.com**.

This is the actual product where coaches and team leaders log in, manage their teams, create Camps and Tournaments, and verify player submissions.

## Tech stack

- **Next.js 15** — React framework with server-side rendering
- **TypeScript** — type-safe JavaScript
- **Supabase** — authentication, database, storage
- **Vercel** — hosting and deployment

## What's in this app

### Authentication
- `/login` — log in with email + password
- `/signup` — create a new coach account
- `/forgot-password` — request a password reset email
- `/reset-password` — set a new password from email link
- `/auth/callback` — handles email confirmation
- `/auth/confirm` — confirmation success page

### Coach App
- `/dashboard` — main coach landing page after login
- More coming in Phase 4 (teams, events, submissions)

## Environment Variables

Set these in Vercel's dashboard (NOT in this codebase):

- `NEXT_PUBLIC_SUPABASE_URL` — your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — your Supabase anon public key

## Notes

- This app does NOT include `node_modules/` — Vercel installs them automatically during deployment.
- Local development is optional and not required to ship updates .
