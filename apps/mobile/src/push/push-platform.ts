/** What the phone offers for notifications. The Expo implementation is the only real one. */
export interface PushPlatform {
  /** The Expo push token of this phone; null when it cannot have one (web, permission refused). */
  pushToken(): Promise<string | null>;
  /** Calls `onOpen` with the data of the notification the person tapped. Returns the unsubscribe. */
  onNotificationOpened(onOpen: (data: unknown) => void): () => void;
}
