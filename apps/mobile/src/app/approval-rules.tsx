import { Stack } from 'expo-router';
import { ApprovalRulesScreen } from '../screens/approval-rules-screen';

export default function ApprovalRules() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ApprovalRulesScreen />
    </>
  );
}
