// @ts-nocheck
import {
    DarkTheme,
    DefaultTheme,
    Stack,
    ThemeProvider,
    router,
} from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { hasSeenOnboarding } from './welcome';

type BootState = 'loading' | 'welcome' | 'app' | 'verify';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [boot, setBoot] = useState<BootState>('loading');

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const session  = data.session;
      const isAnon   = session?.user?.is_anonymous === true;
      const realUser = !!session && !isAnon;
      const seen     = await hasSeenOnboarding();

      let next: BootState;
      if (!realUser) {
        // No real session → welcome
        next = 'welcome';
      } else if (seen) {
        // Real session + onboarding done → dashboard
        next = 'app';
      } else {
        // Real session but onboarding not done → they may be mid-verification
        next = 'verify';
      }

      if (!cancelled) setBoot(next);
    };
    init();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (boot === 'loading') return;
    if (boot === 'welcome') {
      router.replace('/welcome');
    } else if (boot === 'verify') {
      // Real session but onboarding not yet marked done.
      // Send them to verify-email (they may have a pending email confirmation).
      router.replace('/verify-email');
    }
    // boot === 'app': filesystem default '/' is correct.
  }, [boot]);

  if (boot === 'loading') {
    return (
      <SafeAreaProvider>
        <View style={styles.boot}>
          <Text style={styles.bootBrand}>SERVEXA</Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'fade',
          }}
          initialRouteName={
            boot === 'welcome' ? 'welcome'
            : boot === 'verify' ? 'verify-email'
            : 'index'
          }
        >
          <Stack.Screen name="welcome" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="create-account" />
          <Stack.Screen name="verify-email" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="index" />
          <Stack.Screen name="calls" />
          <Stack.Screen name="agents" />
          <Stack.Screen name="contacts" />
          <Stack.Screen name="workflows" />
          <Stack.Screen name="customers" />
          <Stack.Screen name="campaigns" />
          <Stack.Screen name="activity" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="call-instruction" />
          <Stack.Screen name="call-detail" />
          <Stack.Screen name="plan" />
          <Stack.Screen name="edit-profile" />
          <Stack.Screen name="employee/[id]" />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: Colors.ivory,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bootBrand: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
    opacity: 0.6,
  },
});
