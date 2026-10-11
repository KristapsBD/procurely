import type { CompanyMembership, PurchaseOrder } from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { EmptyState } from '../components/empty-state';
import { RowCard, RowItem } from '../components/row-card';
import { ScreenHeader } from '../components/screen-header';
import {
  Button,
  ErrorNote,
  Loading,
  Money,
  StatusBadge,
  styles,
} from '../components/ui';
import {
  usePurchaseOrders,
  useRequisitions,
  useSignOutWhenUnauthorized,
} from '../features/data';
import { orderReference } from '../features/order-lines';
import { canRaisePurchaseOrders } from '../features/permissions';
import { orderable } from '../features/purchase-orders';
import { ReceiptEntryScreen } from './goods-receipt-panel';
import { OrderDetail } from './order-detail';
import { PurchaseOrderForm } from './purchase-order-form';
import { WithActiveCompany } from './with-active-company';

type Pane =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'open'; id: string }
  | { kind: 'receipt'; id: string };

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
          <OrderDetail
            company={company}
            order={open}
            onBack={toList}
            onRecord={() => setPane({ kind: 'receipt', id: open.id })}
          />
        ) : null;
      }
      case 'receipt': {
        const open = rows.find((o) => o.id === pane.id);
        return open ? (
          <ReceiptEntryScreen
            company={company}
            order={open}
            onBack={() => setPane({ kind: 'open', id: open.id })}
            onRecorded={() => setPane({ kind: 'open', id: open.id })}
          />
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
      {!orders.data && (
        <ScreenHeader title="Orders" lead={{ kind: 'company' }} />
      )}
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
      <ScreenHeader title="Orders" lead={{ kind: 'company' }} />
      {props.canOrder && (
        <Button
          variant="primary"
          label="New purchase order"
          onPress={props.onNew}
        />
      )}
      {props.rows.length === 0 ? (
        <EmptyState
          title="No purchase orders yet."
          body="Orders appear here once a buyer raises one from an approved requisition."
        />
      ) : (
        <RowCard>
          {props.rows.map((o) => (
            <RowItem
              key={o.id}
              mono
              title={orderReference(o.id)}
              meta={`${o.supplierName} · ${o.requisitionJustification}`}
              trailing={
                <>
                  <Money
                    minor={o.totalMinor}
                    currency={props.company.currency}
                  />
                  <StatusBadge status={o.status} />
                </>
              }
              accessibilityLabel={`Open order of ${o.requisitionJustification}`}
              onPress={() => props.onOpen(o.id)}
            />
          ))}
        </RowCard>
      )}
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
