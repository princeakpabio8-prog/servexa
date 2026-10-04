// @ts-nocheck
import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import ServexaLogo from '../components/servexa-logo';
import { Colors, Fonts, Radius } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { markOnboardingDone } from './welcome';

export default function SignInScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const canSubmit = email.trim().length > 0 && password.length >= 6;

  const handleSignIn = async () => {
    if (!canSubmit || loading) return;
    setLoading(true);
    setError('');

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (signInError) {
        const m = signInError.message.toLowerCase();
        if (m.includes('invalid') || m.includes('wrong')) {
          setError('Email or password is incorrect. Please try again.');
        } else if (m.includes('email not confirmed') || m.includes('not confirmed')) {
          setError('Please verify your email before signing in. Check your inbox for the verification link.');
        } else if (m.includes('rate limit') || m.includes('too many')) {
          setError('Too many sign-in attempts. Please wait a minute and try again.');
        } else {
          setError(signInError.message);
        }
        return;
      }

      // Signed in — mark onboarding done so they land on the dashboard next time
      await markOnboardingDone();
      router.replace('/');
    } catch (err) {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleGetStarted = () => {
    router.replace('/onboarding');
  };

  const handleBack = () => {
    router.replace('/welcome');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <ServexaLogo variant="wordmark" width={isMobile ? 110 : 130} />
          <Pressable
            style={styles.backBtn}
            onPress={handleBack}
            accessibilityLabel="Go back"
            accessibilityRole="button"
          >
            <Text style={styles.backBtnText}>← Back</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            !isMobile && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Eyebrow */}
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>EXISTING ACCOUNT</Text>
          </View>

          <Text style={styles.heading}>
            Welcome{'\n'}
            <Text style={styles.headingItalic}>back.</Text>
          </Text>
          <Text style={styles.subheading}>
            Sign in to your SERVEXA workspace.
          </Text>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>WORK EMAIL</Text>
              <TextInput
                value={email}
                onChangeText={(v) => { setEmail(v); setError(''); }}
                placeholder="you@company.com"
                placeholderTextColor={Colors.inkFaint}
                style={[styles.input, error ? styles.inputError : null]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                value={password}
                onChangeText={(v) => { setPassword(v); setError(''); }}
                placeholder="Your password"
                placeholderTextColor={Colors.inkFaint}
                style={[styles.input, error ? styles.inputError : null]}
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
              />
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </View>

          {/* Sign in button */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSubmit || loading) && styles.primaryBtnDisabled,
              pressed && canSubmit && !loading && styles.primaryBtnPressed,
            ]}
            onPress={handleSignIn}
            disabled={!canSubmit || loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            <Text style={[
              styles.primaryBtnText,
              (!canSubmit || loading) && styles.primaryBtnTextDisabled,
            ]}>
              {loading ? 'Signing in…' : 'Sign in to SERVEXA'}
            </Text>
            {!loading && <Text style={[
              styles.primaryBtnArrow,
              !canSubmit && styles.primaryBtnTextDisabled,
            ]}>→</Text>}
          </Pressable>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* New account CTA */}
          <Pressable
            style={({ pressed }) => [
              styles.secondaryBtn,
              pressed && styles.secondaryBtnPressed,
            ]}
            onPress={handleGetStarted}
            accessibilityRole="button"
            accessibilityLabel="Create a new account"
          >
            <Text style={styles.secondaryBtnText}>Create a new account</Text>
            <Text style={styles.secondaryBtnArrow}>→</Text>
          </Pressable>

          {/* Fine print */}
          <Text style={styles.footnote}>
            By continuing you agree to SERVEXA's terms of service and privacy policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: Colors.ivory },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.ivory,
  },

  backBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },

  backBtnText: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 48,
    flexGrow: 1,
  },

  scrollContentDesktop: {
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 56,
  },

  // ── Eyebrow ────────────────────────────────────────────────────────────────
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },

  eyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },

  eyebrow: {
    color: Colors.inkFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // ── Headings ───────────────────────────────────────────────────────────────
  heading: {
    color: Colors.ink,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '700',
    fontFamily: Fonts?.serif ?? 'serif',
    letterSpacing: -0.5,
    marginBottom: 10,
  },

  headingItalic: {
    fontStyle: 'italic',
    fontFamily: Fonts?.serif ?? 'serif',
  },

  subheading: {
    color: Colors.inkMuted,
    fontSize: 15,
    lineHeight: 23,
    marginBottom: 32,
  },

  // ── Form ───────────────────────────────────────────────────────────────────
  form: { gap: 18, marginBottom: 24 },

  field: { gap: 7 },

  label: {
    color: Colors.inkFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },

  input: {
    height: 52,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    fontSize: 14,
    color: Colors.ink,
    backgroundColor: Colors.surface,
  },

  inputError: {
    borderColor: Colors.attention,
  },

  errorBox: {
    backgroundColor: Colors.attentionLight,
    borderRadius: Radius.md,
    padding: 13,
    borderWidth: 1,
    borderColor: '#F5C6BB',
  },

  errorText: {
    color: Colors.attention,
    fontSize: 13,
    lineHeight: 19,
  },

  // ── Primary button ─────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.lg,
    paddingVertical: 17,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    marginBottom: 20,
  },

  primaryBtnDisabled: {
    backgroundColor: Colors.ivoryDeep,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  primaryBtnPressed: { opacity: 0.88 },

  primaryBtnText: {
    color: Colors.ivory,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },

  primaryBtnTextDisabled: { color: Colors.inkFaint },

  primaryBtnArrow: {
    color: Colors.ivory,
    fontSize: 18,
  },

  // ── Divider ────────────────────────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },

  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },

  dividerText: {
    color: Colors.inkFaint,
    fontSize: 12,
  },

  // ── Secondary button ───────────────────────────────────────────────────────
  secondaryBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 54,
    marginBottom: 28,
  },

  secondaryBtnPressed: { backgroundColor: Colors.ivoryDeep },

  secondaryBtnText: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },

  secondaryBtnArrow: {
    color: Colors.inkMuted,
    fontSize: 18,
  },

  // ── Footnote ───────────────────────────────────────────────────────────────
  footnote: {
    color: Colors.inkFaint,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },
});
