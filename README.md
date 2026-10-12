# MindTrack — Nike Mind 001 order tracker

A clean, Apple-inspired personal order dashboard with read-only Gmail integration planned through a secure Supabase backend.

## Safety rules

- No payment or card collection.
- No order cancellation, return, modification, or management actions.
- Gmail access is read-only (gmail.readonly).
- Safe Mode is on by default.
- No real delivery date is shown unless supported by verified order or carrier data.
- No order number, email content, tracking number, tokens, or secrets are committed to this public repository.

## Current deployment state

The public GitHub Pages dashboard is a safe preview. Live Gmail sync requires a separately configured Supabase project and Google OAuth client. See SETUP.md. Do not put server secrets in config.js or any public file.

https://github.com/strattonshannon-afk/nike-mind-track
