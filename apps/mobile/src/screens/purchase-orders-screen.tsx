import type { CompanyMembership, PurchaseOrder } from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ErrorNote, Loading, styles } from '../components/ui';
import {
  usePurchaseOrders,
  useRequisitions,
  useSignOutWhenUnauthorized,
} from '../features/data';
import { statusLabel } from '../features/goods-receipts';
import { formatMoney } from '../features/money';
import { canRaisePurchaseOrders } from '../features/permissions';
import { orderable } from '../features/purchase-orders';
import { GoodsReceiptPanel } from './goods-receipt-panel';
import { PurchaseOrderForm } from './purchase-order-form';
import { CompanyLine, WithActiveCompany } from './with-active-company';

type Pane = { kind: 'list' } | { kind: 'new' } | { kind: 'open'; id: string };

/**
 * The purchase orders the person may read in the company they act in: all of them for buyers
 * and admins, who can also make one; a requester's or approver's own requisitions' orders.
 */
export function PurchaseOrdersScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <WithActiveCompany>
        {(active) => (
          // Keyed by company, so an open order never survives a company switch.
          <PurchaseOrders key={active.companyId} company={active} />
        )}
      </WithActiveCompany>
    </ScrollView>
  );
}

function PurchaseOrders(props: { company: CompanyMembership }) {
  const { company } = props;
  const canOrder = canRaisePurchaseOrders(company.role);
  const orders = usePurchaseOrders(company.companyId);
  const unauthorized = useSignOutWhenUnauthorized(orders.error);
  const [pane, setPane] = useState<Pane>({ kind: 'list' });
  const toList = () => setPane({ kind: 'list' });
  const body = (rows: PurchaseOrder[]) => {
    switch (pane.kind) {
      case 'list':
        return (
          <OrderList
            company={company}
            rows={rows}
            canOrder={canOrder}
            onNew={() => setPane({ kind: 'new' })}
            onOpen={(id) => setPane({ kind: 'open', id })}
          />
        );
      case 'new':
        return (
          <NewOrder
            company={company}
            orders={rows}
            onSaved={(saved) => setPane({ kind: 'open', id: saved.id })}
            onCancel={toList}
          />
        );
      case 'open': {
        const open = rows.find((o) => o.id === pane.id);
        return open ? (
          <OrderDetail company={company} order={open} onBack={toList} />
        ) : null;
      }
      default: {
        const unhandled: never = pane;
        return unhandled;
      }
    }
  };
  return (
    <>
      <CompanyLine company={company} />
      {orders.isPending && <Loading label="Loading purchase orders" />}
      {orders.isError && !unauthorized && (
        <ErrorNote
          message="Could not load purchase orders."
          onRetry={() => void orders.refetch()}
        />
      )}
      {orders.data && body(orders.data)}
    </>
  );
}

function OrderList(props: {
  company: CompanyMembership;
  rows: PurchaseOrder[];
  canOrder: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      {props.canOrder && (
        <Button label="New purchase order" onPress={props.onNew} />
      )}
      {props.rows.length === 0 && (
        <Text style={styles.body}>No purchase orders yet.</Text>
      )}
      {props.rows.map((o) => (
        <View key={o.id} style={styles.card}>
          <Text style={styles.body}>{o.requisitionJustification}</Text>
          <Text style={styles.muted}>
            {`${o.supplierName} · ${formatMoney(o.totalMinor, props.company.currency)} · ${statusLabel(o.status)}`}
          </Text>
          <Button
            label="Open"
            accessibilityLabel={`Open order of ${o.requisitionJustification}`}
            onPress={() => props.onOpen(o.id)}
          />
        </View>
      ))}
    </>
  );
}

/** The form, fed with the approved requisitions that have no order yet. */
function NewOrder(props: {
  company: CompanyMembership;
  orders: PurchaseOrder[];
  onSaved: (saved: PurchaseOrder) => void;
  onCancel: () => void;
}) {
  const requisitions = useRequisitions(props.company.companyId);
  if (requisitions.isPending) return <Loading label="Loading requisitions" />;
  if (requisitions.isError) {
    return <ErrorNote message="Could not load requisitions." />;
  }
  return (
    <PurchaseOrderForm
      company={props.company}
      requisitions={orderable(requisitions.data, props.orders)}
      onSaved={props.onSaved}
      onCancel={props.onCancel}
    />
  );
}

function OrderDetail(props: {
  company: CompanyMembership;
  order: PurchaseOrder;
  onBack: () => void;
}) {
  const { currency } = props.company;
  const o = props.order;
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{o.requisitionJustification}</Text>
      <Text style={styles.muted}>
        {`${o.supplierName} · ordered by ${o.createdByName}`}
      </Text>
      <Text style={styles.body}>{`Status: ${statusLabel(o.status)}`}</Text>
      {o.closedAt && (
        <Text style={styles.muted}>
          {`Closed by ${o.closedByName} on ${new Date(o.closedAt).toLocaleDateString()}`}
        </Text>
      )}
      {o.lines.map((l) => (
        <Text key={l.id} style={styles.body}>
          {`${l.quantity} × ${l.catalogItemName} at ${formatMoney(l.unitPriceMinor, currency)} = ${formatMoney(l.amountMinor, currency)} (${l.receivedQuantity} received)`}
        </Text>
      ))}
      <Text style={styles.body}>
        {`Total ${formatMoney(o.totalMinor, currency)}`}
      </Text>
      <GoodsReceiptPanel company={props.company} order={o} />
      <Button label="Back to purchase orders" onPress={props.onBack} />
    </View>
  );
}
