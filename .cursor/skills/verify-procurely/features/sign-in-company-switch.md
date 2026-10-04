# Sign in and company switch

A development bundle lets a person sign in as a seeded user, see the companies they belong to, switch the active company, and sign out. A person with no memberships sees an empty-access message.

## Sub-features

- `login-alice` signs in as Alice from the quick pick.
- `switch-company` switches Alice from Acme Trading to Nordic Supplies and back.
- `login-nomad` signs in as Nomad and shows no-company access.
- `sign-out` returns to the Sign in screen.

## How to get to it (user POV)

- Open the web app at `http://127.0.0.1:8091` (redirects to Sign in when signed out).
- Choose `Sign in as Alice`, `Sign in as Carol`, `Sign in as Nomad`, or `Sign in as Mallory`.
- Choose `Sign in with id` after filling `Person id`.
- On home, choose a company button (`Acme Trading`, `Nordic Supplies`) then `Sign out`.

## Driving it with the browser

Preconditions:

- Doctor is green. Database is freshly seeded.
- Web app is at `http://127.0.0.1:8091`.
- Not already signed in (Sign in screen visible). If a session is restored, click `Sign out` first.

- **Sign in as Alice.** Click `Sign in as Alice`. Home heading is `Signed in as Alice Requester`. Company buttons include `Acme Trading` and `Nordic Supplies`. Company line is `Acme Trading (EUR), you are requester`. Cost centers include IT, MKT, OPS.
- **Switch company.** Click `Nordic Supplies`. Company line becomes `Nordic Supplies (SEK), you are approver`. Cost centers are OPS (Drift) and SALES (Försäljning). Acme's IT and MKT are absent.
- **Sign out.** Click `Sign out`. Sign in screen returns (`Dev login`, `Sign in as Alice`).
- **Nomad.** Click `Sign in as Nomad`. Heading is `Signed in as Nomad NoCompany`. Body includes `You do not have access to any company yet. Ask an admin to invite you.`
- **Proof.** Save an accessibility snapshot and a screenshot of Alice on Nordic Supplies, and of Nomad's empty-access message, under `evidence/<run-id>/`. Write `PROOF.md` with feature id `sign-in-company-switch`.

## Gotchas

- Session restore can skip login (`Restoring session`). Wait, then sign out if needed.
- First web load can sit on a Metro bundling page for ~30s.
- `Sign in as Alice` is the quick-pick name; the heading after login is `Alice Requester`.
- Google sign-in, when configured, is a separate path. Default proofs use dev login.
- Do not treat HTTP `/auth/dev-login` alone as UI proof of this feature.
