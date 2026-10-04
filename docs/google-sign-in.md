# Google sign-in

A person signs in with their Google account. The API checks the Google identity, finds or creates the person, and issues its own one-hour session token, the same kind the dev login issues. Google only proves who someone is: memberships and roles still come from the database. The dev login stays for tests, demos and agents, and no automated test talks to Google.

Without Google values in the environment the API starts as before: `GET /auth/options` returns `"google": false`, the Google routes return 404, and the app's sign-in screen says "Google sign-in is not configured on this server" above the dev login.

## Expo Go is enough (no development build)

Decision: the app stays on Expo Go. Google sign-in is a browser flow, and the API owns the https address Google returns to.

- Google's native sign-in libraries cannot run in Expo Go: "These libraries can't be used in Expo Go because they require custom native code" ([Expo: Google authentication](https://docs.expo.dev/guides/google-authentication/)).
- A browser flow needs a return address (redirect URI) that Google accepts. Expo Go's own address is `exp://<ip>:8081/--/...` ([Expo: AuthSession](https://docs.expo.dev/versions/latest/sdk/auth-session/)). Google refuses it for a web client: redirect URIs must use https (only localhost is exempt), cannot be raw IP addresses, and the host's top-level domain must be on the public suffix list ([Google: redirect URI validation](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation)). The iOS client type takes a custom scheme only for an app with its own bundle id, which Expo Go is not.
- So Google returns to the API instead, at `https://<machine>.<tailnet>.ts.net/auth/google/callback`. `tailscale serve` gives the machine that https name with a real certificate, reachable only inside your tailnet ([Tailscale Serve](https://tailscale.com/kb/1312/serve)). `ts.net` is on the [public suffix list](https://publicsuffix.org/list/public_suffix_list.dat) (entry by Tailscale Inc.), so the address passes Google's rules. Google never connects to the redirect URI itself; the phone's browser follows Google's redirect to it, and the phone reaches it over Tailscale. Nothing is exposed to the internet: use `serve`, never `funnel`.
- The API then sends the browser back to Expo Go's `exp://` address. The app opens the whole flow with `WebBrowser.openAuthSessionAsync`, which on iOS uses `ASWebAuthenticationSession` and returns the final address to the app ([Expo: WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)).

**Verified** on 2026-10-04 in Expo Go on an iPhone over Tailscale, with the setup below. A real Google sign-in works, and a person an admin invited is linked on their first Google sign-in (case 4 of [Who a Google sign-in becomes](#who-a-google-sign-in-becomes)). Google sign-in on Android is **not yet verified**. The automated tests use a local stand-in for Google with its own signing keys, for the API and for the app in the browser target.

## How it works

```
App (Expo Go)              API                                   Google
  | 1. open browser:        |                                       |
  |  /auth/google/start?return_to=exp://...&code_challenge=...     |
  |------------------------>| checks return_to against the allowlist|
  |                         | 302 to Google (signed state, nonce)    |
  |                         |-------------------------------------->|
  |                         |        person signs in, consents       |
  |                         | 2. /auth/google/callback?code&state    |
  |                         |<--------------------------------------|
  |                         | code -> ID token (server to server,    |
  |                         | client secret); verify the token;      |
  |                         | find or create the person              |
  | 302 exp://...?code=<handoff code, 2 minutes>                    |
  |<------------------------|                                       |
  | 3. POST /auth/google/session {code, codeVerifier}               |
  |------------------------>| verifier matches the challenge?        |
  | {token, person}         |                                       |
  |<------------------------|                                       |
```

- The ID token is verified with Google's official library (`google-auth-library`): signature against Google's published keys, issuer (`https://accounts.google.com` or `accounts.google.com`), audience (our client id), expiry, then a verified email and the nonce of this attempt ([Google: validating an ID token](https://developers.google.com/identity/openid-connect/openid-connect)).
- No server-side state: the attempt (return address, PKCE challenge, nonce, 10 minutes) and the handoff code travel signed with `SESSION_SECRET`, each purpose with its own key.
- The app makes a PKCE pair per attempt and keeps the verifier. The handoff code in the return address is useless without it, so a code read from a URL or browser history cannot be redeemed by anyone else.
- `GOOGLE_APP_RETURN_URLS` lists the only app addresses the API sends a sign-in back to. A crafted start link pointing somewhere else gets a 400, so nobody can lure a person into signing in and receive the result.

## Who a Google sign-in becomes

A person is matched on Google's stable subject identifier (`sub`), never on email alone ([Google: "Always use the sub field"](https://developers.google.com/identity/openid-connect/openid-connect)). The email is used only when Google is authoritative for it: a `@gmail.com` address, or a Google Workspace account (the token carries `hd`). For any other address Google's guidance applies: "the email_verified flag can be true as Google initially verified the user when the Google account was created, however ownership of the third-party email account may have since changed" ([Google: Streamlined linking](https://developers.google.com/identity/account-linking/oauth-with-sign-in-linking)).

1. A person already linked to this Google account: that person, even if their email at Google changed since.
2. Google is not authoritative for the email (say a Google account made with an Outlook address): refused, and nobody is linked or created. Creating a person from such an address would not be safe either: an admin's later invitation to that address finds the person by email, so it would go to whoever holds this Google account rather than to the address's real owner. The app asks to sign in with a Gmail address or a Google Workspace account.
3. No person with this email: a new person with no memberships. The app shows "You do not have access to any company yet. Ask an admin to invite you."
4. A person with this email who has never signed in with Google (an admin invited them): linked to this Google account from now on.
5. A person with this email already linked to another Google account: refused. The app says the email already belongs to another account and to ask an admin.

So every email in `people` is one an admin typed in or one Google vouches for, and an invitation can only ever reach the owner of the address. Allowing other Google accounts later would need a decision on how to confirm such an address (for example an emailed link).

The seeded people use `@procurely.test` addresses. They are not Gmail, and no Google Workspace can host a `.test` domain, so no Google account can ever become a seeded person; they remain dev-login only.

## Setup (done by hand)

You need the Tailscale setup from the README (Tailscale in WSL and on the iPhone, same account) and a Google account.

### 1. An https name for the API on your tailnet

1. In the [Tailscale admin console](https://login.tailscale.com/admin/dns), on the DNS page, make sure MagicDNS is on and enable HTTPS Certificates. `tailscale serve` cannot issue the https name without them.
2. In WSL, run `sudo tailscale set --operator=$USER` once, so your user can run `tailscale serve` without root. Without it, every `tailscale serve` call below needs `sudo`.
3. `tailscale serve --bg 3000` proxies port 3000, so the stack must run with `API_PORT=3000`, the fixed port of the [phone setup in the README](../README.md#on-a-physical-iphone-with-expo-go) (`export API_PORT=3000`, then `pnpm stack:up`). Then, in WSL:

   ```sh
   tailscale serve --bg 3000     # tailnet only; prints https://<machine>.<tailnet>.ts.net
   tailscale serve status        # shows the name and what it proxies to
   ```

   With the iPhone on Tailscale, open `https://<machine>.<tailnet>.ts.net/health` in Safari: it should show `{"status":"ok","database":"up"}`. `tailscale serve reset` turns it off again. Never use `tailscale funnel`: it publishes the port to the internet.

### 2. The OAuth client in the Google Cloud Console

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a project (project picker, then New project), for example `procurely-dev`.
2. Go to **Google Auth Platform** (formerly "OAuth consent screen") and click **Get started**. App name `Procurely (dev)`, your email as user support email, **Audience: External**, your email as contact. Agree and create.
3. **Audience**: leave the publishing status on **Testing** and, under Test users, add the Google account(s) you will sign in with. Only test users can sign in while the app is in testing.
4. **Data access**: nothing to add. Sign-in uses only `openid`, `email` and `profile`, which need no verification.
5. **Clients**, then **Create client**:
   - Application type: **Web application**, name `Procurely API (dev)`.
   - Authorized JavaScript origins: none.
   - Authorized redirect URIs: `https://<machine>.<tailnet>.ts.net/auth/google/callback` (exactly your name from step 1; scheme, host and path must match character for character). Optionally also `http://localhost:3000/auth/google/callback` for the browser target on this machine.
   - Create, then **download the JSON or copy the client secret right away**: Google shows the secret only at creation ([Google: manage OAuth clients](https://support.google.com/cloud/answer/15549257)).
   - If the console asks for authorized domains, the domain is `<tailnet>.ts.net`. No ownership verification is needed while the app is in testing.
6. Changes can take from five minutes to a few hours to apply at Google.

### 3. Environment values

Copy `.env.example` to `.env` at the repository root (gitignored; compose reads it) and fill in all four values:

```sh
GOOGLE_CLIENT_ID=<client id>.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<client secret>
GOOGLE_REDIRECT_URI=https://<machine>.<tailnet>.ts.net/auth/google/callback
GOOGLE_APP_RETURN_URLS=exp://<tailscale ip>:8081
```

`<tailscale ip>` is `tailscale ip -4`, the address Metro advertises to Expo Go. Add `http://localhost:8081` to `GOOGLE_APP_RETURN_URLS` (comma separated) for the browser target. `GOOGLE_REDIRECT_URI` holds one address: for the browser target alone you can use `http://localhost:3000/auth/google/callback` instead. Set all four or none; with only some the API refuses to start and names the missing ones. Then restart the stack (`pnpm stack:up`) and check `curl -s localhost:$API_PORT/auth/options` shows `"google":true`.

### 4. Sign in on the iPhone

```sh
TS_IP=$(tailscale ip -4)
EXPO_PUBLIC_API_URL=https://<machine>.<tailnet>.ts.net REACT_NATIVE_PACKAGER_HOSTNAME=$TS_IP pnpm mobile:start
```

(`EXPO_PUBLIC_API_URL=http://$TS_IP:3000` works too; the https name keeps everything on one address.) Open `exp://<TS_IP>:8081` in Expo Go and tap **Sign in with Google**. iOS asks whether Expo Go may use the site to sign in; continue, pick your Google account, and the app should come back signed in. A Google account with no company sees the no-access message. An admin can invite its Gmail address with the API call in [Inviting a person](../README.md#inviting-a-person), and the next sign-in shows the company. To check the linking of an invited person, invite the address before its first Google sign-in.

If something goes wrong:

| What you see                                                   | Likely cause                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Google: `redirect_uri_mismatch`                                | `GOOGLE_REDIRECT_URI` differs from the registered redirect URI, or Google has not applied the change yet     |
| Google: "Access blocked" / app not available                   | the Google account is not a test user (step 2.3)                                                             |
| `return_to is not an allowed app address` (400 in the browser) | the app's `exp://` address is not in `GOOGLE_APP_RETURN_URLS` (the Tailscale IP or Metro port differs)       |
| "This sign-in link is invalid or expired"                      | more than 10 minutes between tapping the button and finishing at Google, or `SESSION_SECRET` changed between |
| The browser cannot open the `ts.net` name                      | Tailscale is off on the phone, or `tailscale serve` is not running                                           |
