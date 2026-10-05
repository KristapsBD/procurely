import type { CompanyMembership, Requisition } from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ErrorNote, Loading, styles } from '../components/ui';
import { approvalNote } from '../features/approvals';
import { useRequisitions, useSignOutWhenUnauthorized } from '../features/data';
import { formatMoney } from '../features/money';
import { canDecideRequisitions } from '../features/permissions';
import { DecisionPanel } from './decision-panel';
import { statusLabel, titleOf } from './requisitions-screen';
import { CompanyLine, WithActiveCompany } from './with-active-company';

/** The submitted requisitions the person may approve or reject. For approvers and admins. */
export function ApprovalsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <WithActiveCompany>
        {(active) =>
          canDecideRequisitions(active.role) ? (
            <Inbox key={active.companyId} company={active} />
          ) : (
            <>
              <CompanyLine company={active} />
              <Text style={styles.body}>
                Approvals are for approvers and admins.
              </Text>
            </>
          )
        }
      </WithActiveCompany>
    </ScrollView>
  );
}

function decidable(r: Requisition): boolean {
  return r.actions.includes('approve') || r.actions.includes('reject');
}

function Inbox(props: { company: CompanyMembership }) {
  const { company } = props;
  const requisitions = useRequisitions(company.companyId);
  const unauthorized = useSignOutWhenUnauthorized(requisitions.error);
  const [lastDecided, setLastDecided] = useState<Requisition | null>(null);
  const waiting = requisitions.data?.filter(decidable) ?? [];
  return (
    <>
      <CompanyLine company={company} />
      <Text style={styles.heading}>Waiting for your decision</Text>
      {lastDecided && (
        <Text style={styles.body} accessibilityRole="alert">
          {`${statusLabel(lastDecided.status)}: ${titleOf(lastDecided)}`}
        </Text>
      )}
      {requisitions.isPending && <Loading label="Loading approvals" />}
      {requisitions.isError && !unauthorized && (
        <ErrorNote
          message="Could not load approvals."
          onRetry={() => void requisitions.refetch()}
        />
      )}
      {requisitions.data && waiting.length === 0 && (
        <Text style={styles.body}>Nothing is waiting for your decision.</Text>
      )}
      {waiting.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.body}>{titleOf(r)}</Text>
          <Text style={styles.muted}>
            {`${formatMoney(r.totalMinor, company.currency)} · requested by ${r.requesterName}`}
          </Text>
          {r.lines.map((l) => (
            <Text key={l.id} style={styles.muted}>
              {`${l.quantity} × ${l.catalogItemName}`}
            </Text>
          ))}
          <Text style={styles.muted}>{approvalNote(r)}</Text>
          <DecisionPanel
            companyId={company.companyId}
            requisition={r}
            title={titleOf(r)}
            onDecided={setLastDecided}
          />
        </View>
      ))}
    </>
  );
}
