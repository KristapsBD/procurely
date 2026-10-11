import type {
  CompanyMembership,
  GoodsReceipt,
  PurchaseOrder,
} from '@procurely/shared-types';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Caption } from '../components/caption';
import { EmptyState } from '../components/empty-state';
import { ReceiptProgress } from '../components/receipt-progress';
import { RowCard, RowItem } from '../components/row-card';
import { ScreenHeader } from '../components/screen-header';
import { Button, ErrorNote, TextField, styles } from '../components/ui';
import { useCompanyMutation, writeErrorMessage } from '../features/data';
import {
  type ReceiptLineDraft,
  emptyDrafts,
  lineIssue,
  toReceiptRequest,
} from '../features/goods-receipts';

export function Deliveries(props: { receipts: GoodsReceipt[] }) {
  if (props.receipts.length === 0) {
    return <EmptyState title="Nothing received yet." />;
  }
  return (
    <View style={{ gap: 8 }}>
      <Caption>Deliveries</Caption>
      <RowCard>
        {props.receipts.map((r) => (
          <RowItem
            key={r.id}
            title={`${new Date(r.receivedAt).toLocaleString()} · ${r.receivedByName}`}
            meta={r.lines
              .map(
                (l) =>
                  `${l.quantity > 0 ? '+' : ''}${l.quantity} × ${l.catalogItemName}${l.note ? ` (${l.note})` : ''}`,
              )
              .join('\n')}
          />
        ))}
      </RowCard>
    </View>
  );
}

/**
 * Confirms a delivery against one order. A receipt cannot be edited; a mistake is corrected by a
 * later entry with a negative quantity and a note.
 */
export function ReceiptEntryScreen(props: {
  company: CompanyMembership;
  order: PurchaseOrder;
  onBack: () => void;
  onRecorded: () => void;
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
    <>
      <ScreenHeader
        lead={{
          kind: 'back',
          label: 'Order',
          onPress: props.onBack,
        }}
        title="Record receipt"
        subtitle={`${order.supplierName} · ${order.requisitionJustification}`}
      />
      <Text style={styles.muted}>
        Confirm a delivery. Leave a line blank if nothing arrived for it. To
        correct an earlier entry, enter a negative number and a note.
      </Text>
      {order.lines.map((l) => {
        const draft = drafts.find((d) => d.purchaseOrderLineId === l.id)!;
        const issue = lineIssue(order, draft);
        return (
          <View key={l.id} style={styles.card}>
            <Text style={styles.rowTitle}>{l.catalogItemName}</Text>
            <ReceiptProgress
              received={l.receivedQuantity}
              ordered={l.quantity}
            />
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
        variant="primary"
        disabled={save.isPending || request === null}
        onPress={() =>
          request && save.mutate(request, { onSuccess: props.onRecorded })
        }
      />
      {save.isError && <ErrorNote message={writeErrorMessage(save.error)} />}
    </>
  );
}

export function CloseOrder(props: {
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
