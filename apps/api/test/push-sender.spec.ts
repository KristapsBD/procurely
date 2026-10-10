import { loadConfig } from '../src/config';
import {
  ExpoPushSender,
  type PushMessage,
} from '../src/notifications/push-sender';

const message = (to: string): PushMessage => ({
  to,
  title: 't',
  body: 'b',
  data: { kind: 'approval-requested', requisitionId: 'r', companyId: 'c' },
});

function fakeExpo(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const post = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply), { status });
  }) as unknown as typeof fetch;
  return { calls, post };
}

describe('ExpoPushSender', () => {
  it('posts the messages to Expo, with the access token when there is one', async () => {
    const { calls, post } = fakeExpo({ data: [{ status: 'ok' }] });
    await new ExpoPushSender('secret', post).send([message('a')]);
    expect(calls[0].url).toBe('https://exp.host/--/api/v2/push/send');
    expect(JSON.parse(calls[0].init.body as string)).toEqual([
      { ...message('a'), sound: 'default' },
    ]);
    expect(
      (calls[0].init.headers as Record<string, string>).authorization,
    ).toBe('Bearer secret');
  });

  it('sends no authorization without an access token, and 100 messages at a time', async () => {
    const { calls, post } = fakeExpo({ data: [] });
    await new ExpoPushSender(null, post).send(
      Array.from({ length: 101 }, (_, i) => message(`t${i}`)),
    );
    expect(calls).toHaveLength(2);
    expect(
      (calls[0].init.headers as Record<string, string>).authorization,
    ).toBeUndefined();
  });

  it('fails when Expo refuses a message or answers with an error', async () => {
    await expect(
      new ExpoPushSender(
        null,
        fakeExpo({
          data: [
            { status: 'error', details: { error: 'DeviceNotRegistered' } },
          ],
        }).post,
      ).send([message('a')]),
    ).rejects.toThrow('DeviceNotRegistered');
    await expect(
      new ExpoPushSender(null, fakeExpo({}, 503).post).send([message('a')]),
    ).rejects.toThrow('503');
  });
});

describe('push configuration', () => {
  const env = { NODE_ENV: 'test' };
  it('sends nothing unless PUSH_SENDER is expo', () => {
    expect(loadConfig(env).expoPush).toBeNull();
    expect(loadConfig({ ...env, PUSH_SENDER: 'expo' }).expoPush).toEqual({
      accessToken: null,
    });
    expect(
      loadConfig({ ...env, PUSH_SENDER: 'expo', EXPO_ACCESS_TOKEN: ' tok ' })
        .expoPush,
    ).toEqual({ accessToken: 'tok' });
  });
});
