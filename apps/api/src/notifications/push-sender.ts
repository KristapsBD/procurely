import type { PushKind } from '../contract/api.dto';

/** One notification for one device. `data` is ids only: no supplier, amount or company name. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data: { kind: PushKind; requisitionId: string; companyId: string };
}

/** Where notifications leave the API. Swapped for a fake in tests. */
export interface PushSender {
  send(messages: PushMessage[]): Promise<void>;
}

export const PUSH_SENDER = Symbol('PUSH_SENDER');

/** Delivers nothing; the development outbox still records what would have been sent. */
export class NoPushSender implements PushSender {
  async send(): Promise<void> {}
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;
const EXPO_TIMEOUT_MS = 5000;

interface ExpoTicket {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

/** Expo's push service: https://docs.expo.dev/push-notifications/sending-notifications/ */
export class ExpoPushSender implements PushSender {
  constructor(
    private readonly accessToken: string | null,
    private readonly post: typeof fetch = fetch,
  ) {}

  async send(messages: PushMessage[]): Promise<void> {
    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      await this.sendBatch(messages.slice(i, i + EXPO_BATCH));
    }
  }

  private async sendBatch(batch: PushMessage[]): Promise<void> {
    const res = await this.post(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(this.accessToken
          ? { authorization: `Bearer ${this.accessToken}` }
          : {}),
      },
      body: JSON.stringify(batch.map((m) => ({ ...m, sound: 'default' }))),
      signal: AbortSignal.timeout(EXPO_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Expo push service answered ${res.status}`);
    const { data } = (await res.json()) as { data?: ExpoTicket[] };
    const failed = (data ?? []).filter((t) => t.status === 'error');
    if (failed.length > 0) {
      throw new Error(
        `Expo refused ${failed.length} of ${batch.length}: ${failed
          .map((t) => t.details?.error ?? t.message)
          .join(', ')}`,
      );
    }
  }
}
