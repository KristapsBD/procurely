# PR 57 proof: ScreenHeader, company chip, Intl money

Surface: Expo web at 390x844 against this checkout's seeded API stack (verify-procurely skill), driven with chrome-devtools-axi. Dev login.

| File | Person, screen | What it shows |
| --- | --- | --- |
| inbox-bob.png | Bob (approver, Acme), Inbox | Chip with no chevron (one company), 28px "Inbox" title |
| orders-carol.png | Carol (buyer, Acme), Orders | Chip, "Orders" title, amounts as €635.80 |
| company-alice-picker.png | Alice, Company tab | Chip with SVG chevron, picker open with both companies |
| requests-alice-eur.png | Alice in Acme, Requests | EUR amounts, for example Approved · €5,995.00 |
| inbox-alice-nordic-sek.png | Alice after picking Nordic Supplies | Landed on Inbox (approver landing tab) in the SEK company |
| inbox-erik-sek.png | Erik (admin, Nordic), Inbox | SEK 25,980.00 in the SEK company |

Alice is only an approver in Nordic and nothing waits for her there, so the SEK amount is shown as Erik.
inbox-bob.png and orders-carol.png were captured on a Metro bundle from before one removed SVG prop (a React DOM warning, no visual change). The other shots and the console check (no errors) are from the final bundle.
