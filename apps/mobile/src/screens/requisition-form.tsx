import type {
  CatalogItem,
  CompanyMembership,
  Requisition,
  SaveRequisitionRequest,
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
  useCostCenters,
  writeErrorMessage,
} from '../features/data';
import { formatMoney } from '../features/money';

interface DraftLine {
  catalogItemId: string;
  name: string;
  /** As typed, so a half-typed quantity can be shown and corrected. */
  quantity: string;
}

const QUANTITY = /^\d{1,6}$/;

function parseQuantity(text: string): number | null {
  const trimmed = text.trim();
  if (!QUANTITY.test(trimmed)) return null;
  const quantity = Number(trimmed);
  return quantity >= 1 ? quantity : null;
}

/** The request the form would send, or null while a quantity is not a whole number of 1 or more. */
function toRequest(
  costCenterId: string | null,
  justification: string,
  lines: DraftLine[],
): SaveRequisitionRequest | null {
  const parsed = lines.map((l) => ({
    catalogItemId: l.catalogItemId,
    quantity: parseQuantity(l.quantity),
  }));
  if (parsed.some((l) => l.quantity === null)) return null;
  return {
    costCenterId,
    justification: justification.trim(),
    lines: parsed.map((l) => ({ ...l, quantity: l.quantity as number })),
  };
}

/** What the lines would cost at today's catalog prices; the API prices them on save. */
function estimate(lines: DraftLine[], catalog: CatalogItem[]): number {
  return lines.reduce((sum, l) => {
    const price = catalog.find((i) => i.id === l.catalogItemId)?.unitPriceMinor;
    return sum + (price ?? 0) * (parseQuantity(l.quantity) ?? 0);
  }, 0);
}

/** The form's starting values: the draft being edited, or an empty one. */
function initialDraft(r?: Requisition) {
  return {
    costCenterId: r?.costCenterId ?? null,
    justification: r?.justification ?? '',
    lines: (r?.lines ?? []).map((l) => ({
      catalogItemId: l.catalogItemId,
      name: l.catalogItemName,
      quantity: String(l.quantity),
    })),
  };
}

function useSaveRequisition(companyId: string, requisition?: Requisition) {
  return useCompanyMutation(
    companyId,
    (api, token, body: SaveRequisitionRequest) =>
      requisition
        ? api.updateRequisition(token, companyId, requisition.id, body)
        : api.createRequisition(token, companyId, body),
  );
}

/** Creates a draft, or replaces the draft `requisition` when given. */
export function RequisitionForm(props: {
  company: CompanyMembership;
  requisition?: Requisition;
  onSaved: (saved: Requisition) => void;
  onCancel: () => void;
}) {
  const { companyId, currency } = props.company;
  const [initial] = useState(() => initialDraft(props.requisition));
  const [costCenterId, setCostCenterId] = useState(initial.costCenterId);
  const [justification, setJustification] = useState(initial.justification);
  const [lines, setLines] = useState<DraftLine[]>(initial.lines);
  const catalog = useCatalogItems(companyId);
  const save = useSaveRequisition(companyId, props.requisition);
  const request = toRequest(costCenterId, justification, lines);
  return (
    <View style={styles.card}>
      <CostCenterChoice
        companyId={companyId}
        selectedId={costCenterId}
        onSelect={setCostCenterId}
      />
      <TextField
        label="Justification"
        value={justification}
        onChangeText={setJustification}
      />
      {lines.map((l) => (
        <LineField
          key={l.catalogItemId}
          line={l}
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
      {catalog.isPending && <Loading label="Loading catalog" />}
      {catalog.isError && <ErrorNote message="Could not load the catalog." />}
      {catalog.data && (
        <>
          <ItemChoice
            catalog={catalog.data}
            currency={currency}
            chosen={lines}
            onAdd={(item) =>
              setLines([
                ...lines,
                { catalogItemId: item.id, name: item.name, quantity: '1' },
              ])
            }
          />
          <Text style={styles.body}>
            {`Estimated total ${formatMoney(estimate(lines, catalog.data), currency)}`}
          </Text>
        </>
      )}
      <FormActions
        saveLabel="Save draft"
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

function LineField(props: {
  line: DraftLine;
  onChange: (line: DraftLine) => void;
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
      <Button
        label="Remove"
        accessibilityLabel={`Remove ${line.name}`}
        onPress={props.onRemove}
      />
    </View>
  );
}

function CostCenterChoice(props: {
  companyId: string;
  selectedId: string | null;
  onSelect: (costCenterId: string) => void;
}) {
  const costCenters = useCostCenters(props.companyId);
  if (costCenters.isPending) return <Loading label="Loading cost centers" />;
  if (costCenters.isError) {
    return <ErrorNote message="Could not load cost centers." />;
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>Cost center</Text>
      <View style={styles.row}>
        {costCenters.data.map((cc) => (
          <Button
            key={cc.id}
            label={cc.code}
            accessibilityLabel={`Cost center ${cc.code}`}
            selected={cc.id === props.selectedId}
            onPress={() => props.onSelect(cc.id)}
          />
        ))}
      </View>
    </View>
  );
}

/** Catalog items that may still be added: those of active suppliers, not already on a line. */
function ItemChoice(props: {
  catalog: CatalogItem[];
  currency: string;
  chosen: DraftLine[];
  onAdd: (item: CatalogItem) => void;
}) {
  const offered = props.catalog.filter(
    (i) =>
      i.supplierActive && !props.chosen.some((l) => l.catalogItemId === i.id),
  );
  if (offered.length === 0) return null;
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>Add from the catalog</Text>
      <View style={styles.row}>
        {offered.map((item) => (
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
