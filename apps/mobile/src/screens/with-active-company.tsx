import type { CompanyMembership } from '@procurely/shared-types';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { ErrorNote, Loading, styles } from '../components/ui';
import {
  pickActiveCompany,
  useCompanies,
  useSignOutWhenUnauthorized,
} from '../features/data';
import { useSession } from '../session/session';

/**
 * Renders its children for the company the person acts in, with their role there. Covers the
 * loading, error and no-company states every company screen shares.
 */
export function WithActiveCompany(props: {
  children: (
    active: CompanyMembership,
    companies: CompanyMembership[],
  ) => ReactNode;
}) {
  const { selectedCompanyId } = useSession();
  const companies = useCompanies();
  const unauthorized = useSignOutWhenUnauthorized(companies.error);

  if (companies.isPending) return <Loading label="Loading companies" />;
  if (companies.isError) {
    return unauthorized ? null : (
      <ErrorNote
        message="Could not load your companies."
        onRetry={() => void companies.refetch()}
      />
    );
  }
  const active = pickActiveCompany(companies.data, selectedCompanyId);
  if (!active) {
    return (
      <Text style={styles.body}>
        You do not have access to any company yet. Ask an admin to invite you.
      </Text>
    );
  }
  return props.children(active, companies.data);
}

/** "Acme Trading (EUR), you are buyer" */
export function CompanyLine(props: { company: CompanyMembership }) {
  const { companyName, currency, role } = props.company;
  return (
    <Text style={styles.muted}>
      {`${companyName} (${currency}), you are ${role.toLowerCase()}`}
    </Text>
  );
}
