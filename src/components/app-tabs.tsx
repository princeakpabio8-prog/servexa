import { Stack } from 'expo-router';

export default function AppTabs() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
      }}
    />
  );
}