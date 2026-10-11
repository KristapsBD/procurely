import type {
  ApprovalRule,
  ApproverRole,
  CompanyMembership,
  CreateApprovalRuleRequest,
} from '@procurely/shared-types';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { EmptyState } from '../components/empty-state';
import { ScreenHeader } from '../components/screen-header';
import {
  Button,
  ErrorNote,
  FormActions,
  ListRow,
  Loading,
  Money,
  TextField,
  styles,
} from '../components/ui';
import { approverRoleLabel } from '../features/approvals';
import {
  useApprovalRules,
  useCompanyMutation,
  useSignOutWhenUnauthorized,
  writeErrorMessage,
} from '../features/data';
import { formatMoney, parseMoney } from '../features/money';
import { canManageApprovalRules } from '../features/permissions';
import { CompanyLine, WithActiveCompany } from './with-active-company';

const ROLES: ApproverRole[] = ['APPROVER', 'ADMIN'];

/** The company's approval rules. Admins only. */
export function ApprovalRulesScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <ScreenHeader
        title="Approval rules"
        lead={{
          kind: 'back',
          label: 'Company',
          onPress: () => router.replace('/company'),
        }}
      />
      <WithActiveCompany>
        {(active) =>
          canManageApprovalRules(active.role) ? (
            <Rules key={active.companyId} company={active} />
          ) : (
            <>
              <CompanyLine company={active} />
              <EmptyState title="Approval rules are for admins." />
            </>
          )
        }
      </WithActiveCompany>
    </ScrollView>
  );
}

function Rules(props: { company: CompanyMembership }) {
  const { company } = props;
  const rules = useApprovalRules(company.companyId);
  const unauthorized = useSignOutWhenUnauthorized(rules.error);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <CompanyLine company={company} />
      <Text style={styles.muted}>
        A requisition follows the rule with the highest threshold at or below
        its total. Below every threshold it is approved on submit. Without any
        rule, an admin decides.
      </Text>
      {!adding && (
        <Button
          label="Add approval rule"
          variant="primary"
          onPress={() => setAdding(true)}
        />
      )}
      {adding && (
        <NewRuleForm company={company} onDone={() => setAdding(false)} />
      )}
      {rules.isPending && <Loading label="Loading approval rules" />}
      {rules.isError && !unauthorized && (
        <ErrorNote
          message="Could not load approval rules."
          onRetry={() => void rules.refetch()}
        />
      )}
      {rules.data && rules.data.length === 0 && (
        <EmptyState title="No approval rules: an admin decides every requisition." />
      )}
      {rules.data?.map((rule) => (
        <RuleCard key={rule.id} company={company} rule={rule} />
      ))}
    </>
  );
}

function NewRuleForm(props: {
  company: CompanyMembership;
  onDone: () => void;
}) {
  const { companyId, currency } = props.company;
  const [threshold, setThreshold] = useState('');
  const [role, setRole] = useState<ApproverRole>('APPROVER');
  const create = useCompanyMutation(
    companyId,
    (api, token, body: CreateApprovalRuleRequest) =>
      api.createApprovalRule(token, companyId, body),
  );
  const thresholdMinor = parseMoney(threshold);
  const badThreshold = threshold.trim() !== '' && thresholdMinor === null;
  return (
    <View style={styles.card}>
      <TextField
        label={`Threshold (${currency})`}
        placeholder="0.00"
        keyboardType="decimal-pad"
        value={threshold}
        onChangeText={setThreshold}
      />
      {badThreshold && (
        <Text style={styles.error}>Enter an amount like 500.00</Text>
      )}
      <Text style={styles.muted}>Required role</Text>
      <View style={styles.row}>
        {ROLES.map((r) => (
          <Button
            key={r}
            label={approverRoleLabel(r)}
            selected={r === role}
            onPress={() => setRole(r)}
          />
        ))}
      </View>
      <FormActions
        saveLabel="Save rule"
        canSave={!create.isPending && thresholdMinor !== null}
        onSave={() =>
          thresholdMinor !== null &&
          create.mutate(
            { thresholdMinor, requiredRole: role },
            { onSuccess: props.onDone },
          )
        }
        onCancel={props.onDone}
        error={create.isError ? writeErrorMessage(create.error) : null}
      />
    </View>
  );
}

function RuleCard(props: { company: CompanyMembership; rule: ApprovalRule }) {
  const { companyId, currency } = props.company;
  const { id, thresholdMinor, requiredRole } = props.rule;
  const amount = formatMoney(thresholdMinor, currency);
  const remove = useCompanyMutation(companyId, (api, token) =>
    api.deleteApprovalRule(token, companyId, id),
  );
  return (
    <ListRow
      title={`${approverRoleLabel(requiredRole)} approves`}
      trailing={
        <Money label="From" minor={thresholdMinor} currency={currency} />
      }
    >
      <Button
        label="Delete"
        variant="destructive"
        accessibilityLabel={`Delete rule from ${amount}`}
        disabled={remove.isPending}
        onPress={() => remove.mutate(undefined)}
      />
      {remove.isError && (
        <ErrorNote message={writeErrorMessage(remove.error)} />
      )}
    </ListRow>
  );
}
