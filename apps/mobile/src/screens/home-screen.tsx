import type {
  CompanyMembership,
  CostCenter,
  CreateCostCenterRequest,
} from '@procurely/shared-types';
import { router } from 'expo-router';
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
  useCostCenters,
  useSignOutWhenUnauthorized,
  writeErrorMessage,
} from '../features/data';
import {
  canManageCostCenters,
  canRaiseRequisitions,
} from '../features/permissions';
import { useSession } from '../session/session';
import { CompanyLine, WithActiveCompany } from './with-active-company';

export function HomeScreen() {
  const { state, signOut, selectCompany } = useSession();
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.heading}>
        {state.status === 'signedIn' ? `Signed in as ${state.person.name}` : ''}
      </Text>
      <Button label="Sign out" onPress={() => void signOut()} />
      <WithActiveCompany>
        {(active, companies) => (
          <>
            <CompanySwitcher
              companies={companies}
              activeCompanyId={active.companyId}
              onSelect={selectCompany}
            />
            <CompanyLine company={active} />
            <View style={styles.row}>
              <Button
                label="Suppliers"
                onPress={() => router.push('/suppliers')}
              />
              <Button label="Catalog" onPress={() => router.push('/catalog')} />
              {canRaiseRequisitions(active.role) && (
                <Button
                  label="Requisitions"
                  onPress={() => router.push('/requisitions')}
                />
              )}
            </View>
            <CostCenters company={active} />
          </>
        )}
      </WithActiveCompany>
    </ScrollView>
  );
}

function CompanySwitcher(props: {
  companies: CompanyMembership[];
  activeCompanyId: string;
  onSelect: (companyId: string) => void;
}) {
  return (
    <View>
      <Text style={styles.heading}>Company</Text>
      <View style={styles.row}>
        {props.companies.map((c) => (
          <Button
            key={c.companyId}
            label={c.companyName}
            selected={c.companyId === props.activeCompanyId}
            onPress={() => props.onSelect(c.companyId)}
          />
        ))}
      </View>
    </View>
  );
}

function CostCenters(props: { company: CompanyMembership }) {
  const { companyId, role } = props.company;
  const costCenters = useCostCenters(companyId);
  const unauthorized = useSignOutWhenUnauthorized(costCenters.error);
  const canManage = canManageCostCenters(role);
  const [adding, setAdding] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.heading}>Cost centers</Text>
      {canManage && !adding && (
        <Button label="Add cost center" onPress={() => setAdding(true)} />
      )}
      {adding && (
        <NewCostCenterForm
          companyId={companyId}
          onDone={() => setAdding(false)}
        />
      )}
      {costCenters.isPending && <Loading label="Loading cost centers" />}
      {costCenters.isError && !unauthorized && (
        <ErrorNote
          message="Could not load cost centers."
          onRetry={() => void costCenters.refetch()}
        />
      )}
      {costCenters.data && costCenters.data.length === 0 && (
        <Text style={styles.body}>No cost centers yet.</Text>
      )}
      {costCenters.data?.map((cc) => (
        <CostCenterCard key={cc.id} costCenter={cc} canManage={canManage} />
      ))}
    </View>
  );
}

function NewCostCenterForm(props: { companyId: string; onDone: () => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const create = useCompanyMutation(
    props.companyId,
    (api, token, body: CreateCostCenterRequest) =>
      api.createCostCenter(token, props.companyId, body),
  );
  return (
    <View style={styles.card}>
      <TextField label="Cost center code" value={code} onChangeText={setCode} />
      <TextField label="Cost center name" value={name} onChangeText={setName} />
      <FormActions
        saveLabel="Save cost center"
        canSave={!create.isPending && code.trim() !== '' && name.trim() !== ''}
        onSave={() =>
          create.mutate(
            { code: code.trim(), name: name.trim() },
            { onSuccess: props.onDone },
          )
        }
        onCancel={props.onDone}
        error={create.isError ? writeErrorMessage(create.error) : null}
      />
    </View>
  );
}

function CostCenterCard(props: { costCenter: CostCenter; canManage: boolean }) {
  const { id, companyId, code, name } = props.costCenter;
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(name);
  const rename = useCompanyMutation(companyId, (api, token, next: string) =>
    api.renameCostCenter(token, companyId, id, { name: next }),
  );
  const remove = useCompanyMutation(companyId, (api, token) =>
    api.deleteCostCenter(token, companyId, id),
  );
  const error = rename.error ?? remove.error;
  return (
    <View style={styles.card}>
      <Text style={styles.body}>{code}</Text>
      {renaming ? (
        <>
          <TextField
            label={`New name for ${code}`}
            value={newName}
            onChangeText={setNewName}
          />
          <FormActions
            saveLabel="Save"
            saveAccessibilityLabel={`Save name of ${code}`}
            canSave={!rename.isPending && newName.trim() !== ''}
            onSave={() =>
              rename.mutate(newName.trim(), {
                onSuccess: () => setRenaming(false),
              })
            }
            onCancel={() => setRenaming(false)}
            error={null}
          />
        </>
      ) : (
        <Text style={styles.muted}>{name}</Text>
      )}
      {props.canManage && !renaming && (
        <View style={styles.row}>
          <Button
            label="Rename"
            accessibilityLabel={`Rename ${code}`}
            onPress={() => {
              setNewName(name);
              setRenaming(true);
            }}
          />
          <Button
            label="Delete"
            accessibilityLabel={`Delete ${code}`}
            disabled={remove.isPending}
            onPress={() => remove.mutate(undefined)}
          />
        </View>
      )}
      {error && <ErrorNote message={writeErrorMessage(error)} />}
    </View>
  );
}
