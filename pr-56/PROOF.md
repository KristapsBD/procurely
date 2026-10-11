Feature: role-based tab navigation (#48). Entry point: dev login by person id, web app, seeded database.

- alice (Acme requester): lands /requests, tabs Requests, Company
- bob (approver): lands /inbox, tabs Inbox, Company
- carol (buyer): lands /orders, tabs Orders, Suppliers, Company
- dave (admin): lands /inbox, tabs Inbox, Requests, Orders, Suppliers, Company
- alice switches Acme Trading to Nordic Supplies in the picker: lands /inbox, tabs Inbox, Company, line "Nordic Supplies (SEK), you are approver"
  Screenshots in this directory.
