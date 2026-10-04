// @ts-nocheck
import { router } from 'expo-router';
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import AppShell from '../components/app-shell';
import { useWorkspace } from '../lib/workspace';

const PLAN_FEATURES: Record<string, string[]> = {
  Free: [
    'Up to 50 customer contacts',
    'Up to 20 automated calls/month',
    'Basic activity log',
    'Email support',
  ],
  Starter: [
    'Up to 500 customer contacts',
    'Up to 200 automated calls/month',
    'Follow-up automation',
    'Priority email support',
  ],
  Growth: [
    'Unlimited customer contacts',
    'Unlimited automated calls',
    'Full campaign automation',
    'Escalation & payment workflows',
    'Analytics & reporting',
    'Priority support',
  ],
  Enterprise: [
    'Everything in Growth',
    'Custom telephony configuration',
    'Dedicated account manager',
    'SLA & compliance support',
    'API & VEYRA integration',
    'White-label options',
  ],
};

function PlanBadge({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <View style={styles.currentBadge}>
      <Text style={styles.currentBadgeText}>CURRENT</Text>
    </View>
  );
}

export default function PlanScreen() {
  const { profile, settings } = useWorkspace();

  const currentPlan = settings.plan_name || 'Free';
  const planStatus  = settings.plan_status || 'active';

  const handleUpgrade = (planName: string) => {
    if (planName === currentPlan) return;
    Alert.alert(
      'Upgrade plan',
      `Billing integration is not yet connected. To upgrade to ${planName}, contact SERVEXA support.\n\nYour current plan (${currentPlan}) remains active.`,
      [{ text: 'OK' }]
    );
  };

  const handleContactSupport = () => {
    Alert.alert(
      'Contact support',
      'Reach the SERVEXA team at support@servexa.io for billing questions.',
      [{ text: 'OK' }]
    );
  };

  const plans = ['Free', 'Starter', 'Growth', 'Enterprise'];

  return (
    <AppShell>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>BILLING & SUBSCRIPTION</Text>
          <Text style={styles.title}>Your plan</Text>
          <Text style={styles.subtitle}>
            Manage your SERVEXA subscription and usage.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
      </View>

      {/* Current plan summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryLeft}>
          <Text style={styles.summaryEyebrow}>CURRENT PLAN</Text>
          <Text style={styles.summaryPlan}>{currentPlan}</Text>
          <View style={[
            styles.statusPill,
            planStatus === 'active' && styles.statusActive,
            planStatus === 'trial'  && styles.statusTrial,
            planStatus === 'past_due' && styles.statusPastDue,
          ]}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>
              {planStatus === 'active'   ? 'Active'
               : planStatus === 'trial' ? 'Trial'
               : planStatus === 'past_due' ? 'Payment due'
               : planStatus}
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [styles.supportBtn, pressed && { opacity: 0.8 }]}
          onPress={handleContactSupport}
          accessibilityRole="button"
          accessibilityLabel="Contact support"
        >
          <Text style={styles.supportBtnText}>Contact support</Text>
        </Pressable>
      </View>

      {/* Plan cards */}
      <Text style={styles.sectionTitle}>Available plans</Text>
      <Text style={styles.sectionSub}>
        Billing integration is coming soon. Contact support to change your plan.
      </Text>

      <View style={styles.planGrid}>
        {plans.map((plan) => {
          const isCurrent = plan === currentPlan;
          const features  = PLAN_FEATURES[plan] ?? [];
          return (
            <View key={plan} style={[styles.planCard, isCurrent && styles.planCardActive]}>
              <View style={styles.planCardHeader}>
                <Text style={[styles.planCardName, isCurrent && styles.planCardNameActive]}>
                  {plan}
                </Text>
                <PlanBadge active={isCurrent} />
              </View>
              <View style={styles.featureList}>
                {features.map((f) => (
                  <View key={f} style={styles.featureRow}>
                    <Text style={[styles.featureTick, isCurrent && styles.featureTickActive]}>✓</Text>
                    <Text style={[styles.featureText, isCurrent && styles.featureTextActive]}>{f}</Text>
                  </View>
                ))}
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.planBtn,
                  isCurrent && styles.planBtnCurrent,
                  pressed && !isCurrent && styles.planBtnPressed,
                ]}
                onPress={() => handleUpgrade(plan)}
                accessibilityRole="button"
                accessibilityLabel={isCurrent ? `Current plan: ${plan}` : `Upgrade to ${plan}`}
              >
                <Text style={[styles.planBtnText, isCurrent && styles.planBtnTextCurrent]}>
                  {isCurrent ? 'Current plan' : `Switch to ${plan}`}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>

      {/* Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeIcon}>ℹ</Text>
        <Text style={styles.noticeText}>
          Billing and payments are not yet connected. Plan changes will be processed manually.
          Contact support@servexa.io to upgrade or manage your subscription.
        </Text>
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 22,
  },
  eyebrow: { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#15232E', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6 },

  backBtn: {
    backgroundColor: '#F5F7F9',
    borderWidth: 1,
    borderColor: '#E0E4E8',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backBtnText: { color: '#2D3A42', fontSize: 11, fontWeight: '600' },

  summaryCard: {
    backgroundColor: '#112936',
    borderRadius: 21,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 14,
    marginBottom: 24,
  },
  summaryLeft: { gap: 6 },
  summaryEyebrow: { color: '#6B8A96', fontSize: 8, fontWeight: '900', letterSpacing: 1.3 },
  summaryPlan: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', lineHeight: 32 },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statusActive:  { backgroundColor: 'rgba(75,186,128,0.18)' },
  statusTrial:   { backgroundColor: 'rgba(234,179,0,0.18)' },
  statusPastDue: { backgroundColor: 'rgba(231,89,74,0.18)' },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#4BBA80',
  },
  statusText: { color: '#B5D6C0', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },

  supportBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 11,
    paddingHorizontal: 16,
    paddingVertical: 11,
    minHeight: 42,
    justifyContent: 'center',
  },
  supportBtnText: { color: '#D6E1E5', fontSize: 10, fontWeight: '800' },

  sectionTitle: { color: '#202A33', fontSize: 17, fontWeight: '900', marginBottom: 4 },
  sectionSub:   { color: '#8C969F', fontSize: 10, marginBottom: 16 },

  planGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  planCard: {
    flex: 1,
    minWidth: 200,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EC',
    borderRadius: 18,
    padding: 18,
    gap: 14,
  },
  planCardActive: {
    backgroundColor: '#EAF7F4',
    borderColor: '#147983',
    borderWidth: 2,
  },
  planCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  planCardName: { color: '#2D3A42', fontSize: 16, fontWeight: '900' },
  planCardNameActive: { color: '#147983' },

  currentBadge: {
    backgroundColor: '#147983',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  currentBadgeText: { color: '#FFFFFF', fontSize: 7, fontWeight: '900', letterSpacing: 0.5 },

  featureList: { gap: 8 },
  featureRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  featureTick: { color: '#9BA5AE', fontSize: 11, lineHeight: 16, width: 14 },
  featureTickActive: { color: '#147983' },
  featureText: { color: '#606B74', fontSize: 10, lineHeight: 16, flex: 1 },
  featureTextActive: { color: '#2D3A42' },

  planBtn: {
    backgroundColor: '#15232E',
    borderRadius: 11,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  planBtnCurrent: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#147983',
  },
  planBtnPressed: { opacity: 0.85 },
  planBtnText:    { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  planBtnTextCurrent: { color: '#147983' },

  notice: {
    backgroundColor: '#F0F6F7',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  noticeIcon: { color: '#5A8A8F', fontSize: 14, lineHeight: 20 },
  noticeText: { flex: 1, color: '#5A7075', fontSize: 10, lineHeight: 16 },
});
