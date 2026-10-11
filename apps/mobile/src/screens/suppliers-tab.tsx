import { useState } from 'react';
import { View } from 'react-native';
import { ScreenHeader } from '../components/screen-header';
import { SegmentedControl, styles } from '../components/ui';
import { CatalogScreen } from './catalog-screen';
import { SuppliersScreen } from './suppliers-screen';

const SEGMENTS = [
  { value: 'suppliers', label: 'Suppliers' },
  { value: 'catalog', label: 'Catalog' },
] as const;

export function SuppliersTab() {
  const [segment, setSegment] =
    useState<(typeof SEGMENTS)[number]['value']>('suppliers');
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.segmentBar}>
        <ScreenHeader title="Suppliers" lead={{ kind: 'company' }} />
      </View>
      <View style={styles.segmentBar}>
        <SegmentedControl
          options={SEGMENTS}
          value={segment}
          onChange={setSegment}
        />
      </View>
      {segment === 'suppliers' ? <SuppliersScreen /> : <CatalogScreen />}
    </View>
  );
}
