import type {
  CompanyMembership,
  CostCenter,
  CreateCostCenterRequest,
} from '@procurely/shared-types';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { EmptyState } from '../components/empty-state';
import { NavRow } from '../components/nav-row';
import { ScreenHeader } from '../components/screen-header';
import { SectionLabel } from '../components/section-label';
import { theme } from '../components/theme';
import {
  Button,
  ErrorNote,
  FormActions,
  ListRow,
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
  canManageApprovalRules,
  canManageCostCenters,
  canManageMembers,
} from '../features/permissions';
import { useSession } from '../session/session';
import { CompanyLine, WithActiveCompany } from './with-active-company';

export function CompanyScreen() {
  const { state, signOut } = useSession();
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader
        title="Company"
        lead={{ kind: 'company' }}
        subtitle={
          state.status === 'signedIn'
            ? `Signed in as ${state.person.name}`
            : undefined
        }
      />
      <WithActiveCompany>
        {(active) => (
          <>
            <CompanyLine company={active} />
            {canManageApprovalRules(active.role) && (
              <NavRow
                title="Approval rules"
                meta="Who approves a requisition, by amount"
                onPress={() => router.push('/approval-rules')}
              />
            )}
            {canManageMembers(active.role) && (
              <NavRow
                title="Members"
                meta="Invite people and set their roles"
                onPress={() => router.push('/members')}
              />
            )}
            {canManageCostCenters(active.role) && (
              <CostCenters company={active} />
            )}
          </>
        )}
      </WithActiveCompany>
      <Button label="Sign out" onPress={() => void signOut()} />
    </ScrollView>
  );
}

function CostCenters(props: { company: CompanyMembership }) {
  const { companyId, role } = props.company;
  const costCenters = useCostCenters(companyId);
  const unauthorized = useSignOutWhenUnauthorized(costCenters.error);
  const canManage = canManageCostCenters(role);
  const [adding, setAdding] = useState(false);
  return (
    <View style={{ gap: theme.space.sm }}>
      <SectionLabel label="Cost centers" />
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
        <EmptyState title="No cost centers yet." />
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
    <ListRow title={code} meta={renaming ? undefined : name}>
      {renaming && (
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
            variant="destructive"
            accessibilityLabel={`Delete ${code}`}
            disabled={remove.isPending}
            onPress={() => remove.mutate(undefined)}
          />
        </View>
      )}
      {error && <ErrorNote message={writeErrorMessage(error)} />}
    </ListRow>
  );
}
