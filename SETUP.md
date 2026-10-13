# MindTrack setup

MindTrack is deployed at https://strattonshannon-afk.github.io/nike-mind-track/ and uses its own Supabase project. The existing Marvel vs DC Supabase project is unrelated and must not be changed.

## Current state

- Supabase project: `xmfjqxugaoqqgysbcdft`
- Database migration applied; six tables have row-level security enabled.
- Five Edge Functions are deployed: `gmail-oauth-start`, `gmail-oauth-callback`, `gmail-sync`, `carrier-track`, and `ai-summary`.
- `config.js` contains only the public Supabase URL and publishable key.
- Google OAuth, owner restriction, and order-specific sync are not fully configured until the private values below are supplied.

## 1. Google OAuth

1. Open https://console.cloud.google.com/ and select the project that owns MindTrack's OAuth client.
2. Enable the Gmail API.
3. Configure Google Auth Platform consent/branding for MindTrack.
4. Keep scopes limited to `openid`, `email`, and `https://www.googleapis.com/auth/gmail.readonly`.
5. While testing, add the exact owner Google account as a test user if the app is in Testing.
6. Create or use a Web application OAuth client.
7. Set its **Authorized redirect URI** to exactly:

   `https://xmfjqxugaoqqgysbcdft.supabase.co/functions/v1/gmail-oauth-callback`

8. In Supabase Edge Function secrets, set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Never commit the client secret or post it in a public issue/chat.
9. The callback checks that the verified Google account equals `ALLOWED_OWNER_EMAIL`.

Google may require additional verification for the Gmail restricted scope before a wider/public release. Keep the app in personal testing while setting it up.

## 2. Required private Edge Function secrets

Set these through the Supabase dashboard's Edge Function Secrets interface. Do not add them to `config.js` or GitHub:

- `ALLOWED_OWNER_EMAIL`: exact email used to sign in to MindTrack and the verified Google account that contains the order email.
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TARGET_ORDER_NUMBER`: exact order number from the KICKS CREW confirmation email. Do not substitute a tracking number.
- `GOOGLE_REDIRECT_URI`: already configured as the callback URL above.
- `TARGET_PRODUCT_NAME`: already configured as `Nike Mind 001`.
- `SITE_URL`: already configured as `https://strattonshannon-afk.github.io/nike-mind-track/`.
- `SITE_ORIGIN`: already configured as `https://strattonshannon-afk.github.io`.
- `TOKEN_ENCRYPTION_KEY`: already configured as a random 32-byte base64 key. If rotating it after any Google connection is stored, existing encrypted tokens would need reconnecting.

Optional only if you want these integrations later:
- `AFTERSHIP_API_KEY` for carrier tracking.
- `OPENAI_API_KEY` and optionally `OPENAI_MODEL` for AI summaries.

Supabase provides its own runtime variables, including the service-role key; never place a service-role key in the browser.

## 3. First run

1. Open the dashboard and enter the owner email in the sign-in card.
2. Use the one-time sign-in link delivered by Supabase Auth.
3. Click **Connect Gmail · read only** and choose the same verified owner account.
4. Click **Sync order email** to perform a manual read-only search.
5. Check the displayed order status and shipment details against the original KICKS CREW email before relying on them.

## Safety

- Gmail access is read-only; the app has no Gmail send/delete/modify scope.
- No card or payment information is collected.
- No cancellation, return, or order-editing actions exist.
- Safe Mode remains enabled; no automatic polling is enabled by default.
- A delivery date must come from a trusted order/carrier source; never invent an ETA.
- This is an independent personal project and is not affiliated with Nike or KICKS CREW.
