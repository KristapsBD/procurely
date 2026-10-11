import { router } from 'expo-router';
import { pickActiveCompany, useCompanies } from '../features/data';
import { landingTab, tabsFor } from '../features/navigation';
import { useSession } from '../session/session';
import { CompanyChip } from './ui';

/** The company chip wired to the session: switching lands on the new company's first tab. */
export function ActiveCompanyChip() {
  const { selectedCompanyId, selectCompany } = useSession();
  const companies = useCompanies();
  if (!companies.data) return null;
  const active = pickActiveCompany(companies.data, selectedCompanyId);
  if (!active) return null;
  return (
    <CompanyChip
      companies={companies.data}
      activeCompanyId={active.companyId}
      onSelect={(companyId) => {
        selectCompany(companyId);
        const next = companies.data.find((c) => c.companyId === companyId);
        if (next) router.replace(`/${landingTab(tabsFor([next.role]))}`);
      }}
    />
  );
}
