import type {
  CatalogItem,
  CompanyMembership,
  CreateCatalogItemRequest,
} from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
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
  useSignOutWhenUnauthorized,
  useSuppliers,
  writeErrorMessage,
} from '../features/data';
import { formatMoney, parseMoney } from '../features/money';
import { canManagePurchasing } from '../features/permissions';
import { CompanyLine, WithActiveCompany } from './with-active-company';

/** The catalog of the company the person acts in. Everyone reads; buyers and admins manage. */
export function CatalogScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <WithActiveCompany>
        {(active) => <Catalog company={active} />}
      </WithActiveCompany>
    </ScrollView>
  );
}

function Catalog(props: { company: CompanyMembership }) {
  const { companyId, role } = props.company;
  const items = useCatalogItems(companyId);
  const unauthorized = useSignOutWhenUnauthorized(items.error);
  const canManage = canManagePurchasing(role);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <CompanyLine company={props.company} />
      {canManage && !adding && (
        <Button label="Add item" onPress={() => setAdding(true)} />
      )}
      {adding && (
        <CatalogItemForm
          company={props.company}
          onDone={() => setAdding(false)}
        />
      )}
      {items.isPending && <Loading label="Loading catalog" />}
      {items.isError && !unauthorized && (
        <ErrorNote
          message="Could not load the catalog."
          onRetry={() => void items.refetch()}
        />
      )}
      {items.data && items.data.length === 0 && (
        <Text style={styles.body}>No catalog items yet.</Text>
      )}
      {items.data?.map((item) => (
        <CatalogItemCard
          key={item.id}
          item={item}
          company={props.company}
          canManage={canManage}
        />
      ))}
    </>
  );
}

/** The request the form would send, or null while a field is missing or invalid. */
function toRequest(
  supplierId: string | null,
  name: string,
  price: string,
): CreateCatalogItemRequest | null {
  const unitPriceMinor = parseMoney(price);
  if (supplierId === null || name.trim() === '' || unitPriceMinor === null) {
    return null;
  }
  return { supplierId, name: name.trim(), unitPriceMinor };
}

/** Creates an item, or updates `item` when given. */
function useSaveCatalogItem(companyId: string, item?: CatalogItem) {
  return useCompanyMutation(
    companyId,
    (api, token, body: CreateCatalogItemRequest) =>
      item
        ? api.updateCatalogItem(token, companyId, item.id, body)
        : api.createCatalogItem(token, companyId, body),
  );
}

/** Adds an item, or edits `item` when given. */
function CatalogItemForm(props: {
  company: CompanyMembership;
  item?: CatalogItem;
  onDone: () => void;
}) {
  const { companyId, currency } = props.company;
  const { item } = props;
  const [supplierId, setSupplierId] = useState(item?.supplierId ?? null);
  const [name, setName] = useState(item?.name ?? '');
  const [price, setPrice] = useState(
    item ? formatMoney(item.unitPriceMinor, '').trim() : '',
  );
  const save = useSaveCatalogItem(companyId, item);
  const request = toRequest(supplierId, name, price);
  const badPrice = price.trim() !== '' && parseMoney(price) === null;
  return (
    <View style={styles.card}>
      <SupplierChoice
        companyId={companyId}
        current={item}
        selectedId={supplierId}
        onSelect={setSupplierId}
      />
      <TextField label="Item name" value={name} onChangeText={setName} />
      <TextField
        label={`Unit price (${currency})`}
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
      />
      {badPrice && <Text style={styles.error}>Enter a price like 24.99</Text>}
      <FormActions
        saveLabel="Save item"
        canSave={!save.isPending && request !== null}
        onSave={() =>
          request && save.mutate(request, { onSuccess: props.onDone })
        }
        onCancel={props.onDone}
        error={save.isError ? writeErrorMessage(save.error) : null}
      />
    </View>
  );
}

/**
 * Picks a supplier among those that may be chosen for new work (active ones). An item being
 * edited keeps its current supplier as an option even when that supplier became inactive.
 */
function SupplierChoice(props: {
  companyId: string;
  current?: CatalogItem;
  selectedId: string | null;
  onSelect: (supplierId: string) => void;
}) {
  const suppliers = useSuppliers(props.companyId, { selectable: true });
  if (suppliers.isPending) return <Loading label="Loading suppliers" />;
  if (suppliers.isError)
    return <ErrorNote message="Could not load suppliers." />;
  const options = suppliers.data.map((s) => ({ id: s.id, name: s.name }));
  const { current } = props;
  if (current && !options.some((o) => o.id === current.supplierId)) {
    options.push({
      id: current.supplierId,
      name: `${current.supplierName} (inactive)`,
    });
  }
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.muted}>Supplier</Text>
      {options.length === 0 && (
        <Text style={styles.body}>Add an active supplier first.</Text>
      )}
      <View style={styles.row}>
        {options.map((o) => (
          <Button
            key={o.id}
            label={o.name}
            accessibilityLabel={`Supplier ${o.name}`}
            selected={o.id === props.selectedId}
            onPress={() => props.onSelect(o.id)}
          />
        ))}
      </View>
    </View>
  );
}

function CatalogItemCard(props: {
  item: CatalogItem;
  company: CompanyMembership;
  canManage: boolean;
}) {
  const { item, company } = props;
  const [editing, setEditing] = useState(false);
  const remove = useCompanyMutation(company.companyId, (api, token) =>
    api.deleteCatalogItem(token, company.companyId, item.id),
  );
  if (editing) {
    return (
      <CatalogItemForm
        company={company}
        item={item}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.body}>{item.name}</Text>
      <Text style={styles.muted}>
        {`${item.supplierName} · ${formatMoney(item.unitPriceMinor, company.currency)}`}
      </Text>
      {!item.supplierActive && (
        <Text style={styles.muted}>Supplier inactive: cannot be ordered</Text>
      )}
      {props.canManage && (
        <View style={styles.row}>
          <Button
            label="Edit"
            accessibilityLabel={`Edit ${item.name}`}
            onPress={() => setEditing(true)}
          />
          <Button
            label="Delete"
            accessibilityLabel={`Delete ${item.name}`}
            disabled={remove.isPending}
            onPress={() => remove.mutate(undefined)}
          />
        </View>
      )}
      {remove.isError && (
        <ErrorNote message={writeErrorMessage(remove.error)} />
      )}
    </View>
  );
}
