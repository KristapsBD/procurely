import type { CompanyMembership, PurchaseOrder } from '@procurely/shared-types';
import type { GoodsReceipt } from '@procurely/shared-types';
import { Text, View } from 'react-native';
import { ReceiptNote } from '../components/receipt-note';
import { ReceiptProgress } from '../components/receipt-progress';
import { ScreenHeader } from '../components/screen-header';
import { theme } from '../components/theme';
import {
  Button,
  ErrorNote,
  Loading,
  Money,
  StatusBadge,
  styles,
} from '../components/ui';
import { useGoodsReceipts } from '../features/data';
import { lineNotes, orderReference } from '../features/order-lines';
import { canRaisePurchaseOrders } from '../features/permissions';
import { formatMoney } from '../features/money';
import { CloseOrder, Deliveries } from './goods-receipt-panel';

/** One order: its lines with how much of each has arrived, the total, and what a buyer can do next. */
export function OrderDetail(props: {
  company: CompanyMembership;
  order: PurchaseOrder;
  onBack: () => void;
  onRecord: () => void;
}) {
  const { company, order } = props;
  const receipts = useGoodsReceipts(company.companyId, order.id);
  const canWrite = canRaisePurchaseOrders(company.role);
  return (
    <>
      <ScreenHeader
        lead={{ kind: 'back', label: 'Orders', onPress: props.onBack }}
        title={orderReference(order.id)}
        aside={<StatusBadge status={order.status} />}
        subtitle={`${order.supplierName} · ${order.requisitionJustification}`}
      />
      <LinesCard
        order={order}
        currency={company.currency}
        receipts={receipts.data ?? []}
      />
      {order.closedAt && (
        <Text style={styles.muted}>
          {`Closed by ${order.closedByName} on ${new Date(order.closedAt).toLocaleDateString()}`}
        </Text>
      )}
      {canWrite && order.status !== 'CLOSED' && (
        <Button
          variant="primary"
          label="Record receipt"
          onPress={props.onRecord}
        />
      )}
      {receipts.isPending && <Loading label="Loading deliveries" />}
      {receipts.isError && (
        <ErrorNote
          message="Could not load deliveries."
          onRetry={() => void receipts.refetch()}
        />
      )}
      {receipts.data && <Deliveries receipts={receipts.data} />}
      {canWrite && order.status === 'FULLY_RECEIVED' && (
        <CloseOrder company={company} order={order} />
      )}
    </>
  );
}

function LinesCard(props: {
  order: PurchaseOrder;
  currency: string;
  receipts: GoodsReceipt[];
}) {
  const { order, currency } = props;
  return (
    <View style={styles.card}>
      {order.lines.map((l) => (
        <View key={l.id} style={lineStyle}>
          <View style={titleLine}>
            <Text style={[styles.rowTitle, { flex: 1 }]}>
              {l.catalogItemName}
            </Text>
            <Money minor={l.amountMinor} currency={currency} />
          </View>
          <Text style={styles.muted}>
            {`${l.quantity} ordered × ${formatMoney(l.unitPriceMinor, currency)}`}
          </Text>
          <ReceiptProgress received={l.receivedQuantity} ordered={l.quantity} />
          {lineNotes(props.receipts, l.id).map((n, i) => (
            <ReceiptNote key={i} kind={n.kind} text={n.text} />
          ))}
        </View>
      ))}
      <View style={titleLine}>
        <Text style={[styles.muted, { flex: 1 }]}>Order total</Text>
        <Money
          minor={order.totalMinor}
          currency={currency}
          style={{ fontSize: 20 }}
        />
      </View>
    </View>
  );
}

const lineStyle = {
  gap: 10,
  paddingBottom: theme.space.md,
  borderBottomWidth: 1,
  borderBottomColor: theme.palette.divider,
} as const;

const titleLine = {
  flexDirection: 'row',
  alignItems: 'baseline',
  gap: theme.space.md,
} as const;
