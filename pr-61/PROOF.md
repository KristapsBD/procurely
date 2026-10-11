# PR 61 proof

Surface: Expo web at the checkout's verification Metro, headless Chrome at 420 px wide, seeded database, dev login.

- login.png: login screen.
- nomad-no-company-before.png: Nomad on 5bf2c2f's with-active-company.tsx. Bare text, no tab bar, no way to sign out.
- nomad-no-company-after.png: EmptyState with a Sign out button.
- nomad-signed-out.png: after pressing Sign out, back on login.
- dave-company.png, members.png, approval-rules.png: Dave (admin, Acme Trading). The rule "From €1,000.00" was added through the UI.
- alice-company.png: Alice (requester), no admin rows.

`make e2e` passed (1/1 flow) on head 33c4a04.
