import { fireEvent, render, screen } from '@testing-library/react-native';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('shows the title and the body', () => {
    render(<EmptyState title="No requests yet" body="Create one to start." />);
    expect(screen.getByText('No requests yet')).toBeTruthy();
    expect(screen.getByText('Create one to start.')).toBeTruthy();
  });

  it('calls onPress when the action is pressed', () => {
    const onPress = jest.fn();
    render(
      <EmptyState
        title="No requests yet"
        action={{ label: 'New request', onPress }}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'New request' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('shows no button without an action', () => {
    render(<EmptyState title="No requests yet" body="Nothing here." />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
