import type { CompanyMembership, Requisition } from '@procurely/shared-types';
import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { EmptyState } from '../components/empty-state';
import {
  AmountWithHint,
  RowGroup,
  TapRow,
  TrailingColumn,
} from '../components/requisition-parts';
import { ScreenHeader } from '../components/screen-header';
import {
  ErrorNote,
  Loading,
  Money,
  SegmentedControl,
  StatusBadge,
  statusLabel,
  styles,
} from '../components/ui';
import {
  useApprovalRules,
  useCostCenters,
  useRequisitions,
  useSignOutWhenUnauthorized,
} from '../features/data';
import { canDecideRequisitions } from '../features/permissions';
import { ruleHint } from '../features/requisition-view';
import { RequisitionDetail, titleOf } from './requisition-detail';
import { WithActiveCompany } from './with-active-company';

type Segment = 'waiting' | 'decided';

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
              <ScreenHeader title="Inbox" lead={{ kind: 'company' }} />
              <EmptyState title="Approvals are for approvers and admins." />
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

function decided(r: Requisition): boolean {
  return r.status === 'APPROVED' || r.status === 'REJECTED';
}

function Inbox(props: { company: CompanyMembership }) {
  const { company } = props;
  const requisitions = useRequisitions(company.companyId);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lastDecided, setLastDecided] = useState<Requisition | null>(null);
  const open = requisitions.data?.find((r) => r.id === openId);
  if (open) {
    return (
      <RequisitionDetail
        company={company}
        requisition={open}
        backLabel="Inbox"
        onBack={() => setOpenId(null)}
        onDecided={(done) => {
          setLastDecided(done);
          setOpenId(null);
        }}
      />
    );
  }
  return (
    <InboxList
      company={company}
      requisitions={requisitions}
      lastDecided={lastDecided}
      onOpen={setOpenId}
    />
  );
}

function InboxList(props: {
  company: CompanyMembership;
  requisitions: UseQueryResult<Requisition[]>;
  lastDecided: Requisition | null;
  onOpen: (id: string) => void;
}) {
  const { company, requisitions, lastDecided } = props;
  const [segment, setSegment] = useState<Segment>('waiting');
  const waiting = requisitions.data?.filter(decidable) ?? [];
  const history = requisitions.data?.filter(decided) ?? [];
  return (
    <>
      <ScreenHeader
        title="Inbox"
        meta={
          requisitions.data ? `${waiting.length} waiting for you` : undefined
        }
        lead={{ kind: 'company' }}
      />
      <SegmentedControl
        options={[
          { value: 'waiting', label: `Waiting · ${waiting.length}` },
          { value: 'decided', label: 'Decided' },
        ]}
        value={segment}
        onChange={setSegment}
      />
      <DecidedBanner decided={lastDecided} />
      <LoadStatus query={requisitions} />
      {requisitions.data && (
        <InboxRows
          company={company}
          segment={segment}
          rows={segment === 'waiting' ? waiting : history}
          onOpen={props.onOpen}
        />
      )}
    </>
  );
}

function DecidedBanner(props: { decided: Requisition | null }) {
  const { decided } = props;
  if (!decided) return null;
  return (
    <Text style={styles.body} accessibilityRole="alert">
      {`${statusLabel(decided.status)}: ${titleOf(decided)}`}
    </Text>
  );
}

function LoadStatus(props: { query: UseQueryResult<Requisition[]> }) {
  const { query } = props;
  const unauthorized = useSignOutWhenUnauthorized(query.error);
  if (query.isPending) return <Loading label="Loading approvals" />;
  if (query.isError && !unauthorized) {
    return (
      <ErrorNote
        message="Could not load approvals."
        onRetry={() => void query.refetch()}
      />
    );
  }
  return null;
}

const EMPTY: Record<Segment, { title: string; body: string }> = {
  waiting: {
    title: 'Nothing is waiting for your decision.',
    body: 'Requisitions that need you show up here.',
  },
  decided: {
    title: 'No decisions yet.',
    body: 'Requisitions you approve or reject show up here.',
  },
};

function InboxRows(props: {
  company: CompanyMembership;
  segment: Segment;
  rows: Requisition[];
  onOpen: (id: string) => void;
}) {
  const { company, segment, rows } = props;
  const rules = useApprovalRules(company.companyId);
  const costCenters = useCostCenters(company.companyId);
  if (rows.length === 0) return <EmptyState {...EMPTY[segment]} />;
  const meta = (r: Requisition) =>
    [
      r.requesterName,
      costCenters.data?.find((c) => c.id === r.costCenterId)?.code,
    ]
      .filter(Boolean)
      .join(' · ');
  const trailing = (r: Requisition) =>
    segment === 'waiting' ? (
      <AmountWithHint
        minor={r.totalMinor}
        currency={company.currency}
        hint={ruleHint(r, rules.data ?? [], company.currency)}
      />
    ) : (
      <TrailingColumn>
        <Money minor={r.totalMinor} currency={company.currency} />
        <StatusBadge status={r.status} />
      </TrailingColumn>
    );
  return (
    <RowGroup>
      {rows.map((r, i) => (
        <TapRow
          key={r.id}
          title={titleOf(r)}
          meta={meta(r)}
          trailing={trailing(r)}
          last={i === rows.length - 1}
          onPress={() => props.onOpen(r.id)}
        />
      ))}
    </RowGroup>
  );
}
