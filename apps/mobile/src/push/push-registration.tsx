import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { pickActiveCompany, useCompanies } from '../features/data';
import { useSession } from '../session/session';
import type { PushPlatform } from './push-platform';
import { screenForNotification, type PushRegistrar } from './registrar';

/**
 * Renders nothing. While signed in, registers this phone for the company the person acts in
 * (again on every switch), and opens the right screen when a notification is tapped.
 */
export function PushRegistration(props: {
  registrar: PushRegistrar;
  platform: PushPlatform;
}) {
  const { registrar, platform } = props;
  const { state, selectedCompanyId } = useSession();
  const router = useRouter();
  const companies = useCompanies();
  const authToken = state.status === 'signedIn' ? state.token : null;
  const activeCompanyId = companies.data
    ? (pickActiveCompany(companies.data, selectedCompanyId)?.companyId ?? null)
    : null;

  useEffect(() => {
    if (authToken && activeCompanyId) {
      void registrar.register(authToken, activeCompanyId);
    }
  }, [registrar, authToken, activeCompanyId]);

  useEffect(
    () =>
      platform.onNotificationOpened((data) => {
        const screen = screenForNotification(data, activeCompanyId);
        if (screen) router.push(screen);
      }),
    [platform, activeCompanyId, router],
  );
  return null;
}
