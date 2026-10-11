import { Text, type TextStyle } from 'react-native';
import { formatMoney } from '../features/money';
import { fonts, theme } from './theme';

/** An amount in integer minor units of the company currency, in tabular mono. */
export function Money(props: {
  minor: number;
  currency: string;
  /** Leading words in the same text node, so the line reads and matches as one string. */
  label?: string;
  style?: TextStyle;
}) {
  return (
    <Text
      style={[
        {
          fontFamily: fonts.mono,
          fontVariant: ['tabular-nums'],
          fontSize: 15,
          color: theme.palette.ink,
        },
        props.style,
      ]}
    >
      {`${props.label ? `${props.label} ` : ''}${formatMoney(props.minor, props.currency)}`}
    </Text>
  );
}
