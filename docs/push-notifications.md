# Push notifications

An approver is told on their phone when a requisition awaits their decision. A requester is told when their requisition is approved or rejected. Delivery goes through Expo's push service.

## What is sent

| When                                              | To                                                                       | Title                                       | Data                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | --------------------------------------------------------- |
| A requisition is submitted and needs a decision   | Admins, and approvers when its route is `APPROVER`. Never the requester. | Approval needed                             | `kind: approval-requested`, `requisitionId`, `companyId`  |
| A requisition is approved or rejected by a person | The requester                                                            | Requisition approved / Requisition rejected | `kind: requisition-decided`, `requisitionId`, `companyId` |

A requisition approved at once (under every threshold) sends nothing. The text is fixed and the data is ids only: no supplier, item, amount, comment, person or company name leaves the API. The app fetches the details itself, as the signed-in person, after a tap.

## How company isolation holds

- A phone is registered for one person and one company: the company the app is acting in. `POST /push-devices` (company header required) calls the SQL function `register_push_device`, which binds the token to the caller and the current company. Registering the same token again, as someone else or for another company, moves it.
- The app registers on sign-in and on every company switch, and removes the phone (`DELETE /push-devices`) before signing out.
- Who to notify is decided in the database, inside the acting person's own request scope: `push_tokens_for_approval` answers only to the requester of that submitted requisition, `push_tokens_for_decision` only to the person who decided it. Both return only devices registered for the requisition's company, of people who are still active members there with a role that may decide (or the requester).
- Result: a person acting in company B never receives company A's notifications, even if they are an approver in both.

## Sending never blocks the approval

The notification is built and sent after the approval committed, and the request does not wait for it. If Expo is down or a send fails, a warning is logged and the approval stands.

## Verify in development (no phone, no public endpoint)

In development and test (`NODE_ENV=development|test`, as in the compose stack) the API records every notification it produces in an in-memory outbox (latest 200, lost on restart). Read your own with:

```sh
curl -H "authorization: Bearer $TOKEN" -H "x-company-id: $COMPANY" "$API/push-devices/outbox"
```

It lists only notifications addressed to devices the caller registered for that company, newest first (`404` outside development). To try it by hand, register any well-formed token as the approver, submit as the requester, then read the approver's outbox:

```sh
curl -X POST -H "authorization: Bearer $BOB" -H "x-company-id: $ACME" -H 'content-type: application/json' \
  -d '{"token":"ExponentPushToken[local-dev-token-1]"}' "$API/push-devices"
```

The automated tests use a fake sender behind the `PushSender` interface (`apps/api/src/notifications/push-sender.ts`) and cover who is and is not notified, payload contents, and a failing sender.

## Verify a real push on an iPhone in Expo Go

The API pushes outward to Expo, so it needs internet access but no public address. The phone reaches the API over Tailscale as usual.

1. Set `PUSH_SENDER=expo` in `.env` next to `docker-compose.yml` and run `pnpm stack:up`. Set `EXPO_ACCESS_TOKEN` only if the Expo project requires it.
2. Expo needs a project id to issue a push token. Run `npx eas-cli init` in `apps/mobile` once (it writes `extra.eas.projectId` to `app.json`), or set `EXPO_PUBLIC_EAS_PROJECT_ID` in `apps/mobile/.env.local`.
3. Start Metro, open the app in Expo Go on the iPhone, sign in as the approver (for example Bob on Acme) and allow notifications. The app registers the phone for the active company.
4. On a computer, sign in as the requester (Alice), and submit a requisition. The phone shows "Approval needed". Approve or reject it as Bob (or Dave on Acme) and sign back in as Alice on the phone: "Requisition approved".
5. If nothing arrives, read the outbox (above) to confirm the API produced it, then the API logs (`make logs`) for a warning from `ApprovalNotifier` carrying Expo's error. Android Expo Go cannot receive remote push in SDK 53 and later; use iOS or a development build.

One phone holds one registration, so testing two people means signing out and in on the phone (signing out removes the registration).

## Not done

- Expo receipts are not polled, and tokens Expo reports as `DeviceNotRegistered` are logged, not deleted.
- Notifications are not retried.
