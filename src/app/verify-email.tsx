// @ts-nocheck
/**
 * verify-email.tsx
 *
 * Shown immediately after supabase.auth.signUp. The customer has received a
 * verification email. This screen:
 *   - Shows the email address they registered with
 *   - Lets them resend the verification email
 *   - Detects when verification is complete (polling + manual check)
 *   - Navigates to the dashboard once confirmed
 *   - Never blocks the customer indefinitely
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import ServexaLogo from '../components/servexa-logo';
import { Colors, Fonts, Radius } from '../constants/theme';
import { supabase } from '../lib/supabase';
import { markOnboardingDone } from './welcome';

// Poll for session/verification every N ms while this screen is visible.
const POLL_INTERVAL_MS = 3000;
// Resend cooldown in seconds
const RESEND_COOLDOWN_S = 60;

export default function VerifyEmailScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const params = useLocalSearchParams<{ email: string; name: string }>();
  const email  = params.email ?? '';
  const name   = params.name  ?? '';

  const [resendLoading,  setResendLoading]  = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage,  setResendMessage]  = useState('');
  const [checkLoading,   setCheckLoading]   = useState(false);
  const [error,          setError]          = useState('');

  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Retry pending profile upsert (may have failed before email confirmation) ──
  const retryPendingProfile = useCallback(async () => {
    try {
      const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
      const raw = await AsyncStorage.getItem('servexa_pending_profile');
      if (!raw) return;
      const payload = JSON.parse(raw);
      const { uid, ...profileData } = payload;
      const [pRes, sRes] = await Promise.all([
        supabase.from('user_profiles').upsert(profileData, { onConflict: 'id' }),
        supabase.from('workspace_settings').upsert(
          { id: uid, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        ),
      ]);
      if (!pRes.error) {
        await AsyncStorage.removeItem('servexa_pending_profile');
      }
    } catch (e) {
      console.warn('[verify-email] retryPendingProfile error:', e);
    }
  }, []);

  // ── Check whether the current session is now verified ────────────────────────
  const checkVerification = useCallback(async () => {
    // Always refresh the token first so email_confirmed_at is up-to-date.
    // getSession() returns the cached (possibly stale) session; refreshSession()
    // fetches the latest state from Supabase.
    try {
      await supabase.auth.refreshSession();
    } catch {
      // Ignore refresh errors — the existing session may still be valid
    }
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) return false;
    // email_confirmed_at is set once the user clicks the verification link
    const confirmed = !!data.session.user?.email_confirmed_at;
    if (confirmed) {
      // Retry profile upsert in case it failed before confirmation
      await retryPendingProfile();
      await markOnboardingDone();
      router.replace('/');
      return true;
    }
    return false;
  }, [retryPendingProfile]);

  // ── Poll every POLL_INTERVAL_MS while the screen is mounted ──────────────────
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      await checkVerification();
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkVerification]);

  // ── Resend cooldown ticker ────────────────────────────────────────────────────
  const startCooldown = () => {
    setResendCooldown(RESEND_COOLDOWN_S);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownRef.current!);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  useEffect(() => () => {
    if (cooldownRef.current) clearInterval(cooldownRef.current);
  }, []);

  // ── Resend verification email ─────────────────────────────────────────────────
  const handleResend = async () => {
    if (resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    setResendMessage('');
    setError('');
    try {
      const { error: resendError } = await supabase.auth.resend({
        type:  'signup',
        email: email.toLowerCase(),
      });
      if (resendError) {
        if (resendError.message.toLowerCase().includes('rate limit') ||
            resendError.message.toLowerCase().includes('too many')) {
          setError('Too many requests. Please wait a minute before trying again.');
        } else {
          setError(resendError.message);
        }
      } else {
        setResendMessage('Verification email sent. Check your inbox (and spam folder).');
        startCooldown();
      }
    } catch {
      setError('Could not resend. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  // ── Manual "I've verified" check ─────────────────────────────────────────────
  const handleContinue = async () => {
    if (checkLoading) return;
    setCheckLoading(true);
    setError('');
    try {
      // Refresh the session so email_confirmed_at is up-to-date
      await supabase.auth.refreshSession();
      const verified = await checkVerification();
      if (!verified) {
        setError("We haven't received your verification yet. Please click the link in your email, then try again.");
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setCheckLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <ServexaLogo variant="wordmark" width={isMobile ? 110 : 130} />
        <Pressable
          style={({ pressed }) => [styles.topBarBack, pressed && { opacity: 0.6 }]}
          onPress={() => router.replace('/welcome')}
          accessibilityRole="button"
          accessibilityLabel="Back to welcome"
        >
          <Text style={styles.topBarBackText}>← Back</Text>
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
        {/* Icon */}
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>✉</Text>
        </View>

        {/* Eyebrow */}
        <View style={styles.eyebrowRow}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.eyebrow}>ALMOST THERE</Text>
        </View>

        <Text style={styles.heading}>Check your{'\n'}email.</Text>

        <Text style={styles.subheading}>
          {name ? `Hi ${name} — we` : 'We'} sent a verification link to:
        </Text>

        {/* Email chip */}
        <View style={styles.emailChip}>
          <Text style={styles.emailChipText} numberOfLines={1}>{email || 'your email address'}</Text>
        </View>

        <Text style={styles.instruction}>
          Open the email and click the link inside to activate your SERVEXA account. The link expires in 24 hours.
        </Text>

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Resend message */}
        {resendMessage ? (
          <View style={styles.successBox}>
            <Text style={styles.successText}>{resendMessage}</Text>
          </View>
        ) : null}

        {/* Primary: "I've verified my email" */}
        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            checkLoading && styles.primaryBtnLoading,
            pressed && !checkLoading && styles.primaryBtnPressed,
          ]}
          onPress={handleContinue}
          disabled={checkLoading}
          accessibilityRole="button"
          accessibilityLabel="I have verified my email"
        >
          <Text style={styles.primaryBtnText}>
            {checkLoading ? 'Checking…' : "I've verified my email"}
          </Text>
          {!checkLoading && <Text style={styles.primaryBtnArrow}>→</Text>}
        </Pressable>

        {/* Secondary: resend */}
        <Pressable
          style={({ pressed }) => [
            styles.resendBtn,
            (resendLoading || resendCooldown > 0) && styles.resendBtnDisabled,
            pressed && !resendLoading && resendCooldown === 0 && styles.resendBtnPressed,
          ]}
          onPress={handleResend}
          disabled={resendLoading || resendCooldown > 0}
          accessibilityRole="button"
          accessibilityLabel="Resend verification email"
        >
          <Text style={[
            styles.resendBtnText,
            (resendLoading || resendCooldown > 0) && styles.resendBtnTextDisabled,
          ]}>
            {resendLoading
              ? 'Sending…'
              : resendCooldown > 0
              ? `Resend in ${resendCooldown}s`
              : 'Resend verification email'}
          </Text>
        </Pressable>

        {/* Back to sign-in */}
        <Text style={styles.footnote}>
          Wrong email?{' '}
          <Text
            style={styles.footnoteLink}
            onPress={() => router.replace('/sign-in' as any)}
            accessibilityRole="link"
          >
            Sign in with a different account
          </Text>
        </Text>

        {/* Spam note */}
        <View style={styles.spamNote}>
          <Text style={styles.spamNoteText}>
            Can't find the email? Check your spam or junk folder. The sender is noreply@servexa.io.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe:  { flex: 1, backgroundColor: Colors.ivory },
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

  topBarBack: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
    minHeight: 34,
    justifyContent: 'center',
  },

  topBarBackText: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: '600',
  },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 52,
    flexGrow: 1,
  },
  scrollContentDesktop: {
    maxWidth: 480,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 60,
  },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: Colors.accentLight ?? '#E8F4F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconText: { fontSize: 32, lineHeight: 40 },

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

  subheading: { color: Colors.inkMuted, fontSize: 14, lineHeight: 22, marginBottom: 12 },

  emailChip: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.ivoryDeep ?? '#F0F2F4',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full ?? 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 20,
    maxWidth: '100%',
  },
  emailChipText: { color: Colors.ink, fontSize: 13, fontWeight: '700' },

  instruction: { color: Colors.inkMuted, fontSize: 14, lineHeight: 22, marginBottom: 24 },

  errorBox: {
    backgroundColor: Colors.attentionLight ?? '#FFF0EE',
    borderRadius: Radius.md,
    padding: 13,
    borderWidth: 1,
    borderColor: '#F5C6BB',
    marginBottom: 16,
  },
  errorText: { color: Colors.attention ?? '#C0392B', fontSize: 13, lineHeight: 19 },

  successBox: {
    backgroundColor: '#EAF7F0',
    borderRadius: Radius.md,
    padding: 13,
    borderWidth: 1,
    borderColor: '#B6E0CB',
    marginBottom: 16,
  },
  successText: { color: '#2D7A55', fontSize: 13, lineHeight: 19 },

  primaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.lg,
    paddingVertical: 17,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
    marginBottom: 12,
  },
  primaryBtnLoading: { opacity: 0.7 },
  primaryBtnPressed: { opacity: 0.88 },
  primaryBtnText:    { color: Colors.ivory, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  primaryBtnArrow:   { color: Colors.ivory, fontSize: 18 },

  resendBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 15,
    paddingHorizontal: 22,
    alignItems: 'center',
    minHeight: 52,
    marginBottom: 24,
    backgroundColor: Colors.surface,
  },
  resendBtnDisabled: { opacity: 0.55 },
  resendBtnPressed:  { backgroundColor: Colors.ivoryDeep },
  resendBtnText:     { color: Colors.ink, fontSize: 14, fontWeight: '600' },
  resendBtnTextDisabled: { color: Colors.inkFaint },

  footnote:     { color: Colors.inkFaint, fontSize: 12, textAlign: 'center', marginBottom: 16 },
  footnoteLink: { color: Colors.accent, fontWeight: '700' },

  spamNote: {
    backgroundColor: Colors.ivoryDeep ?? '#F5F6F8',
    borderRadius: Radius.md,
    padding: 14,
  },
  spamNoteText: { color: Colors.inkFaint, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
