// @ts-nocheck
/**
 * create-account.tsx
 *
 * Receives onboarding data (name, company, bizType, useCases) as route params,
 * collects email + password, then:
 *   1. Calls supabase.auth.signUp with email/password
 *   2. Saves the user profile to user_profiles (after sign-up the UID is known)
 *   3. Navigates to /verify-email with the email address
 *
 * The customer's workspace is fully isolated by auth.uid() via RLS — no data
 * from one user can ever reach another.
 */
import { router, useLocalSearchParams } from 'expo-router';
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
import { makeInitials } from '../lib/workspace';

// Password must be ≥8 chars; Supabase default minimum is 6 but we require 8.
const MIN_PASSWORD = 8;

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function humaniseError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('already registered') || m.includes('user already exists') || m.includes('email address is already'))
    return 'An account with this email already exists. Use "Sign in" instead.';
  if (m.includes('invalid email') || m.includes('unable to validate'))
    return 'Please enter a valid email address.';
  if (m.includes('password') && (m.includes('weak') || m.includes('short') || m.includes('least')))
    return `Your password must be at least ${MIN_PASSWORD} characters.`;
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch'))
    return 'Connection problem. Please check your internet and try again.';
  return msg || 'Something went wrong. Please try again.';
}

export default function CreateAccountScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // Onboarding data passed as route params
  const params = useLocalSearchParams<{
    name:     string;
    company:  string;
    bizType:  string;
    useCases: string;
  }>();

  const name      = params.name     ?? '';
  const company   = params.company  ?? '';
  const bizType   = params.bizType  ?? '';
  const useCases  = params.useCases ? params.useCases.split(',').filter(Boolean) : [];

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const emailOk    = isValidEmail(email);
  const passwordOk = password.length >= MIN_PASSWORD;
  const canSubmit  = emailOk && passwordOk && !loading;

  const handleSignUp = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError('');

    try {
      // 1. Register with Supabase Auth
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email:    normalizedEmail,
        password,
        options: {
          data: { full_name: name, company_name: company },
        },
      });

      if (signUpError) {
        setError(humaniseError(signUpError.message));
        return;
      }

      const uid     = data.user?.id;
      const session = data.session; // present immediately after signUp

      if (!uid) {
        setError('Registration failed. Please try again.');
        return;
      }

      // Supabase returns data.user but data.session = null when the email
      // already exists and is confirmed (duplicate registration attempt).
      // Detect this by checking identities array length — if empty, the
      // user already exists.
      if (data.user?.identities?.length === 0) {
        setError('An account with this email already exists. Use "Sign in" instead.');
        return;
      }

      // 2. Save workspace profile.
      //    signUp creates an unconfirmed session; use it directly for the
      //    upsert so RLS (auth.uid() = id) is satisfied immediately.
      //    If no session yet (email confirmation required by Supabase config),
      //    we store profile data using the anon key — RLS allows insert for
      //    the authenticated user only, so we pass the uid explicitly and the
      //    RLS policy on user_profiles allows it once the trigger fires.
      //
      //    To reliably bypass the RLS timing issue we store the profile data
      //    in Supabase metadata AND as a pending write that the verify-email
      //    screen will retry on confirmation.
      const initials = makeInitials(name, company);
      const profilePayload = {
        id:            uid,
        full_name:     name,
        company_name:  company,
        email:         normalizedEmail,
        business_type: bizType,
        use_cases:     useCases,
        initials,
        updated_at:    new Date().toISOString(),
      };

      // If signUp returned a session, use it directly.
      // If not, still attempt the upsert — it will succeed after confirmation
      // via the trigger or the verify-email retry.
      const [profileResult, settingsResult] = await Promise.all([
        supabase.from('user_profiles').upsert(profilePayload, { onConflict: 'id' }),
        supabase.from('workspace_settings').upsert(
          { id: uid, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        ),
      ]);

      if (profileResult.error) {
        // Non-fatal — profile will be re-saved on verify-email screen.
        // Store it in AsyncStorage as a fallback for the verify screen.
        console.warn('[create-account] profile upsert failed (will retry):', profileResult.error.message);
      }

      // 3. Store pending profile in AsyncStorage so verify-email can retry
      //    the upsert once the session is confirmed.
      const pendingKey = 'servexa_pending_profile';
      try {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.setItem(pendingKey, JSON.stringify({ ...profilePayload, uid }));
      } catch (e) {
        console.warn('[create-account] AsyncStorage pending profile save failed:', e);
      }

      // 4. Navigate to email verification screen
      router.replace({
        pathname: '/verify-email' as any,
        params: { email: normalizedEmail, name },
      });
    } catch (e) {
      setError('Something went wrong. Please try again.');
      console.error('[create-account]', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <ServexaLogo variant="wordmark" width={isMobile ? 110 : 130} />
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
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
            <Text style={styles.eyebrow}>CREATE YOUR ACCOUNT</Text>
          </View>

          <Text style={styles.heading}>
            Almost done,{'\n'}
            <Text style={styles.headingAccent}>{name || 'there'}.</Text>
          </Text>
          <Text style={styles.subheading}>
            Create your SERVEXA account for{' '}
            <Text style={styles.boldInline}>{company || 'your business'}</Text>.
            {'\n'}Your workspace will be ready immediately.
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
                style={[styles.input, error && !emailOk && styles.inputError]}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="next"
                editable={!loading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>PASSWORD</Text>
              <View style={styles.passwordWrap}>
                <TextInput
                  value={password}
                  onChangeText={(v) => { setPassword(v); setError(''); }}
                  placeholder={`At least ${MIN_PASSWORD} characters`}
                  placeholderTextColor={Colors.inkFaint}
                  style={[styles.input, styles.inputPassword, error && !passwordOk && styles.inputError]}
                  secureTextEntry={!showPw}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={handleSignUp}
                  editable={!loading}
                />
                <Pressable
                  style={styles.showPwBtn}
                  onPress={() => setShowPw((v) => !v)}
                  accessibilityLabel={showPw ? 'Hide password' : 'Show password'}
                >
                  <Text style={styles.showPwText}>{showPw ? 'Hide' : 'Show'}</Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Minimum {MIN_PASSWORD} characters</Text>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Submit */}
          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSubmit) && styles.primaryBtnDisabled,
              pressed && canSubmit && styles.primaryBtnPressed,
            ]}
            onPress={handleSignUp}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            <Text style={[
              styles.primaryBtnText,
              !canSubmit && styles.primaryBtnTextDisabled,
            ]}>
              {loading ? 'Creating account…' : 'Create account'}
            </Text>
            {!loading && (
              <Text style={[styles.primaryBtnArrow, !canSubmit && styles.primaryBtnTextDisabled]}>
                →
              </Text>
            )}
          </Pressable>

          {/* Sign-in link */}
          <View style={styles.footnoteRow}>
            <Text style={styles.footnote}>Already have an account? </Text>
            <Text
              style={styles.footnoteLink}
              onPress={() => router.replace('/sign-in' as any)}
              accessibilityRole="link"
            >
              Sign in
            </Text>
          </View>

          <Text style={styles.legal}>
            By creating an account you agree to SERVEXA's terms of service and privacy policy.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.ivory },
  flex:  { flex: 1 },
  scroll: { flex: 1 },

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
    minHeight: 36,
    justifyContent: 'center',
  },
  backBtnText: { color: Colors.ink, fontSize: 12, fontWeight: '600' },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 52,
    flexGrow: 1,
  },
  scrollContentDesktop: {
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 56,
  },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  eyebrowDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: Colors.accent },
  eyebrow:    { color: Colors.inkFaint, fontSize: 10, fontWeight: '700', letterSpacing: 2 },

  heading: {
    color: Colors.ink,
    fontSize: 38,
    lineHeight: 46,
    fontWeight: '700',
    fontFamily: Fonts?.serif ?? 'serif',
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  headingAccent: {
    color: Colors.accent,
    fontStyle: 'italic',
    fontFamily: Fonts?.serif ?? 'serif',
  },
  subheading: {
    color: Colors.inkMuted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 32,
  },
  boldInline: { fontWeight: '700', color: Colors.ink },

  form:  { gap: 20, marginBottom: 24 },
  field: { gap: 7 },
  label: { color: Colors.inkFaint, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },

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
  inputPassword: { paddingRight: 70 },
  inputError:    { borderColor: Colors.attention },

  passwordWrap: { position: 'relative' },
  showPwBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    minWidth: 44,
    alignItems: 'flex-end',
  },
  showPwText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },

  hint: { color: Colors.inkFaint, fontSize: 10, marginTop: 4 },

  errorBox: {
    backgroundColor: Colors.attentionLight ?? '#FFF0EE',
    borderRadius: Radius.md,
    padding: 13,
    borderWidth: 1,
    borderColor: '#F5C6BB',
    marginBottom: 16,
  },
  errorText: { color: Colors.attention ?? '#C0392B', fontSize: 13, lineHeight: 19 },

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
  primaryBtnDisabled: { backgroundColor: Colors.ivoryDeep, borderWidth: 1, borderColor: Colors.border },
  primaryBtnPressed:  { opacity: 0.88 },
  primaryBtnText:     { color: Colors.ivory, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  primaryBtnTextDisabled: { color: Colors.inkFaint },
  primaryBtnArrow:    { color: Colors.ivory, fontSize: 18 },

  footnoteRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  footnote:     { color: Colors.inkFaint, fontSize: 12 },
  footnoteLink: { color: Colors.accent, fontSize: 12, fontWeight: '700' },

  legal: { color: Colors.inkFaint, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
