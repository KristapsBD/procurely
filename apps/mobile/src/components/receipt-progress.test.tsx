import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { ReceiptProgress } from './receipt-progress';
import { theme } from './theme';

function fill() {
  return screen.getByTestId('receipt-progress-fill');
}

describe('ReceiptProgress', () => {
  it('fills in the warning colour while a line is short', () => {
    render(<ReceiptProgress received={5} ordered={8} />);
    expect(screen.getByText('5 of 8 received')).toBeTruthy();
    expect(StyleSheet.flatten(fill().props.style)).toEqual(
      expect.objectContaining({
        width: '62.5%',
        backgroundColor: theme.palette.pending,
      }),
    );
  });

  it('fills in the accent colour once complete', () => {
    render(<ReceiptProgress received={10} ordered={10} />);
    expect(StyleSheet.flatten(fill().props.style)).toEqual(
      expect.objectContaining({
        width: '100%',
        backgroundColor: theme.palette.accent,
      }),
    );
  });
});
