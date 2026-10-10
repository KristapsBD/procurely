import type {
  PushMessage,
  PushSender,
} from '../../src/notifications/push-sender';

/** Remembers what would have gone to Expo; `failWith` makes every send fail. */
export class FakePushSender implements PushSender {
  readonly sent: PushMessage[] = [];
  failWith: Error | null = null;

  async send(messages: PushMessage[]): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(...messages);
  }

  to(token: string): PushMessage[] {
    return this.sent.filter((m) => m.to === token);
  }
}
