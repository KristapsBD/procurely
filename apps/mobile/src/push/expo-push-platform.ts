import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PushPlatform } from './push-platform';

// Show a notification that arrives while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as
    { eas?: { projectId?: string } } | undefined;
  return (
    extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID
  );
}

export const expoPushPlatform: PushPlatform = {
  async pushToken() {
    if (Platform.OS === 'web') return null;
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== 'granted') return null;
    const { data } = await Notifications.getExpoPushTokenAsync({
      projectId: projectId(),
    });
    return data;
  },
  onNotificationOpened(onOpen) {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => onOpen(response.notification.request.content.data),
    );
    return () => subscription.remove();
  },
};
