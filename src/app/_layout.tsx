import {
    DarkTheme,
    DefaultTheme,
    Stack,
    ThemeProvider,
} from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ensureSession } from '../lib/supabase';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    ensureSession();
  }, []);

  return (
    <ThemeProvider
      value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="customers" />
        <Stack.Screen name="campaigns" />
        <Stack.Screen name="activity" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="call-instruction" />
      </Stack>
    </ThemeProvider>
  );
}