import { Stack } from 'expo-router';
import { LoginScreen } from '../screens/login-screen';

export default function Login() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <LoginScreen />
    </>
  );
}
