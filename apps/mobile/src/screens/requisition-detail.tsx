import type {
  CompanyMembership,
  Requisition,
  RequisitionAction,
} from '@procurely/shared-types';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Callout,
  LinesCard,
  ProgressBar,
  SectionLabel,
  StatusTimeline,
} from '../components/requisition-parts';
import { ScreenHeader } from '../components/screen-header';
import { fonts, theme } from '../components/theme';
import {
  Button,
  ErrorNote,
  StatusBadge,
  styles as kit,
} from '../components/ui';
import { approvalNote } from '../features/approvals';
import {
  useApprovalRules,
  useCompanyMutation,
  useCostCenters,
  usePurchaseOrders,
  writeErrorMessage,
} from '../features/data';
import {
  orderOf,
  orderProgress,
  ruleCallout,
  timelineSteps,
} from '../features/requisition-view';
import { DecisionPanel } from './decision-panel';
import { RequisitionForm } from './requisition-form';

export function titleOf(r: Requisition): string {
  return r.justification === '' ? 'Untitled draft' : r.justification;
}

/**
 * One requisition: what it asks for, who decides and where it stands, then the actions the API
 * offers this person. Used from the Requests tab and from the Inbox.
 */
export function RequisitionDetail(props: {
  company: CompanyMembership;
  requisition: Requisition;
  backLabel: string;
  onBack: () => void;
  onDecided?: (decided: Requisition) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <>
        <ScreenHeader
          title="Edit draft"
          lead={{
            kind: 'back',
            label: 'Request',
            onPress: () => setEditing(false),
          }}
        />
        <RequisitionForm
          company={props.company}
          requisition={props.requisition}
          onSaved={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </>
    );
  }
  return <Detail {...props} onEdit={() => setEditing(true)} />;
}

function Detail(props: {
  company: CompanyMembership;
  requisition: Requisition;
  backLabel: string;
  onBack: () => void;
  onEdit: () => void;
  onDecided?: (decided: Requisition) => void;
}) {
  const { company, requisition: r } = props;
  const costCenters = useCostCenters(company.companyId);
  const rules = useApprovalRules(company.companyId);
  const costCenter = costCenters.data?.find((c) => c.id === r.costCenterId);
  const canDecide =
    r.actions.includes('approve') || r.actions.includes('reject');
  const callout = canDecide
    ? ruleCallout(r, rules.data ?? [], company.currency, true)
    : null;
  const note = callout === null ? approvalNote(r) : noteBesideCallout(r);
  const where = costCenter
    ? `${costCenter.code} · ${costCenter.name}`
    : 'no cost center yet';
  return (
    <>
      <ScreenHeader
        title={titleOf(r)}
        aside={<StatusBadge status={r.status} />}
        subtitle={`Requested by ${r.requesterName} · ${where}`}
        lead={{ kind: 'back', label: props.backLabel, onPress: props.onBack }}
      />
      <LinesCard
        lines={r.lines}
        totalMinor={r.totalMinor}
        currency={company.currency}
      />
      <Justification text={r.justification} />
      {callout !== null && <Callout text={callout} />}
      <View style={local.block}>
        <SectionLabel>Timeline</SectionLabel>
        <StatusTimeline steps={timelineSteps(r, canDecide)} />
        {note !== null && <Text style={kit.body}>{note}</Text>}
      </View>
      <LinkedOrder company={company} requisitionId={r.id} />
      <RequisitionActions
        company={company}
        requisition={r}
        onEdit={props.onEdit}
      />
      {canDecide && (
        <DecisionPanel
          companyId={company.companyId}
          requisition={r}
          onDecided={props.onDecided}
        />
      )}
    </>
  );
}

/** The callout already says who decides, so a waiting requisition needs no second note. */
function noteBesideCallout(r: Requisition): string | null {
  return r.status === 'SUBMITTED' ? null : approvalNote(r);
}

function Justification(props: { text: string }) {
  if (props.text === '') return null;
  return (
    <View style={local.block}>
      <SectionLabel>Justification</SectionLabel>
      <Text style={local.paragraph}>{props.text}</Text>
    </View>
  );
}

/** The purchase order raised from this requisition, once there is one. The API has no order number. */
function LinkedOrder(props: {
  company: CompanyMembership;
  requisitionId: string;
}) {
  const orders = usePurchaseOrders(props.company.companyId);
  const order = orders.data ? orderOf(orders.data, props.requisitionId) : null;
  if (order === null) return null;
  const { received, ordered } = orderProgress(order);
  return (
    <View style={kit.card}>
      <View style={kit.listRow}>
        <Text style={[kit.rowTitle, kit.listRowText]}>
          {`Purchase order · ${order.supplierName}`}
        </Text>
        <StatusBadge status={order.status} />
      </View>
      <ProgressBar received={received} ordered={ordered} />
      <Text style={kit.muted}>{`${received} of ${ordered} received`}</Text>
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
            variant="primary"
            disabled={move.isPending}
            onPress={() => move.mutate('submit')}
          />
        );
      case 'cancel':
        return (
          <Button
            key={action}
            label="Cancel requisition"
            variant="destructive"
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
      {actions.length > 0 && <View style={kit.row}>{actions.map(button)}</View>}
      {move.isError && <ErrorNote message={writeErrorMessage(move.error)} />}
    </>
  );
}

const local = StyleSheet.create({
  block: { gap: theme.space.sm },
  paragraph: {
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 21,
    color: theme.palette.ink,
  },
});
