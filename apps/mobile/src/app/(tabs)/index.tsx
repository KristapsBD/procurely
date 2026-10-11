import { Redirect } from 'expo-router';
import { landingTab, tabsFor } from '../../features/navigation';
import { WithActiveCompany } from '../../screens/with-active-company';

export default function Landing() {
  return (
    <WithActiveCompany>
      {(active) => <Redirect href={`/${landingTab(tabsFor([active.role]))}`} />}
    </WithActiveCompany>
  );
}
