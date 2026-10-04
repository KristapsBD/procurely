import type { Requisition, Role } from '@procurely/shared-types';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ApiError, type Api } from '../api/client';
import {
  TestApp,
  catalogItem,
  costCenter,
  deferred,
  fakeApi,
  membership,
  pressToWrite,
  requisition,
  supplier,
} from '../test/fakes';
import { HomeScreen } from './home-screen';
import { RequisitionsScreen } from './requisitions-screen';

const ACME = 'company-acme';
const NORDIC = 'company-nordic';
const ops = costCenter(ACME, 'OPS');
const paper = catalogItem(
  supplier(ACME, 'Office Depot'),
  'A4 copy paper',
  2499,
);
const recycled = catalogItem(
  supplier(ACME, 'Old Paper Mill', false),
  'Recycled paper',
  1999,
);
const printerPaper = requisition(
  ACME,
  'Printer paper',
  [{ item: paper, quantity: 3 }],
  { costCenterId: ops.id },
);

function renderAs(
  role: Role,
  rows: Requisition[] = [printerPaper],
  overrides: Partial<Api> = {},
) {
  let current = rows;
  const replace = (id: string, change: Partial<Requisition>) => {
    current = current.map((r) => (r.id === id ? { ...r, ...change } : r));
    return current.find((r) => r.id === id)!;
  };
  const api = fakeApi({
    companies: async () => [membership(ACME, 'Acme Trading', role)],
    costCenters: async () => [ops],
    catalogItems: async () => [paper, recycled],
    requisitions: jest.fn(async () => current),
    createRequisition: jest.fn(async (_t, companyId, body) => {
      const created = requisition(
        companyId,
        body.justification,
        body.lines.map((l) => ({ item: paper, quantity: l.quantity })),
        { costCenterId: body.costCenterId },
      );
      current = [created, ...current];
      return created;
    }),
    updateRequisition: jest.fn(async (_t, _c, id, body) =>
      replace(id, {
        costCenterId: body.costCenterId,
        justification: body.justification,
      }),
    ),
    submitRequisition: jest.fn(async (_t, _c, id) =>
      replace(id, { status: 'SUBMITTED', actions: ['cancel'] }),
    ),
    ...overrides,
  });
  render(
    <TestApp api={api}>
      <RequisitionsScreen />
    </TestApp>,
  );
  return api;
}

const button = (name: string) => screen.findByRole('button', { name });
const noButton = (name: string) =>
  expect(screen.queryByRole('button', { name })).toBeNull();

describe('RequisitionsScreen', () => {
  it('lists a requester’s requisitions with status and total', async () => {
    renderAs('REQUESTER');
    expect(await screen.findByText('Printer paper')).toBeTruthy();
    expect(screen.getByText('Draft · 74.97 EUR · Alice')).toBeTruthy();
    expect(await button('New requisition')).toBeTruthy();
  });

  it('creates a draft from the catalog, then submits it', async () => {
    const api = renderAs('REQUESTER', []);
    fireEvent.press(await button('New requisition'));
    fireEvent.press(await button('Cost center OPS'));
    fireEvent.changeText(
      screen.getByLabelText('Justification'),
      ' Printer paper ',
    );
    fireEvent.press(await button('Add A4 copy paper'));
    noButton('Add Recycled paper');
    fireEvent.changeText(
      screen.getByLabelText('Quantity of A4 copy paper'),
      '3',
    );
    expect(screen.getByText('Estimated total 74.97 EUR')).toBeTruthy();
    await pressToWrite(screen.getByRole('button', { name: 'Save draft' }));

    expect(api.createRequisition).toHaveBeenCalledWith('token-alice', ACME, {
      costCenterId: ops.id,
      justification: 'Printer paper',
      lines: [{ catalogItemId: paper.id, quantity: 3 }],
    });
    expect(await screen.findByText('Total 74.97 EUR')).toBeTruthy();
    expect(screen.getByText('Cost center: OPS')).toBeTruthy();
    expect(
      screen.getByText('3 × A4 copy paper at 24.99 EUR = 74.97 EUR'),
    ).toBeTruthy();

    await pressToWrite(await button('Submit'));
    expect(
      await screen.findByText('Submitted · requested by Alice'),
    ).toBeTruthy();
    noButton('Edit draft');
    noButton('Submit');
    expect(await button('Cancel requisition')).toBeTruthy();
  });

  it('refuses to save a quantity that is not a whole number of 1 or more', async () => {
    renderAs('REQUESTER', []);
    fireEvent.press(await button('New requisition'));
    fireEvent.press(await button('Add A4 copy paper'));
    fireEvent.changeText(
      screen.getByLabelText('Quantity of A4 copy paper'),
      '0',
    );
    expect(screen.getByText('Enter a whole number, 1 or more')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Save draft' }).props
        .accessibilityState,
    ).toMatchObject({ disabled: true });
  });

  it('replaces a draft’s lines when it is edited', async () => {
    const api = renderAs('REQUESTER');
    fireEvent.press(await button('Open Printer paper'));
    fireEvent.press(await button('Edit draft'));
    fireEvent.changeText(
      await screen.findByLabelText('Quantity of A4 copy paper'),
      '5',
    );
    await pressToWrite(screen.getByRole('button', { name: 'Save draft' }));
    expect(api.updateRequisition).toHaveBeenCalledWith(
      'token-alice',
      ACME,
      printerPaper.id,
      {
        costCenterId: ops.id,
        justification: 'Printer paper',
        lines: [{ catalogItemId: paper.id, quantity: 5 }],
      },
    );
  });

  it('shows why the API refused to submit', async () => {
    renderAs('REQUESTER', [printerPaper], {
      submitRequisition: async () => {
        throw new ApiError(409, 'Cannot submit without a justification');
      },
    });
    fireEvent.press(await button('Open Printer paper'));
    await pressToWrite(await button('Submit'));
    expect(
      await screen.findByText('Cannot submit without a justification'),
    ).toBeTruthy();
  });

  it('shows an admin someone else’s requisition read only', async () => {
    renderAs('ADMIN', [
      requisition(ACME, 'Team laptops', [{ item: paper, quantity: 1 }], {
        requesterPersonId: 'p-rita',
        requesterName: 'Rita',
        actions: [],
      }),
    ]);
    fireEvent.press(await button('Open Team laptops'));
    expect(await screen.findByText('Draft · requested by Rita')).toBeTruthy();
    noButton('Edit draft');
    noButton('Submit');
    noButton('Cancel requisition');
    fireEvent.press(await button('Back to requisitions'));
    expect(await button('New requisition')).toBeTruthy();
  });

  it.each(['BUYER', 'APPROVER'] as const)(
    'shows a %s no requisitions and does not ask for them',
    async (role) => {
      const api = renderAs(role);
      expect(
        await screen.findByText('Requisitions are for requesters and admins.'),
      ).toBeTruthy();
      expect(screen.queryByText('Printer paper')).toBeNull();
      noButton('New requisition');
      expect(api.requisitions).not.toHaveBeenCalled();
    },
  );
});

describe('RequisitionsScreen company switching', () => {
  const kontor = requisition(NORDIC, 'Kontorspapper');

  function renderTwoCompanies(nordicRole: Role) {
    const nordicRows = deferred<Requisition[]>();
    const api = fakeApi({
      companies: async () => [
        membership(ACME, 'Acme Trading', 'REQUESTER'),
        membership(NORDIC, 'Nordic Supplies', nordicRole),
      ],
      costCenters: async () => [ops],
      requisitions: jest.fn((_t, companyId) =>
        companyId === ACME
          ? Promise.resolve([printerPaper])
          : nordicRows.promise,
      ),
    });
    render(
      <TestApp api={api}>
        <HomeScreen />
        <RequisitionsScreen />
      </TestApp>,
    );
    return { api, nordicRows };
  }

  it('never shows the previous company’s requisitions or open detail after a switch', async () => {
    const { nordicRows } = renderTwoCompanies('REQUESTER');
    fireEvent.press(await button('Open Printer paper'));
    expect(await screen.findByText('Total 74.97 EUR')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Nordic Supplies' }));
    expect(screen.queryByText('Printer paper')).toBeNull();
    expect(screen.queryByText('Total 74.97 EUR')).toBeNull();
    expect(screen.getByLabelText('Loading requisitions')).toBeTruthy();

    await act(async () => nordicRows.resolve([kontor]));
    expect(await screen.findByText('Kontorspapper')).toBeTruthy();
    expect(screen.queryByText('Printer paper')).toBeNull();
  });

  it('drops the entry point and the rows when the person is an approver in the next company', async () => {
    const { api } = renderTwoCompanies('APPROVER');
    expect(await screen.findByText('Printer paper')).toBeTruthy();
    expect(await button('Requisitions')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Nordic Supplies' }));
    expect(
      await screen.findByText('Requisitions are for requesters and admins.'),
    ).toBeTruthy();
    expect(screen.queryByText('Printer paper')).toBeNull();
    noButton('Requisitions');
    expect(api.requisitions).toHaveBeenCalledTimes(1);
  });
});
