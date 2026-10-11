import type { CompanyMembership, Requisition } from '@procurely/shared-types';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { EmptyState } from '../components/empty-state';
import {
  RowGroup,
  TapRow,
  TrailingColumn,
} from '../components/requisition-parts';
import { ScreenHeader } from '../components/screen-header';
import {
  Button,
  ErrorNote,
  Loading,
  Money,
  StatusBadge,
  styles,
} from '../components/ui';
import {
  useCostCenters,
  useRequisitions,
  useSignOutWhenUnauthorized,
} from '../features/data';
import { canRaiseRequisitions } from '../features/permissions';
import { RequisitionDetail, titleOf } from './requisition-detail';
import { RequisitionForm } from './requisition-form';
import { WithActiveCompany } from './with-active-company';

export { titleOf };

type Pane = { kind: 'list' } | { kind: 'new' } | { kind: 'open'; id: string };

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
              <ScreenHeader title="Requests" lead={{ kind: 'company' }} />
              <EmptyState title="Requisitions are for requesters and admins." />
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
          <>
            <ScreenHeader
              title="New requisition"
              lead={{ kind: 'back', label: 'Requests', onPress: toList }}
            />
            <RequisitionForm
              company={company}
              onSaved={(saved) => setPane({ kind: 'open', id: saved.id })}
              onCancel={toList}
            />
          </>
        );
      case 'open': {
        const open = requisitions.data?.find((r) => r.id === pane.id);
        return open ? (
          <RequisitionDetail
            company={company}
            requisition={open}
            backLabel="Requests"
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
      {(pane.kind === 'list' || !requisitions.data) && (
        <ScreenHeader title="Requests" lead={{ kind: 'company' }} />
      )}
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
  const costCenters = useCostCenters(props.company.companyId);
  const code = (r: Requisition) =>
    costCenters.data?.find((c) => c.id === r.costCenterId)?.code;
  return (
    <>
      <Button variant="primary" label="New requisition" onPress={props.onNew} />
      {props.rows.length === 0 ? (
        <EmptyState
          title="No requisitions yet."
          body="Raise one to start a purchase."
        />
      ) : (
        <RowGroup>
          {props.rows.map((r, i) => (
            <TapRow
              key={r.id}
              title={titleOf(r)}
              meta={[r.requesterName, code(r)].filter(Boolean).join(' · ')}
              trailing={
                <TrailingColumn>
                  <Money
                    minor={r.totalMinor}
                    currency={props.company.currency}
                  />
                  <StatusBadge status={r.status} />
                </TrailingColumn>
              }
              last={i === props.rows.length - 1}
              onPress={() => props.onOpen(r.id)}
            />
          ))}
        </RowGroup>
      )}
    </>
  );
}
