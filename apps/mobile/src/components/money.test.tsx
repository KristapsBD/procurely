import { render, screen } from '@testing-library/react-native';
import { Money } from './money';

describe('Money', () => {
  it('shows EUR minor units as major.cents', () => {
    render(<Money minor={50001} currency="EUR" />);
    expect(screen.getByText('500.01 EUR')).toBeTruthy();
  });

  it('shows SEK minor units (öre) as major.öre', () => {
    render(<Money minor={12905} currency="SEK" />);
    expect(screen.getByText('129.05 SEK')).toBeTruthy();
  });

  it('pads sub-unit amounts to two decimals', () => {
    render(<Money minor={5} currency="SEK" />);
    expect(screen.getByText('0.05 SEK')).toBeTruthy();
  });

  it('does not lose a cent to float rounding', () => {
    render(<Money minor={435} currency="EUR" />);
    expect(screen.getByText('4.35 EUR')).toBeTruthy();
  });
});
