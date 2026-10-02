import type { CompanyMembership } from '@procurely/shared-types';
import { FlatList, Text, View } from 'react-native';
import { Button, ErrorNote, Loading, styles } from '../components/ui';
import {
  pickActiveCompany,
  useCompanies,
  useCostCenters,
  useSignOutWhenUnauthorized,
} from '../features/data';
import { useSession } from '../session/session';

export function HomeScreen() {
  const { state, signOut } = useSession();
  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>
        {state.status === 'signedIn' ? `Signed in as ${state.person.name}` : ''}
      </Text>
      <Button label="Sign out" onPress={() => void signOut()} />
      <Companies />
    </View>
  );
}

function Companies() {
  const { selectedCompanyId, selectCompany } = useSession();
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
  return (
    <>
      <CompanySwitcher
        companies={companies.data}
        activeCompanyId={active.companyId}
        onSelect={selectCompany}
      />
      <CostCenters company={active} />
    </>
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
  const { companyId, companyName, role } = props.company;
  const costCenters = useCostCenters(companyId);
  const unauthorized = useSignOutWhenUnauthorized(costCenters.error);
  return (
    <View style={{ flex: 1, gap: 8 }}>
      <Text style={styles.heading}>Cost centers</Text>
      <Text style={styles.muted}>
        {`${companyName} (${props.company.currency}), you are ${role.toLowerCase()}`}
      </Text>
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
      {costCenters.data && (
        <FlatList
          data={costCenters.data}
          keyExtractor={(cc) => cc.id}
          contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.body}>{item.code}</Text>
              <Text style={styles.muted}>{item.name}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}
