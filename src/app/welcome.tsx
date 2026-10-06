// @ts-nocheck
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import {
    Animated,
    Easing,
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
import { Colors, Fonts, Radius } from '../constants/theme';
import ServexaLogo from '../components/servexa-logo';

const ONBOARDING_KEY = 'servexa_onboarding_done';

export async function markOnboardingDone() {
  await AsyncStorage.setItem(ONBOARDING_KEY, '1');
}

export async function hasSeenOnboarding(): Promise<boolean> {
  const val = await AsyncStorage.getItem(ONBOARDING_KEY);
  return val === '1';
}

/**
 * Development helper: clear the onboarding flag so the next app launch
 * lands on /welcome again. Call from a dev menu or console:
 *   import { resetOnboardingForDev } from './welcome';
 *   resetOnboardingForDev();
 */
export async function resetOnboardingForDev() {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
  console.log('[SERVEXA dev] Onboarding flag cleared — relaunch to see /welcome');
}

/**
 * Clear onboarding flag on sign-out so the next user on the same device
 * goes through /welcome rather than being treated as the previous user.
 */
export async function clearOnboardingFlag() {
  await AsyncStorage.removeItem(ONBOARDING_KEY);
}

// ── Capability cards data ─────────────────────────────────────────────────────
const CAPABILITIES = [
  {
    icon: '◉',
    title: 'AI Employees That Call',
    description: 'SERVEXA AI employees handle outbound and inbound calls — qualifying leads, following up on orders, and managing routine customer interactions without a human agent.',
  },
  {
    icon: '↗',
    title: 'Understand Every Conversation',
    description: 'Every call is transcribed, summarised, and classified. Sentiment, intent, and key data are extracted automatically — no manual note-taking.',
  },
  {
    icon: '◷',
    title: 'Trigger Workflows & Actions',
    description: 'Call outcomes drive real business actions: update CRM records, send follow-up messages, escalate to a human, or fire a custom workflow — automatically.',
  },
];

// ── How-it-works steps ────────────────────────────────────────────────────────
const HOW_IT_WORKS = [
  { step: '01', label: 'Listen', detail: 'AI employee places or takes the call, speaks naturally, and listens to the full conversation.' },
  { step: '02', label: 'Understand', detail: 'Call is analysed in real time — intent, sentiment, and structured data extracted.' },
  { step: '03', label: 'Act', detail: 'Outcomes trigger workflows: CRM updates, follow-ups, escalations, or custom automations.' },
];

// ── Waveform bar — animates scale on native thread ──────────────────────────
function WaveformBar({ delay, height }: { delay: number; height: number }) {
  const anim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 600 + delay * 80,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0.3,
          duration: 600 + delay * 80,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const timer = setTimeout(() => loop.start(), delay * 60);
    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, [anim, delay]);

  return (
    <Animated.View
      style={[styles.waveBar, { height, transform: [{ scaleY: anim }] }]}
    />
  );
}

// ── Phone visual — rendered SVG-style in RN ──────────────────────────────────
function PhoneVisual() {
  const bars = [12, 20, 30, 22, 36, 26, 40, 28, 32, 18, 28, 36, 22, 30, 16];
  return (
    <View style={styles.phoneFrame} accessibilityLabel="SERVEXA voice agent call interface">
      <View style={styles.phoneScreen}>
        <View style={styles.phoneNotch} />
        <View style={styles.callUI}>
          <Text style={styles.callBrand}>SERVEXA</Text>
          <Text style={styles.callLabel}>AI Employee · Active call</Text>
          <Text style={styles.callTimer}>00:18</Text>
          <View style={styles.waveform}>
            {bars.map((h, i) => (
              <WaveformBar key={i} delay={i} height={h} />
            ))}
          </View>
          <Text style={styles.listeningLabel}>Listening...</Text>
          <View style={styles.callButtons}>
            <View style={styles.callBtnGray}>
              <Text style={styles.callBtnIcon}>🎤</Text>
            </View>
            <View style={styles.callBtnRed}>
              <Text style={styles.callBtnRedIcon}>✕</Text>
            </View>
            <View style={styles.callBtnGray}>
              <Text style={styles.callBtnIcon}>···</Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.phoneHomeBar} />
    </View>
  );
}

// ── How-it-works step card ────────────────────────────────────────────────────
function HowItWorksStep({ step, label, detail, isLast }: {
  step: string;
  label: string;
  detail: string;
  isLast?: boolean;
}) {
  return (
    <View style={styles.howStep}>
      <View style={styles.howStepLeft}>
        <Text style={styles.howStepNum}>{step}</Text>
        {!isLast && <View style={styles.howStepLine} />}
      </View>
      <View style={styles.howStepBody}>
        <Text style={styles.howStepLabel}>{label}</Text>
        <Text style={styles.howStepDetail}>{detail}</Text>
      </View>
    </View>
  );
}

// ── Capability card ───────────────────────────────────────────────────────────
function CapabilityCard({ icon, title, description }: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <View style={styles.capCard}>
      <View style={styles.capIconWrap}>
        <Text style={styles.capIcon}>{icon}</Text>
      </View>
      <View style={styles.capBody}>
        <Text style={styles.capTitle}>{title}</Text>
        <Text style={styles.capDesc}>{description}</Text>
      </View>
    </View>
  );
}

// ── Welcome screen ────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const { width, height } = useWindowDimensions();
  const isMobile = width < 768;
  const isNarrow = width < 380;
  const isShortScreen = height < 680;
  const fadeIn = useRef(new Animated.Value(0)).current;
  const slideUp = useRef(new Animated.Value(24)).current;
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeIn, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(slideUp, {
        toValue: 0,
        duration: 600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeIn, slideUp]);

  const handleGetStarted = () => {
    router.push('/onboarding');
  };
  const handleSignIn = () => {
    router.push('/sign-in');
  };
  const handleSeeHow = () => {
    // Scroll to the capabilities section
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ y: 600, animated: true });
    }
  };

  // ── Hero block (shared between mobile/desktop) ──────────────────────────────
  const heroContent = (isMobileLayout: boolean) => (
    <>
      {/* Eyebrow */}
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.eyebrow}>LISTEN · UNDERSTAND · ACT</Text>
      </View>

      {/* Headline */}
      <Text style={[
        isMobileLayout ? styles.headline : styles.headlineDesktop,
        isNarrow && styles.headlineNarrow,
      ]}>
        AI employees{'\n'}
        <Text style={[
          isMobileLayout ? styles.headlineItalic : styles.headlineItalicDesktop,
          isNarrow && styles.headlineNarrow,
        ]}>for your business.</Text>
      </Text>

      {/* Subheadline */}
      <Text style={isMobileLayout ? styles.subheadline : styles.subheadlineDesktop}>
        SERVEXA deploys AI employees that handle voice calls, understand every conversation, and trigger real business actions — automatically.
      </Text>

      {/* CTAs */}
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          onPress={handleGetStarted}
          accessibilityLabel="Get started with SERVEXA"
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText} numberOfLines={1}>Get started with SERVEXA</Text>
          <Text style={styles.primaryBtnArrow}>→</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.secondaryBtn, pressed && styles.secondaryBtnPressed]}
          onPress={handleSignIn}
          accessibilityLabel="I already have an account"
          accessibilityRole="button"
        >
          <Text style={styles.secondaryBtnText} numberOfLines={1}>I already have an account</Text>
          <Text style={styles.secondaryBtnArrow}>→</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.ghostBtn, pressed && styles.ghostBtnPressed]}
          onPress={handleSeeHow}
          accessibilityLabel="See how it works"
          accessibilityRole="button"
        >
          <Text style={styles.ghostBtnText}>See how it works</Text>
          <Text style={styles.ghostBtnArrow}>↓</Text>
        </Pressable>
      </View>
    </>
  );

  // ── Capabilities section (shared) ───────────────────────────────────────────
  const capabilitiesSection = (
    <View style={styles.capSection}>
      {/* How it works strip */}
      <View style={styles.howSection}>
        <View style={styles.capSectionHeader}>
          <View style={styles.eyebrowDot} />
          <Text style={styles.capSectionLabel}>HOW IT WORKS</Text>
        </View>
        <View style={styles.howSteps}>
          {HOW_IT_WORKS.map((s, i) => (
            <HowItWorksStep
              key={s.step}
              step={s.step}
              label={s.label}
              detail={s.detail}
              isLast={i === HOW_IT_WORKS.length - 1}
            />
          ))}
        </View>
      </View>

      {/* Section header */}
      <View style={[styles.capSectionHeader, styles.capSectionHeaderTop]}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.capSectionLabel}>WHAT SERVEXA DOES</Text>
      </View>

      {/* Cards */}
      <View style={styles.capCards}>
        {CAPABILITIES.map((c) => (
          <CapabilityCard key={c.title} icon={c.icon} title={c.title} description={c.description} />
        ))}
      </View>

      {/* Closing CTA */}
      <View style={styles.capCta}>
        <Text style={styles.capCtaHeading}>
          Put AI employees{'\n'}to work.
        </Text>
        <Text style={styles.capCtaSubtext}>
          Every call handled. Every outcome tracked. Every follow-up automated.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed, styles.capCtaBtn]}
          onPress={handleGetStarted}
          accessibilityLabel="Get started with SERVEXA"
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Get started with SERVEXA</Text>
          <Text style={styles.primaryBtnArrow}>→</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />

      {/* Fixed top bar — always visible, never scrolls away */}
      <View style={styles.topBar}>
        <ServexaLogo variant="wordmark" width={130} />
      </View>

      {isMobile ? (
        // ── MOBILE: single scrollable column ───────────────────────────────────
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: slideUp }] }}>
            {/* Phone visual */}
            <View style={[
              styles.visualMobile,
              isShortScreen && styles.visualMobileShort,
              isNarrow && styles.visualMobileNarrow,
            ]}>
              <PhoneVisual />
            </View>

            {/* Hero copy + CTAs */}
            {heroContent(true)}

            {/* Bottom breathing room before capabilities */}
            <View style={{ height: 48 }} />
          </Animated.View>

          {/* Capabilities section — always outside the Animated.View so it's fully accessible */}
          {capabilitiesSection}

          <View style={{ height: 40 }} />
        </ScrollView>
      ) : (
        // ── DESKTOP: two-column hero, then full-width capabilities below ────────
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContentDesktop}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            style={[styles.desktopHero, { opacity: fadeIn, transform: [{ translateY: slideUp }] }]}
          >
            {/* Left copy column */}
            <View style={styles.desktopCopyCol}>
              {heroContent(false)}
            </View>

            {/* Right visual column */}
            <View style={styles.desktopVisualCol}>
              <PhoneVisual />
            </View>
          </Animated.View>

          {/* Capabilities section full-width below the hero */}
          <View style={styles.desktopCapWrap}>
            {capabilitiesSection}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.ivory,
  },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 8 : 4,
    paddingBottom: 8,
  },

  // ── Mobile scroll layout ───────────────────────────────────────────────────
  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
    flexGrow: 1,
  },

  // ── Desktop layout ─────────────────────────────────────────────────────────
  scrollContentDesktop: {
    paddingBottom: 32,
    flexGrow: 1,
  },

  desktopHero: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 1100,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 48,
    paddingTop: 32,
    paddingBottom: 24,
  },

  desktopCopyCol: {
    flex: 1,
    paddingRight: 60,
  },

  desktopVisualCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  desktopCapWrap: {
    maxWidth: 1100,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: 48,
  },

  // ── Eyebrow ────────────────────────────────────────────────────────────────
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    marginBottom: 12,
  },

  eyebrowDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: Colors.accent,
  },

  eyebrow: {
    color: Colors.inkMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },

  // ── Headline — mobile ──────────────────────────────────────────────────────
  headline: {
    color: Colors.ink,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '700',
    fontFamily: Fonts?.serif ?? 'serif',
    letterSpacing: -0.5,
  },

  headlineNarrow: {
    fontSize: 34,
    lineHeight: 40,
  },

  headlineItalic: {
    fontStyle: 'italic',
    fontFamily: Fonts?.serif ?? 'serif',
  },

  // ── Headline — desktop ─────────────────────────────────────────────────────
  headlineDesktop: {
    color: Colors.ink,
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '700',
    fontFamily: Fonts?.serif ?? 'serif',
    letterSpacing: -1,
  },

  headlineItalicDesktop: {
    fontStyle: 'italic',
    fontFamily: Fonts?.serif ?? 'serif',
  },

  // ── Subheadline ────────────────────────────────────────────────────────────
  subheadline: {
    color: Colors.inkMuted,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 14,
    maxWidth: 380,
  },

  subheadlineDesktop: {
    color: Colors.inkMuted,
    fontSize: 17,
    lineHeight: 28,
    marginTop: 16,
    maxWidth: 440,
  },

  // ── Phone visual ───────────────────────────────────────────────────────────
  visualMobile: {
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 24,
  },

  visualMobileShort: {
    marginTop: 18,
    marginBottom: 16,
  },

  visualMobileNarrow: {
    transform: [{ scale: 0.82 }],
    marginTop: 8,
    marginBottom: 4,
  },

  // ── CTAs ───────────────────────────────────────────────────────────────────
  actions: {
    gap: 10,
    marginTop: 20,
  },

  primaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
  },

  primaryBtnPressed: {
    opacity: 0.88,
  },

  primaryBtnText: {
    color: Colors.ivory,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },

  primaryBtnArrow: {
    color: Colors.ivory,
    fontSize: 18,
  },

  secondaryBtn: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 54,
  },

  secondaryBtnPressed: {
    backgroundColor: Colors.ivoryDeep,
  },

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

  // Ghost (tertiary) button — "See how it works"
  ghostBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    gap: 8,
  },

  ghostBtnPressed: {
    opacity: 0.65,
  },

  ghostBtnText: {
    color: Colors.inkMuted,
    fontSize: 14,
    fontWeight: '600',
  },

  ghostBtnArrow: {
    color: Colors.inkMuted,
    fontSize: 16,
  },

  // ── Phone frame ────────────────────────────────────────────────────────────
  phoneFrame: {
    width: 210,
    height: 390,
    backgroundColor: '#0D1117',
    borderRadius: 36,
    borderWidth: 3,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
    alignItems: 'center',
    paddingBottom: 16,
  },

  phoneScreen: {
    flex: 1,
    width: '100%',
    backgroundColor: '#0D1117',
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  phoneNotch: {
    width: 70,
    height: 10,
    backgroundColor: '#0D1117',
    borderRadius: 10,
    alignSelf: 'center',
    marginBottom: 18,
    borderWidth: 2,
    borderColor: '#1E1E1E',
  },

  callUI: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
  },

  callBrand: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },

  callLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '500',
  },

  callTimer: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginTop: 6,
  },

  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginVertical: 18,
    height: 44,
  },

  waveBar: {
    width: 3,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 3,
  },

  listeningLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '500',
  },

  callButtons: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 22,
    alignItems: 'center',
  },

  callBtnGray: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callBtnRed: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E5342A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callBtnIcon: {
    fontSize: 14,
  },

  callBtnRedIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  phoneHomeBar: {
    width: 60,
    height: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6,
  },

  // ── Capabilities section ───────────────────────────────────────────────────
  capSection: {
    paddingHorizontal: 20,
    paddingTop: 36,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  capSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },

  capSectionLabel: {
    color: Colors.inkFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
  },

  capCards: {
    gap: 12,
  },

  capCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 18,
  },

  capIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },

  capIcon: {
    fontSize: 16,
    color: Colors.accentText,
  },

  capBody: {
    flex: 1,
  },

  capTitle: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },

  capDesc: {
    color: Colors.inkMuted,
    fontSize: 13,
    lineHeight: 20,
  },

  // ── How-it-works section ───────────────────────────────────────────────────
  howSection: {
    paddingBottom: 32,
    marginBottom: 32,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  howSteps: {
    gap: 0,
  },

  howStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    minHeight: 72,
  },

  howStepLeft: {
    alignItems: 'center',
    width: 32,
    flexShrink: 0,
  },

  howStepNum: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },

  howStepLine: {
    width: 1,
    flex: 1,
    backgroundColor: Colors.border,
    marginTop: 6,
    marginBottom: 0,
    minHeight: 28,
  },

  howStepBody: {
    flex: 1,
    paddingBottom: 24,
  },

  howStepLabel: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },

  howStepDetail: {
    color: Colors.inkMuted,
    fontSize: 13,
    lineHeight: 20,
  },

  capSectionHeaderTop: {
    marginTop: 0,
  },

  // ── Closing CTA ────────────────────────────────────────────────────────────
  capCta: {
    marginTop: 36,
    paddingTop: 32,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },

  capCtaHeading: {
    color: Colors.ink,
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    fontFamily: Fonts?.serif ?? 'serif',
    letterSpacing: -0.3,
    marginBottom: 8,
  },

  capCtaSubtext: {
    color: Colors.inkMuted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },

  capCtaBtn: {
    // No override needed — inherits primaryBtn styles
  },
});
