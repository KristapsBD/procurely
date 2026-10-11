import { StyleSheet, Text, View } from 'react-native';
import { fonts, theme } from './theme';

const p = theme.palette;

/** How much of an ordered quantity has arrived: a bar, green once complete, amber while short. */
export function ReceiptProgress(props: { received: number; ordered: number }) {
  const { received, ordered } = props;
  const complete = received >= ordered;
  const fraction = ordered > 0 ? Math.min(received / ordered, 1) : 0;
  return (
    <View style={styles.wrap}>
      <View style={styles.track}>
        <View
          testID="receipt-progress-fill"
          style={[
            styles.fill,
            {
              width: `${fraction * 100}%`,
              backgroundColor: complete ? p.accent : p.pending,
            },
          ]}
        />
      </View>
      <Text style={styles.label}>{`${received} of ${ordered} received`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: p.controlTrack,
    overflow: 'hidden',
  },
  fill: { height: 6, borderRadius: 3 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: p.ink },
});
