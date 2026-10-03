import { View } from 'react-native';
import { Loading, styles } from '../components/ui';

/**
 * The address Google sign-in returns to (see session/google-sign-in.ts). The auth browser session
 * normally catches it before it opens in the app; on the web target it is the popup's last page,
 * which the root layout hands back to the app window.
 */
export function GoogleReturnScreen() {
  return (
    <View style={styles.screen}>
      <Loading label="Completing Google sign-in" />
    </View>
  );
}
