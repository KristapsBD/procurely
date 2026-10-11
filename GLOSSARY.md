# Procurely

Procurely is a multi-tenant procure-to-pay product: someone requests a purchase, it is approved, a buyer orders it from a supplier, the delivery is confirmed, and every step is logged.

## Tenancy and people

**Company**:
A tenant: one business whose data is isolated from every other company's, with exactly one currency.
_Avoid_: Tenant (in product language), organization

**Person**:
Someone who can sign in. A person may belong to several companies and acts in one company at a time.
_Avoid_: User, account

**Membership**:
A person's link to one company, carrying one role and either active or deactivated. A deactivated membership removes access to that company.
_Avoid_: Seat

**Role**:
What a membership allows in its company: requester, approver, buyer or admin. A person can hold a different role in each company.

**Requester**:
The role that raises and manages its own requisitions.

**Approver**:
The role that approves or rejects other people's submitted requisitions, within what the company's approval rules route to approvers.

**Buyer**:
The role that manages suppliers and catalog items, turns approved requisitions into purchase orders, and confirms goods receipts.
_Avoid_: Purchaser

**Admin**:
The role that manages members, cost centers and approval rules, reads the audit log, and can act as requester, approver and buyer. An admin cannot edit or cancel someone else's requisition, and cannot decide their own.
_Avoid_: Owner, manager

**Cost center**:
A named budget code within a company that a requisition's spending is charged to.
_Avoid_: Budget, department

## Sourcing

**Supplier**:
An outside business the company buys from; a record only, it never signs in. A supplier is deactivated rather than deleted, and an inactive one cannot receive new orders.
_Avoid_: Vendor

**Catalog item**:
Something a company buys from one supplier at an agreed unit price. Requisition and purchase order lines are always catalog items.
_Avoid_: Product, SKU

**Money**:
An amount in whole minor units (cents) of the company's currency.

## Requisitions

**Requisition**:
A request to buy catalog items, charged to a cost center and justified in words. It is cancelled, never deleted.
_Avoid_: Purchase request, order request

**Requisition line**:
One catalog item and quantity on a requisition, with the unit price copied from the catalog when the requisition is saved. A requisition's total is the sum of its lines.

**Requisition status**:
Where a requisition stands: draft (editable by its requester), submitted (awaiting a decision), approved, rejected or cancelled. Only a draft or submitted requisition can be cancelled, and approved, rejected and cancelled are final.

**Approval rule**:
A company's statement that from an amount threshold upward a given role (approver or admin) must approve. A threshold is inclusive, and of the rules that apply the highest threshold decides alone.
_Avoid_: Approval chain, workflow

**Approval route**:
Who decides a requisition, fixed when it is submitted: approvers, admins, nobody (total under every threshold, so it is approved automatically) or admins because the company has no rules.

**Decision**:
A person's approval or rejection of a submitted requisition, with a comment that is required for a rejection. A requester can never decide their own requisition, and an automatic approval has no decision.
_Avoid_: Approval (as a record)

## Purchasing

**Purchase order**:
A buyer's order of one approved requisition from one supplier; a requisition becomes at most one. It is never changed after creation.
_Avoid_: PO (in prose), order

**Purchase order line**:
One catalog item, quantity and unit price on a purchase order. The buyer sets the price, starting from the requisition line's.
_Avoid_: PO line (in prose)

**Purchase order status**:
Determined by what has been received: issued (nothing received), partially received, fully received, or closed. Closed happens only when a buyer explicitly closes a fully received order; it is final and a closed order takes no more receipts.

**Goods receipt**:
A delivery a buyer confirmed against a purchase order, listing the quantity received per order line with an optional note such as damage. It is never edited or deleted.
_Avoid_: Delivery note, GRN

**Receipt correction**:
A later goods receipt line with a negative quantity and a required note, which undoes a mistaken receipt.

## Accountability

**Audit log**:
The record of who did what and when in a company; entries are never changed or deleted. Only admins can read it.
_Avoid_: History, activity feed
