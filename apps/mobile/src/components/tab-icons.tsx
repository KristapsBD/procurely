import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { Tab } from '../features/navigation';

const PATHS: Record<Tab, readonly string[]> = {
  inbox: ['M4 13l2-8h12l2 8v6H4z', 'M4 13h5l1 2h4l1-2h5'],
  requests: ['M7 3h10v18H7z', 'M10 8h4M10 12h4M10 16h2'],
  orders: ['M3 7l9-4 9 4v10l-9 4-9-4z', 'M3 7l9 4 9-4M12 11v10'],
  suppliers: [
    'M3 21h18',
    'M5 21V9l7-5 7 5v12',
    'M9 13h2M13 13h2M9 17h2M13 17h2',
  ],
  company: ['M4 21V8l8-5 8 5v13', 'M9 21v-6h6v6'],
};

export function TabIcon(props: { tab: Tab; color: ColorValue }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      {PATHS[props.tab].map((d) => (
        <Path key={d} d={d} stroke={props.color} strokeWidth={1.8} />
      ))}
    </Svg>
  );
}
