import { Stack } from 'expo-router';
import { MembersScreen } from '../screens/members-screen';

export default function Members() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <MembersScreen />
    </>
  );
}
