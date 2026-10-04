// @ts-nocheck
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
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

// ── Use-case options ──────────────────────────────────────────────────────────
const USE_CASES = [
  { id: 'calls',        label: 'Customer calls',        icon: '◉' },
  { id: 'followups',    label: 'Follow-ups',            icon: '↗' },
  { id: 'appointments', label: 'Appointment reminders', icon: '◷' },
  { id: 'payments',     label: 'Payment reminders',     icon: '₦' },
  { id: 'other',        label: 'Other',                 icon: '···' },
];

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={sd.row}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[sd.dot, i === step && sd.dotActive, i < step && sd.dotDone]}
        />
      ))}
    </View>
  );
}

const sd = StyleSheet.create({
  row:      { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot:      { width: 6, height: 6, borderRadius: 6, backgroundColor: Colors.border },
  dotActive:{ width: 20, height: 6, borderRadius: 6, backgroundColor: Colors.accent },
  dotDone:  { backgroundColor: Colors.accent, opacity: 0.35 },
});

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [step, setStep]         = useState(0); // 0 | 1 | 2
  const [name, setName]         = useState('');
  const [company, setCompany]   = useState('');
  const [bizType, setBizType]   = useState('');
  const [useCases, setUseCases] = useState<string[]>([]);

  // Slide animation between steps
  const slideX = useRef(new Animated.Value(0)).current;

  const animateStep = (next: number) => {
    const direction = next > step ? 1 : -1;
    slideX.setValue(direction * 60);
    Animated.timing(slideX, { toValue: 0, duration: 280, useNativeDriver: true }).start();
    setStep(next);
  };

  const toggleUseCase = (id: string) => {
    setUseCases((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canAdvanceStep0 = name.trim().length > 0 && company.trim().length > 0;
  const canAdvanceStep1 = useCases.length > 0;

  // Step 2: navigate to create-account, carrying onboarding data as params
  const handleCreateAccount = () => {
    router.push({
      pathname: '/create-account' as any,
      params: {
        name:      name.trim(),
        company:   company.trim(),
        bizType:   bizType.trim(),
        useCases:  useCases.join(','),
      },
    });
  };

  const handleBack = () => {
    if (step > 0) {
      animateStep(step - 1);
    } else {
      router.replace('/welcome');
    }
  };

  // ── Shared top bar ──────────────────────────────────────────────────────────
  const topBar = (
    <View style={styles.topBar}>
      <Pressable
        style={({ pressed }) => [styles.topBarBack, pressed && { opacity: 0.6 }]}
        onPress={handleBack}
        accessibilityRole="button"
        accessibilityLabel={step === 0 ? 'Back to welcome' : 'Go back'}
      >
        <Text style={styles.topBarBackText}>← Back</Text>
      </Pressable>
      <ServexaLogo variant="wordmark" width={isMobile ? 110 : 130} />
      <View style={styles.topBarRight}>
        <StepDots step={step} total={3} />
      </View>
    </View>
  );

  // ── Step 0: Business info ───────────────────────────────────────────────────
  const step0 = (
    <View style={styles.stepWrap}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.eyebrow}>STEP 1 OF 3</Text>
      </View>
      <Text style={styles.heading}>Tell us about{'\n'}your business.</Text>
      <Text style={styles.subheading}>
        Just the basics — takes under a minute.
      </Text>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>YOUR NAME</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ada Okafor"
            placeholderTextColor={Colors.inkFaint}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>COMPANY / BUSINESS NAME</Text>
          <TextInput
            value={company}
            onChangeText={setCompany}
            placeholder="e.g. Lekki Gardens Ltd."
            placeholderTextColor={Colors.inkFaint}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>BUSINESS TYPE <Text style={styles.optional}>(optional)</Text></Text>
          <TextInput
            value={bizType}
            onChangeText={setBizType}
            placeholder="e.g. Microfinance, Healthcare, Retail…"
            placeholderTextColor={Colors.inkFaint}
            style={styles.input}
            autoCapitalize="sentences"
            returnKeyType="done"
          />
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [
          styles.primaryBtn,
          !canAdvanceStep0 && styles.primaryBtnDisabled,
          pressed && canAdvanceStep0 && styles.primaryBtnPressed,
        ]}
        onPress={() => canAdvanceStep0 && animateStep(1)}
        accessibilityRole="button"
        accessibilityLabel="Continue to next step"
      >
        <Text style={[styles.primaryBtnText, !canAdvanceStep0 && styles.primaryBtnTextDisabled]}>
          Continue
        </Text>
        <Text style={[styles.primaryBtnArrow, !canAdvanceStep0 && styles.primaryBtnTextDisabled]}>→</Text>
      </Pressable>
    </View>
  );

  // ── Step 1: Use cases ───────────────────────────────────────────────────────
  const step1 = (
    <View style={styles.stepWrap}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.eyebrow}>STEP 2 OF 3</Text>
      </View>
      <Text style={styles.heading}>What should{'\n'}SERVEXA handle?</Text>
      <Text style={styles.subheading}>
        Select everything that applies. You can change this any time.
      </Text>

      <View style={styles.useCaseGrid}>
        {USE_CASES.map((uc) => {
          const active = useCases.includes(uc.id);
          return (
            <Pressable
              key={uc.id}
              onPress={() => toggleUseCase(uc.id)}
              style={({ pressed }) => [
                styles.useCaseCard,
                active && styles.useCaseCardActive,
                pressed && styles.useCaseCardPressed,
              ]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={uc.label}
            >
              <View style={[styles.useCaseIcon, active && styles.useCaseIconActive]}>
                <Text style={[styles.useCaseIconText, active && styles.useCaseIconTextActive]}>
                  {uc.icon}
                </Text>
              </View>
              <Text style={[styles.useCaseLabel, active && styles.useCaseLabelActive]}>
                {uc.label}
              </Text>
              {active && (
                <View style={styles.useCaseCheck}>
                  <Text style={styles.useCaseCheckText}>✓</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.navRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.primaryBtnFlex,
            !canAdvanceStep1 && styles.primaryBtnDisabled,
            pressed && canAdvanceStep1 && styles.primaryBtnPressed,
          ]}
          onPress={() => canAdvanceStep1 && animateStep(2)}
          accessibilityRole="button"
          accessibilityLabel="Continue to next step"
        >
          <Text style={[styles.primaryBtnText, !canAdvanceStep1 && styles.primaryBtnTextDisabled]}>
            Continue
          </Text>
          <Text style={[styles.primaryBtnArrow, !canAdvanceStep1 && styles.primaryBtnTextDisabled]}>→</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Step 2: Summary + create account ────────────────────────────────────────
  const step2 = (
    <View style={styles.stepWrap}>
      <View style={styles.eyebrowRow}>
        <View style={styles.eyebrowDot} />
        <Text style={styles.eyebrow}>STEP 3 OF 3</Text>
      </View>

      <Text style={[styles.heading]}>
        Almost there,{'\n'}
        <Text style={styles.headingAccent}>{name.trim() || 'there'}.</Text>
      </Text>
      <Text style={styles.subheading}>
        Review your choices and create your account to get started.
      </Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>NAME</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{name.trim() || '—'}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryRowBorder]}>
          <Text style={styles.summaryLabel}>BUSINESS</Text>
          <Text style={styles.summaryValue} numberOfLines={1}>{company.trim() || '—'}</Text>
        </View>
        {useCases.length > 0 && (
          <View style={[styles.summaryRow, styles.summaryRowBorder]}>
            <Text style={styles.summaryLabel}>HANDLES</Text>
            <Text style={styles.summaryValue}>
              {useCases
                .map((id) => USE_CASES.find((u) => u.id === id)?.label)
                .filter(Boolean)
                .join(', ')}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.navRow}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.primaryBtn,
            styles.primaryBtnFlex,
            pressed && styles.primaryBtnPressed,
          ]}
          onPress={handleCreateAccount}
          accessibilityRole="button"
          accessibilityLabel="Create your account"
        >
          <Text style={styles.primaryBtnText}>Create account</Text>
          <Text style={styles.primaryBtnArrow}>→</Text>
        </Pressable>
      </View>
    </View>
  );

  const steps = [step0, step1, step2];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {topBar}

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            !isMobile && styles.scrollContentDesktop,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ transform: [{ translateX: slideX }] }}>
            {steps[step]}
          </Animated.View>
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

  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },

  skipBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },

  skipText: {
    color: Colors.inkMuted,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Scroll ─────────────────────────────────────────────────────────────────
  scroll: { flex: 1 },

  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    flexGrow: 1,
  },

  scrollContentDesktop: {
    maxWidth: 560,
    alignSelf: 'center',
    width: '100%',
    paddingTop: 48,
  },

  // ── Step wrapper ───────────────────────────────────────────────────────────
  stepWrap: {
    flex: 1,
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
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    fontFamily: Fonts?.serif ?? 'serif',
    letterSpacing: -0.4,
    marginBottom: 10,
  },

  headingCenter: { textAlign: 'center' },

  headingAccent: {
    color: Colors.accent,
    fontStyle: 'italic',
    fontFamily: Fonts?.serif ?? 'serif',
  },

  subheading: {
    color: Colors.inkMuted,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 28,
  },

  subheadingCenter: { textAlign: 'center' },

  boldInline: {
    fontWeight: '700',
    color: Colors.ink,
  },

  // ── Form ───────────────────────────────────────────────────────────────────
  form: { gap: 18, marginBottom: 28 },

  field: { gap: 7 },

  label: {
    color: Colors.inkFaint,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
  },

  optional: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '400',
    letterSpacing: 0,
  },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 16,
    fontSize: 14,
    color: Colors.ink,
    backgroundColor: Colors.surface,
  },

  // ── Use-case grid ──────────────────────────────────────────────────────────
  useCaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 28,
  },

  useCaseCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 130,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  useCaseCardActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentLight,
  },

  useCaseCardPressed: { opacity: 0.8 },

  useCaseIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: Colors.ivoryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },

  useCaseIconActive: { backgroundColor: Colors.accent },

  useCaseIconText: {
    fontSize: 15,
    color: Colors.inkMuted,
  },

  useCaseIconTextActive: { color: Colors.surface },

  useCaseLabel: {
    flex: 1,
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },

  useCaseLabelActive: { color: Colors.accentText, fontWeight: '700' },

  useCaseCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  useCaseCheckText: { color: Colors.surface, fontSize: 10, fontWeight: '800' },

  // ── Buttons ────────────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: Colors.ink,
    borderRadius: Radius.lg,
    paddingVertical: 17,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 54,
  },

  primaryBtnFlex: { flex: 1 },

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

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  backBtn: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingVertical: 17,
    paddingHorizontal: 20,
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },

  backBtnPressed: { backgroundColor: Colors.ivoryDeep },

  backBtnText: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Confirmation step ──────────────────────────────────────────────────────
  confirmMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 24,
    marginTop: 8,
  },

  confirmMarkText: {
    color: Colors.accent,
    fontSize: 28,
    fontWeight: '700',
  },

  summaryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    paddingHorizontal: 20,
    marginBottom: 28,
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 14,
    gap: 12,
  },

  summaryRowBorder: {
    borderTopWidth: 1,
    borderTopColor: Colors.ivoryDeep,
  },

  summaryLabel: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingTop: 2,
    flexShrink: 0,
  },

  summaryValue: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});
