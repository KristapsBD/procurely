# PR 59 proof: Ledger restyle of buyer screens

Web app at the checkout's Metro (`make e2e` stack), seeded dataset, signed in as Carol (Acme Trading, buyer), 430px wide headless Chrome.

01 Orders list. 02 Partially received order with its receipt note. 03 Fully received order. 04 Receipt entry. 05 Raising a PO. 06 Suppliers segment. 07 Catalog segment. 08 Empty deliveries list ("Nothing received yet.") on an Issued order.

Fix round: 01 to 04 retaken after removing the derived PO reference. Rows and headers show the requisition title with the supplier. 04's back pill now reads "Order". 05 to 08 are unchanged by that fix.
