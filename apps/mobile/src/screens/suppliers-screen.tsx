import type { CompanyMembership, Supplier } from '@procurely/shared-types';
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
  useCompanyMutation,
  useSignOutWhenUnauthorized,
  useSuppliers,
  writeErrorMessage,
} from '../features/data';
import { canManagePurchasing } from '../features/permissions';
import { CompanyLine, WithActiveCompany } from './with-active-company';

/** The suppliers of the company the person acts in. Buyers and admins manage them. */
export function SuppliersScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <WithActiveCompany>
        {(active) => <Suppliers company={active} />}
      </WithActiveCompany>
    </ScrollView>
  );
}

function Suppliers(props: { company: CompanyMembership }) {
  const { companyId, role } = props.company;
  const suppliers = useSuppliers(companyId, { selectable: false });
  const unauthorized = useSignOutWhenUnauthorized(suppliers.error);
  const canManage = canManagePurchasing(role);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <CompanyLine company={props.company} />
      {canManage && !adding && (
        <Button label="Add supplier" onPress={() => setAdding(true)} />
      )}
      {adding && (
        <SupplierNameForm
          companyId={companyId}
          label="New supplier name"
          initialName=""
          onDone={() => setAdding(false)}
        />
      )}
      {suppliers.isPending && <Loading label="Loading suppliers" />}
      {suppliers.isError && !unauthorized && (
        <ErrorNote
          message="Could not load suppliers."
          onRetry={() => void suppliers.refetch()}
        />
      )}
      {suppliers.data && suppliers.data.length === 0 && (
        <Text style={styles.body}>No suppliers yet.</Text>
      )}
      {suppliers.data?.map((s) => (
        <SupplierCard key={s.id} supplier={s} canManage={canManage} />
      ))}
    </>
  );
}

/** Creates a supplier, or renames one when `supplierId` is given. */
function SupplierNameForm(props: {
  companyId: string;
  supplierId?: string;
  label: string;
  initialName: string;
  onDone: () => void;
}) {
  const { companyId, supplierId } = props;
  const [name, setName] = useState(props.initialName);
  const save = useCompanyMutation(companyId, (api, token, next: string) =>
    supplierId
      ? api.updateSupplier(token, companyId, supplierId, { name: next })
      : api.createSupplier(token, companyId, { name: next }),
  );
  return (
    <View style={styles.card}>
      <TextField label={props.label} value={name} onChangeText={setName} />
      <FormActions
        saveLabel="Save supplier"
        canSave={!save.isPending && name.trim() !== ''}
        onSave={() => save.mutate(name.trim(), { onSuccess: props.onDone })}
        onCancel={props.onDone}
        error={save.isError ? writeErrorMessage(save.error) : null}
      />
    </View>
  );
}

function SupplierCard(props: { supplier: Supplier; canManage: boolean }) {
  const { id, companyId, name, active } = props.supplier;
  const [editing, setEditing] = useState(false);
  const setActive = useCompanyMutation(companyId, (api, token, next: boolean) =>
    api.updateSupplier(token, companyId, id, { active: next }),
  );
  if (editing) {
    return (
      <SupplierNameForm
        companyId={companyId}
        supplierId={id}
        label={`New name for ${name}`}
        initialName={name}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.body}>{name}</Text>
      <Text style={styles.muted}>
        {active ? 'Active' : 'Inactive: cannot be chosen for new orders'}
      </Text>
      {props.canManage && (
        <View style={styles.row}>
          <Button
            label="Rename"
            accessibilityLabel={`Rename ${name}`}
            onPress={() => setEditing(true)}
          />
          <Button
            label={active ? 'Deactivate' : 'Reactivate'}
            accessibilityLabel={`${active ? 'Deactivate' : 'Reactivate'} ${name}`}
            disabled={setActive.isPending}
            onPress={() => setActive.mutate(!active)}
          />
        </View>
      )}
      {setActive.isError && (
        <ErrorNote message={writeErrorMessage(setActive.error)} />
      )}
    </View>
  );
}
