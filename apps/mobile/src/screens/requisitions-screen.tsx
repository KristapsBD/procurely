import type {
  CompanyMembership,
  Requisition,
  RequisitionAction,
  RequisitionStatus,
} from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Button, ErrorNote, Loading, styles } from '../components/ui';
import {
  useCompanyMutation,
  useCostCenters,
  useRequisitions,
  useSignOutWhenUnauthorized,
  writeErrorMessage,
} from '../features/data';
import { approvalNote } from '../features/approvals';
import { formatMoney } from '../features/money';
import { canRaiseRequisitions } from '../features/permissions';
import { DecisionPanel } from './decision-panel';
import { RequisitionForm } from './requisition-form';
import { CompanyLine, WithActiveCompany } from './with-active-company';

type Pane = { kind: 'list' } | { kind: 'new' } | { kind: 'open'; id: string };

export function statusLabel(status: RequisitionStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'Draft';
    case 'SUBMITTED':
      return 'Submitted';
    case 'APPROVED':
      return 'Approved';
    case 'REJECTED':
      return 'Rejected';
    case 'CANCELLED':
      return 'Cancelled';
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

export function titleOf(r: Requisition): string {
  return r.justification === '' ? 'Untitled draft' : r.justification;
}

/** Requisitions of the company the person acts in. For requesters and admins only. */
export function RequisitionsScreen() {
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <WithActiveCompany>
        {(active) =>
          canRaiseRequisitions(active.role) ? (
            // Keyed by company, so an open requisition never survives a company switch.
            <Requisitions key={active.companyId} company={active} />
          ) : (
            <>
              <CompanyLine company={active} />
              <Text style={styles.body}>
                Requisitions are for requesters and admins.
              </Text>
            </>
          )
        }
      </WithActiveCompany>
    </ScrollView>
  );
}

function Requisitions(props: { company: CompanyMembership }) {
  const { company } = props;
  const requisitions = useRequisitions(company.companyId);
  const unauthorized = useSignOutWhenUnauthorized(requisitions.error);
  const [pane, setPane] = useState<Pane>({ kind: 'list' });
  const toList = () => setPane({ kind: 'list' });
  const body = () => {
    switch (pane.kind) {
      case 'list':
        return (
          <RequisitionList
            company={company}
            rows={requisitions.data ?? []}
            onNew={() => setPane({ kind: 'new' })}
            onOpen={(id) => setPane({ kind: 'open', id })}
          />
        );
      case 'new':
        return (
          <RequisitionForm
            company={company}
            onSaved={(saved) => setPane({ kind: 'open', id: saved.id })}
            onCancel={toList}
          />
        );
      case 'open': {
        const open = requisitions.data?.find((r) => r.id === pane.id);
        return open ? (
          <RequisitionDetail
            company={company}
            requisition={open}
            onBack={toList}
          />
        ) : null;
      }
      default: {
        const unhandled: never = pane;
        return unhandled;
      }
    }
  };
  return (
    <>
      <CompanyLine company={company} />
      {requisitions.isPending && <Loading label="Loading requisitions" />}
      {requisitions.isError && !unauthorized && (
        <ErrorNote
          message="Could not load requisitions."
          onRetry={() => void requisitions.refetch()}
        />
      )}
      {requisitions.data && body()}
    </>
  );
}

function RequisitionList(props: {
  company: CompanyMembership;
  rows: Requisition[];
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <Button label="New requisition" onPress={props.onNew} />
      {props.rows.length === 0 && (
        <Text style={styles.body}>No requisitions yet.</Text>
      )}
      {props.rows.map((r) => (
        <View key={r.id} style={styles.card}>
          <Text style={styles.body}>{titleOf(r)}</Text>
          <Text style={styles.muted}>
            {`${statusLabel(r.status)} · ${formatMoney(r.totalMinor, props.company.currency)} · ${r.requesterName}`}
          </Text>
          <Button
            label="Open"
            accessibilityLabel={`Open ${titleOf(r)}`}
            onPress={() => props.onOpen(r.id)}
          />
        </View>
      ))}
    </>
  );
}

function RequisitionDetail(props: {
  company: CompanyMembership;
  requisition: Requisition;
  onBack: () => void;
}) {
  const { company, requisition: r } = props;
  const [editing, setEditing] = useState(false);
  const costCenters = useCostCenters(company.companyId);
  const costCenter = costCenters.data?.find((c) => c.id === r.costCenterId);
  const note = approvalNote(r);
  if (editing) {
    return (
      <RequisitionForm
        company={company}
        requisition={r}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{titleOf(r)}</Text>
      <Text style={styles.muted}>
        {`${statusLabel(r.status)} · requested by ${r.requesterName}`}
      </Text>
      {note && <Text style={styles.body}>{note}</Text>}
      <Text style={styles.body}>
        {`Cost center: ${costCenter?.code ?? 'none yet'}`}
      </Text>
      {r.lines.map((l) => (
        <Text key={l.id} style={styles.body}>
          {`${l.quantity} × ${l.catalogItemName} at ${formatMoney(l.unitPriceMinor, company.currency)} = ${formatMoney(l.amountMinor, company.currency)}`}
        </Text>
      ))}
      <Text style={styles.body}>
        {`Total ${formatMoney(r.totalMinor, company.currency)}`}
      </Text>
      <RequisitionActions
        company={company}
        requisition={r}
        onEdit={() => setEditing(true)}
      />
      <DecisionPanel
        companyId={company.companyId}
        requisition={r}
        title={titleOf(r)}
      />
      <Button label="Back to requisitions" onPress={props.onBack} />
    </View>
  );
}

/** Exactly the requester's actions the API offers this person; DecisionPanel has the others. */
function RequisitionActions(props: {
  company: CompanyMembership;
  requisition: Requisition;
  onEdit: () => void;
}) {
  const { companyId } = props.company;
  const { id } = props.requisition;
  const actions = props.requisition.actions.filter(
    (a) => a !== 'approve' && a !== 'reject',
  );
  const move = useCompanyMutation(
    companyId,
    (api, token, action: 'submit' | 'cancel') =>
      action === 'submit'
        ? api.submitRequisition(token, companyId, id)
        : api.cancelRequisition(token, companyId, id),
  );
  const button = (action: RequisitionAction) => {
    switch (action) {
      case 'edit':
        return (
          <Button key={action} label="Edit draft" onPress={props.onEdit} />
        );
      case 'submit':
        return (
          <Button
            key={action}
            label="Submit"
            disabled={move.isPending}
            onPress={() => move.mutate('submit')}
          />
        );
      case 'cancel':
        return (
          <Button
            key={action}
            label="Cancel requisition"
            disabled={move.isPending}
            onPress={() => move.mutate('cancel')}
          />
        );
      case 'approve':
      case 'reject':
        return null;
      default: {
        const unhandled: never = action;
        return unhandled;
      }
    }
  };
  return (
    <>
      {actions.length > 0 && (
        <View style={styles.row}>{actions.map(button)}</View>
      )}
      {move.isError && <ErrorNote message={writeErrorMessage(move.error)} />}
    </>
  );
}
