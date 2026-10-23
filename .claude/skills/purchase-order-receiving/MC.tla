---------------------------- MODULE MC ----------------------------
(* Bounds the cfg syntax cannot write. MC.cfg sets the rest. *)
EXTENDS PurchaseOrderReceiving

\* purchase_order_lines.quantity of the order's two lines, by position.
MCOrdered == <<2, 1>>
\* goods_receipt_lines.quantity values: one delivered, one corrected away.
MCQuantities == {-1, 1}
====================================================================
