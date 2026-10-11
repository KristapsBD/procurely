import { render, screen } from '@testing-library/react-native';
import { StatusBadge, STATUS_BADGES, statusLabel } from './status-badge';

describe('status badge table', () => {
  it('labels every requisition and purchase-order status', () => {
    expect(
      Object.fromEntries(
        Object.entries(STATUS_BADGES).map(([k, v]) => [k, v.label]),
      ),
    ).toEqual({
      DRAFT: 'Draft',
      SUBMITTED: 'Submitted',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      CANCELLED: 'Cancelled',
      ISSUED: 'Issued',
      PARTIALLY_RECEIVED: 'Partially received',
      FULLY_RECEIVED: 'Fully received',
      CLOSED: 'Closed',
    });
  });

  it('marks outcomes with their own tone', () => {
    expect(STATUS_BADGES.APPROVED.tone).toBe('accent');
    expect(STATUS_BADGES.REJECTED.tone).toBe('rejected');
    expect(STATUS_BADGES.SUBMITTED.tone).toBe('pending');
    expect(STATUS_BADGES.PARTIALLY_RECEIVED.tone).toBe('pending');
  });

  it('exposes the label to callers that need plain text', () => {
    expect(statusLabel('PARTIALLY_RECEIVED')).toBe('Partially received');
  });

  it('renders the badge label', () => {
    render(<StatusBadge status="REJECTED" />);
    expect(screen.getByText('Rejected')).toBeTruthy();
  });
});
