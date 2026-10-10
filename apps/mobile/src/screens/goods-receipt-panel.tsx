import type {
  CompanyMembership,
  GoodsReceipt,
  PurchaseOrder,
} from '@procurely/shared-types';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  ErrorNote,
  Loading,
  TextField,
  styles,
} from '../components/ui';
import {
  useCompanyMutation,
  useGoodsReceipts,
  writeErrorMessage,
} from '../features/data';
import {
  type ReceiptLineDraft,
  emptyDrafts,
  lineIssue,
  toReceiptRequest,
} from '../features/goods-receipts';
import { canRaisePurchaseOrders } from '../features/permissions';

/**
 * Deliveries against one order: what arrived so far, and for a buyer or admin the form to
 * confirm another delivery and the button to close a fully received order. A receipt cannot be
 * edited; a mistake is corrected by a later entry with a negative quantity and a note.
 */
export function GoodsReceiptPanel(props: {
  company: CompanyMembership;
  order: PurchaseOrder;
}) {
  const { company, order } = props;
  const receipts = useGoodsReceipts(company.companyId, order.id);
  const canWrite = canRaisePurchaseOrders(company.role);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.heading}>Deliveries</Text>
      {receipts.isPending && <Loading label="Loading deliveries" />}
      {receipts.isError && (
        <ErrorNote
          message="Could not load deliveries."
          onRetry={() => void receipts.refetch()}
        />
      )}
      {receipts.data?.length === 0 && (
        <Text style={styles.body}>Nothing received yet.</Text>
      )}
      {receipts.data?.map((r) => (
        <ReceiptEntry key={r.id} receipt={r} />
      ))}
      {canWrite && order.status !== 'CLOSED' && (
        <>
          <ReceiptForm company={company} order={order} />
          {order.status === 'FULLY_RECEIVED' && (
            <CloseOrder company={company} order={order} />
          )}
        </>
      )}
    </View>
  );
}

function ReceiptEntry(props: { receipt: GoodsReceipt }) {
  const r = props.receipt;
  return (
    <View style={{ gap: 2 }}>
      <Text style={styles.muted}>
        {`${new Date(r.receivedAt).toLocaleString()} · ${r.receivedByName}`}
      </Text>
      {r.lines.map((l) => (
        <Text key={l.id} style={styles.body}>
          {`${l.quantity > 0 ? '+' : ''}${l.quantity} × ${l.catalogItemName}${l.note ? ` (${l.note})` : ''}`}
        </Text>
      ))}
    </View>
  );
}

function ReceiptForm(props: {
  company: CompanyMembership;
  order: PurchaseOrder;
}) {
  const { company, order } = props;
  const [drafts, setDrafts] = useState<ReceiptLineDraft[]>(emptyDrafts(order));
  const save = useCompanyMutation(
    company.companyId,
    (api, token, body: NonNullable<ReturnType<typeof toReceiptRequest>>) =>
      api.recordGoodsReceipt(token, company.companyId, order.id, body),
  );
  const request = toReceiptRequest(order, drafts);
  const change = (next: ReceiptLineDraft) =>
    setDrafts(
      drafts.map((d) =>
        d.purchaseOrderLineId === next.purchaseOrderLineId ? next : d,
      ),
    );
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.muted}>
        Confirm a delivery. Leave a line blank if nothing arrived for it. To
        correct an earlier entry, enter a negative number and a note.
      </Text>
      {order.lines.map((l) => {
        const draft = drafts.find((d) => d.purchaseOrderLineId === l.id)!;
        const issue = lineIssue(order, draft);
        return (
          <View key={l.id} style={{ gap: 4 }}>
            <Text style={styles.body}>
              {`${l.catalogItemName}: ${l.receivedQuantity} of ${l.quantity} received`}
            </Text>
            <TextField
              label={`Received now of ${l.catalogItemName}`}
              keyboardType="decimal-pad"
              value={draft.quantity}
              onChangeText={(quantity) => change({ ...draft, quantity })}
            />
            <TextField
              label={`Note for ${l.catalogItemName}`}
              placeholder="Optional, for example damage"
              value={draft.note}
              onChangeText={(note) => change({ ...draft, note })}
            />
            {issue && <Text style={styles.error}>{issue}</Text>}
          </View>
        );
      })}
      <Button
        label="Record delivery"
        disabled={save.isPending || request === null}
        onPress={() =>
          request &&
          save.mutate(request, {
            onSuccess: () => setDrafts(emptyDrafts(order)),
          })
        }
      />
      {save.isError && <ErrorNote message={writeErrorMessage(save.error)} />}
    </View>
  );
}

function CloseOrder(props: {
  company: CompanyMembership;
  order: PurchaseOrder;
}) {
  const close = useCompanyMutation(props.company.companyId, (api, token) =>
    api.closePurchaseOrder(token, props.company.companyId, props.order.id),
  );
  return (
    <>
      <Button
        label="Close order"
        disabled={close.isPending}
        onPress={() => close.mutate(undefined)}
      />
      {close.isError && <ErrorNote message={writeErrorMessage(close.error)} />}
    </>
  );
}
