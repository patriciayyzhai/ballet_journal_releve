# Relevé v0.2

A mobile-first Swan Lake–themed ballet journal built with Next.js and an optional Supabase backend.

## What works now

- Time-aware greeting, refreshed when the app opens, returns from the background, and once per minute.
- Guided class journaling and practice intentions.
- Local browser storage by default.
- Supabase storage automatically activates after environment variables are configured and the user is authenticated.
- PWA manifest for adding Relevé to a phone home screen.
- Row-level-security SQL so each user can only access their own entries.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Connect Supabase

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env.local` and add the project URL and anon key.
4. Add an authentication screen or magic-link flow. Until a user is signed in, Relevé deliberately falls back to local storage.

## Current boundary

This package contains the cloud-ready data layer, but not a live Supabase project or deployed URL because those require the owner's credentials. Authentication, media uploads, migration of existing local entries, and editing/deleting entries are the next implementation slice.
