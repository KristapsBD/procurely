import type {
  CatalogItem,
  CompanyMembership,
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  Requisition,
} from '@procurely/shared-types';
import { useState } from 'react';
import { Text, View } from 'react-native';
import {
  Button,
  ErrorNote,
  FormActions,
  Loading,
  TextField,
  styles,
} from '../components/ui';
import {
  useCatalogItems,
  useCompanyMutation,
  useSuppliers,
  writeErrorMessage,
} from '../features/data';
import { formatAmount, formatMoney, parseMoney } from '../features/money';
import {
  type OrderLineDraft,
  estimateTotal,
  initialLines,
  parseQuantity,
  toOrderRequest,
} from '../features/purchase-orders';

/** The requisition and supplier chosen so far, and the lines that follow from them. */
function useOrderDraft(catalog: CatalogItem[] | undefined) {
  const [requisition, setRequisition] = useState<Requisition | null>(null);
  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [lines, setLines] = useState<OrderLineDraft[]>([]);
  const choose = (next: { requisition?: Requisition; supplier?: string }) => {
    const r = next.requisition ?? requisition;
    const s = next.supplier ?? supplierId;
    if (next.requisition) setRequisition(next.requisition);
    if (next.supplier) setSupplierId(next.supplier);
    setLines(r && s && catalog ? initialLines(r, catalog, s) : []);
  };
  return { requisition, supplierId, lines, setLines, choose };
}

/** Turns one approved requisition into a purchase order for an active supplier. */
export function PurchaseOrderForm(props: {
  company: CompanyMembership;
  requisitions: Requisition[];
  onSaved: (saved: PurchaseOrder) => void;
  onCancel: () => void;
}) {
  const { companyId, currency } = props.company;
  const catalog = useCatalogItems(companyId);
  const { requisition, supplierId, lines, setLines, choose } = useOrderDraft(
    catalog.data,
  );
  const save = useCompanyMutation(
    companyId,
    (api, token, body: CreatePurchaseOrderRequest) =>
      api.createPurchaseOrder(token, companyId, body),
  );
  const request =
    requisition && supplierId
      ? toOrderRequest(requisition.id, supplierId, lines)
      : null;
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>New purchase order</Text>
      <RequisitionChoice
        requisitions={props.requisitions}
        currency={currency}
        selectedId={requisition?.id ?? null}
        onSelect={(r) => choose({ requisition: r })}
      />
      <SupplierChoice
        companyId={companyId}
        selectedId={supplierId}
        onSelect={(id) => choose({ supplier: id })}
      />
      {lines.map((l) => (
        <LineFields
          key={l.catalogItemId}
          line={l}
          currency={currency}
          onChange={(next) =>
            setLines(
              lines.map((x) =>
                x.catalogItemId === l.catalogItemId ? next : x,
              ),
            )
          }
          onRemove={() =>
            setLines(lines.filter((x) => x.catalogItemId !== l.catalogItemId))
          }
        />
      ))}
      {supplierId && catalog.data && (
        <ItemChoice
          items={catalog.data.filter(
            (i) =>
              i.supplierId === supplierId &&
              !lines.some((l) => l.catalogItemId === i.id),
          )}
          currency={currency}
          onAdd={(item) =>
            setLines([
              ...lines,
              {
                catalogItemId: item.id,
                name: item.name,
                quantity: '1',
                price: formatAmount(item.unitPriceMinor),
              },
            ])
          }
        />
      )}
      <Text style={styles.body}>
        {`Total ${formatMoney(estimateTotal(lines), currency)}`}
      </Text>
      <FormActions
        saveLabel="Create purchase order"
        canSave={!save.isPending && request !== null}
        onSave={() =>
          request && save.mutate(request, { onSuccess: props.onSaved })
        }
        onCancel={props.onCancel}
        error={save.isError ? writeErrorMessage(save.error) : null}
      />
    </View>
  );
}

function RequisitionChoice(props: {
  requisitions: Requisition[];
  currency: string;
  selectedId: string | null;
  onSelect: (requisition: Requisition) => void;
}) {
  return (
    <>
      <Text style={styles.muted}>Approved requisition</Text>
      {props.requisitions.length === 0 && (
        <Text style={styles.body}>
          No approved requisition is waiting to be ordered.
        </Text>
      )}
      <View style={styles.row}>
        {props.requisitions.map((r) => (
          <Button
            key={r.id}
            label={`${r.justification} · ${formatMoney(r.totalMinor, props.currency)}`}
            accessibilityLabel={`Order ${r.justification}`}
            selected={r.id === props.selectedId}
            onPress={() => props.onSelect(r)}
          />
        ))}
      </View>
    </>
  );
}

/** Only active suppliers are offered; the API refuses an inactive one all the same. */
function SupplierChoice(props: {
  companyId: string;
  selectedId: string | null;
  onSelect: (supplierId: string) => void;
}) {
  const suppliers = useSuppliers(props.companyId, { selectable: true });
  return (
    <>
      <Text style={styles.muted}>Supplier</Text>
      {suppliers.isPending && <Loading label="Loading suppliers" />}
      {suppliers.isError && (
        <ErrorNote message="Could not load the suppliers." />
      )}
      <View style={styles.row}>
        {suppliers.data?.map((s) => (
          <Button
            key={s.id}
            label={s.name}
            accessibilityLabel={`Supplier ${s.name}`}
            selected={s.id === props.selectedId}
            onPress={() => props.onSelect(s.id)}
          />
        ))}
      </View>
    </>
  );
}

function LineFields(props: {
  line: OrderLineDraft;
  currency: string;
  onChange: (line: OrderLineDraft) => void;
  onRemove: () => void;
}) {
  const { line } = props;
  return (
    <View style={{ gap: 4 }}>
      <TextField
        label={`Quantity of ${line.name}`}
        keyboardType="decimal-pad"
        value={line.quantity}
        onChangeText={(quantity) => props.onChange({ ...line, quantity })}
      />
      {parseQuantity(line.quantity) === null && (
        <Text style={styles.error}>Enter a whole number, 1 or more</Text>
      )}
      <TextField
        label={`Unit price of ${line.name} (${props.currency})`}
        keyboardType="decimal-pad"
        value={line.price}
        onChangeText={(price) => props.onChange({ ...line, price })}
      />
      {parseMoney(line.price) === null && (
        <Text style={styles.error}>Enter an amount such as 24.99</Text>
      )}
      <Button
        label="Remove"
        accessibilityLabel={`Remove ${line.name}`}
        onPress={props.onRemove}
      />
    </View>
  );
}

/** The chosen supplier's other catalog items, to add as lines. */
function ItemChoice(props: {
  items: CatalogItem[];
  currency: string;
  onAdd: (item: CatalogItem) => void;
}) {
  if (props.items.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>Add an item of this supplier</Text>
      <View style={styles.row}>
        {props.items.map((item) => (
          <Button
            key={item.id}
            label={`${item.name} · ${formatMoney(item.unitPriceMinor, props.currency)}`}
            accessibilityLabel={`Add ${item.name}`}
            onPress={() => props.onAdd(item)}
          />
        ))}
      </View>
    </View>
  );
}
