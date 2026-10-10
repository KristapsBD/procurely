import { createPushRegistrar, screenForNotification } from './registrar';

function setup(pushToken: string | null = 'ExponentPushToken[abc]') {
  const calls: string[] = [];
  const api = {
    registerPushDevice: async (auth: string, company: string, push: string) => {
      calls.push(`register ${auth} ${company} ${push}`);
    },
    removePushDevice: async (auth: string, company: string, push: string) => {
      calls.push(`remove ${auth} ${company} ${push}`);
    },
  };
  return {
    calls,
    api,
    registrar: createPushRegistrar(api, { pushToken: async () => pushToken }),
  };
}

describe('push registrar', () => {
  it('registers the phone for the company, and again when the company changes', async () => {
    const { calls, registrar } = setup();
    await registrar.register('t1', 'acme');
    await registrar.register('t1', 'acme');
    await registrar.register('t1', 'nordic');
    expect(calls).toEqual([
      'register t1 acme ExponentPushToken[abc]',
      'register t1 nordic ExponentPushToken[abc]',
    ]);
  });

  it('registers again for another person on the same phone', async () => {
    const { calls, registrar } = setup();
    await registrar.register('t1', 'acme');
    await registrar.register('t2', 'acme');
    expect(calls).toHaveLength(2);
  });

  it('removes the phone from the company it was last registered for', async () => {
    const { calls, registrar } = setup();
    await registrar.register('t1', 'acme');
    await registrar.register('t1', 'nordic');
    await registrar.unregister('t1');
    await registrar.unregister('t1');
    expect(calls.at(-1)).toBe('remove t1 nordic ExponentPushToken[abc]');
    expect(calls).toHaveLength(3);
  });

  it('does nothing when the phone has no push token', async () => {
    const { calls, registrar } = setup(null);
    await registrar.register('t1', 'acme');
    expect(calls).toEqual([]);
  });

  it('keeps going when the API refuses, and retries on the next call', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    let fail = true;
    const registrar = createPushRegistrar(
      {
        registerPushDevice: async () => {
          if (fail) throw new Error('offline');
        },
        removePushDevice: async () => {},
      },
      { pushToken: async () => 'ExponentPushToken[abc]' },
    );
    await registrar.register('t1', 'acme');
    fail = false;
    await registrar.register('t1', 'acme');
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('screenForNotification', () => {
  const approval = { kind: 'approval-requested', companyId: 'acme' };
  it('opens the screen for the kind, within the active company only', () => {
    expect(screenForNotification(approval, 'acme')).toBe('/approvals');
    expect(
      screenForNotification(
        { ...approval, kind: 'requisition-decided' },
        'acme',
      ),
    ).toBe('/requisitions');
    expect(screenForNotification(approval, 'nordic')).toBeNull();
    expect(screenForNotification(approval, null)).toBeNull();
  });
  it('ignores anything it does not know', () => {
    expect(
      screenForNotification({ kind: 'other', companyId: 'acme' }, 'acme'),
    ).toBeNull();
    expect(screenForNotification(undefined, 'acme')).toBeNull();
  });
});
