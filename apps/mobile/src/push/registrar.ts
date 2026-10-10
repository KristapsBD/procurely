import type { Api } from '../api/client';
import type { PushPlatform } from './push-platform';

/**
 * Keeps this phone registered for the company the person acts in, and for no one else. The API
 * sends a company's notifications only to phones registered for that company, so registering on
 * every company switch is what keeps one company's notifications out of another.
 */
export interface PushRegistrar {
  register(authToken: string, companyId: string): Promise<void>;
  /** Before signing out: the phone stops receiving this person's notifications. */
  unregister(authToken: string): Promise<void>;
}

interface Registered {
  companyId: string;
  authToken: string;
  pushToken: string;
}

/** Push is a convenience: nothing here may break the app, so failures are logged and dropped. */
export function createPushRegistrar(
  api: Pick<Api, 'registerPushDevice' | 'removePushDevice'>,
  platform: Pick<PushPlatform, 'pushToken'>,
): PushRegistrar {
  let current: Registered | null = null;
  return {
    async register(authToken, companyId) {
      try {
        if (
          current?.companyId === companyId &&
          current.authToken === authToken
        ) {
          return;
        }
        const pushToken = await platform.pushToken();
        if (!pushToken) return;
        await api.registerPushDevice(authToken, companyId, pushToken);
        current = { companyId, authToken, pushToken };
      } catch (error) {
        console.warn('Could not register for push notifications', error);
      }
    },
    async unregister(authToken) {
      const registered = current;
      current = null;
      if (!registered) return;
      try {
        await api.removePushDevice(
          authToken,
          registered.companyId,
          registered.pushToken,
        );
      } catch (error) {
        console.warn('Could not unregister from push notifications', error);
      }
    },
  };
}

/** Where a tapped notification leads, only within the company the person acts in now. */
export function screenForNotification(
  data: unknown,
  activeCompanyId: string | null,
): '/approvals' | '/requisitions' | null {
  const { kind, companyId } = (data ?? {}) as Record<string, unknown>;
  if (!activeCompanyId || companyId !== activeCompanyId) return null;
  if (kind === 'approval-requested') return '/approvals';
  if (kind === 'requisition-decided') return '/requisitions';
  return null;
}
