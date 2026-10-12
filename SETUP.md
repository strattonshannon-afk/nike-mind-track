# MindTrack setup

The public GitHub Pages site is a safe preview only. Live order data requires a private backend; this repository intentionally contains no personal order number or secrets.

## 1. Supabase
1. Create a project at https://supabase.com/dashboard.
2. Run supabase/migrations/001_mindtrack.sql in SQL Editor.
3. Invite only the email address you will use to sign in.
4. Set the exact published site URL under Authentication → URL Configuration.
5. Put only the Supabase project URL and public anon/publishable key in config.js.

## 2. Google OAuth
1. Enable Gmail API in https://console.cloud.google.com/.
2. Configure OAuth consent and add your own account as a test user.
3. Create a Web application OAuth client.
4. Set the authorized redirect URI to https://<project-ref>.supabase.co/functions/v1/gmail-oauth-callback.
5. Scope must remain openid, email, and https://www.googleapis.com/auth/gmail.readonly.

## 3. Supabase server secrets
Set SITE_URL, SITE_ORIGIN, ALLOWED_OWNER_EMAIL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI, TARGET_ORDER_NUMBER, TARGET_PRODUCT_NAME, and a random 32-byte base64 TOKEN_ENCRYPTION_KEY in Supabase Edge Function secrets. Optional integrations require AFTERSHIP_API_KEY and/or OPENAI_API_KEY. Never commit these values.

## 4. Deploy backend
From the project folder:

    npx supabase login
    npx supabase link --project-ref <project-ref>
    npx supabase db push
    npx supabase functions deploy gmail-oauth-start
    npx supabase functions deploy gmail-oauth-callback --no-verify-jwt
    npx supabase functions deploy gmail-sync
    npx supabase functions deploy carrier-track
    npx supabase functions deploy ai-summary

## 5. First run
Open the HTTPS site, sign in with the configured owner email, connect Gmail, and manually sync. Review permissions before enabling carrier lookup, notifications, or automatic polling.

## Safety
No payment/card data, order-management actions, or email-writing scopes are supported. The dashboard must not show an ETA unless one is provided by a reliable source.
