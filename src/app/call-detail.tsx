// @ts-nocheck
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Colors, Radius, Shadow } from '../constants/theme';
import { ensureSession, supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type CallRecord = {
  id: string;
  status: string;
  transcript: string | null;
  recording_url: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  customer_id: string;
  campaign_id: string | null;
};

type Outcome = {
  outcome: string;
  summary: string | null;
  sentiment: string | null;
  actionable: boolean;
  action_required: string | null;
};

type FollowUp = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  due_at: string | null;
};

type Customer = {
  name: string;
  phone: string;
  email: string | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const capitalise = (value: string | null | undefined) =>
  (value ?? 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const formatDuration = (seconds: number | null) => {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

const sentimentEmoji = (s: string | null) => {
  if (s === 'positive') return '😊';
  if (s === 'negative') return '😟';
  if (s === 'mixed') return '😐';
  return '—';
};

const outcomeColor = (outcome: string | null) => {
  if (!outcome) return Colors.neutral;
  const o = outcome.toLowerCase();
  if (o.includes('resolved') || o.includes('completed') || o.includes('success')) return Colors.positive;
  if (o.includes('escalat') || o.includes('failed') || o.includes('no answer')) return Colors.attention;
  return Colors.accent;
};

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function CallDetailScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { callId } = useLocalSearchParams<{ callId?: string }>();

  const [call, setCall] = useState<CallRecord | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadReport = async () => {
    if (!callId) { setLoading(false); return; }
    try {
      await ensureSession();

      const { data: callData, error: callError } = await supabase
        .from('calls')
        .select('id, status, transcript, recording_url, duration_seconds, started_at, ended_at, created_at, customer_id, campaign_id')
        .eq('id', callId)
        .single();
      if (callError) throw callError;

      const [{ data: outcomeData }, { data: followUpData }, { data: customerData }] = await Promise.all([
        supabase
          .from('call_outcomes')
          .select('outcome, summary, sentiment, actionable, action_required')
          .eq('call_id', callId)
          .maybeSingle(),
        supabase
          .from('follow_ups')
          .select('id, title, description, status, due_at')
          .eq('call_id', callId)
          .order('created_at', { ascending: false }),
        supabase
          .from('customers')
          .select('name, phone, email')
          .eq('id', callData.customer_id)
          .single(),
      ]);

      // Look up which AI employee (campaign) handled this call
      if (callData.campaign_id) {
        const { data: campaign } = await supabase
          .from('campaigns')
          .select('name')
          .eq('id', callData.campaign_id)
          .single();
        setEmployeeName(campaign?.name ?? null);
      } else {
        setEmployeeName(null);
      }

      setCall(callData);
      setOutcome(outcomeData ?? null);
      setFollowUps(followUpData ?? []);
      setCustomer(customerData ?? null);
    } catch (err) {
      console.error('[CallDetail] load error:', err);
      Alert.alert('Report unavailable', 'We could not load this call report yet. Try refreshing shortly.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadReport(); }, [callId]);

  const refreshReport = () => {
    setRefreshing(true);
    loadReport();
  };

  const completeFollowUp = async (followUpId: string) => {
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', followUpId);
    if (error) { Alert.alert('Update failed', error.message); return; }
    setFollowUps((items) =>
      items.map((item) => item.id === followUpId ? { ...item, status: 'completed' } : item)
    );
  };

  const callCustomer = () => {
    if (!customer?.phone) return;
    Linking.openURL(`tel:${customer.phone}`);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={styles.loader} size="large" color={Colors.accent} />
      </SafeAreaView>
    );
  }

  if (!call) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Call report unavailable</Text>
          <Pressable style={styles.missingBtn} onPress={() => router.back()}>
            <Text style={styles.missingBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const callIsCompleted = call.status === 'completed';
  const callIsFailed = call.status === 'failed';
  const outcomeTone = outcomeColor(outcome?.outcome ?? null);
  const pendingFollowUps = followUps.filter((f) => f.status !== 'completed');

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />
      <ScrollView
        contentContainerStyle={[styles.content, !isMobile && styles.contentWide]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Pressable
            style={styles.refreshBtn}
            onPress={refreshReport}
            disabled={refreshing}
            accessibilityLabel="Refresh report"
          >
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</Text>
          </Pressable>
        </View>

        {/* ── HERO: Customer + Outcome ─────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.eyebrow}>CALL REPORT</Text>
            <Text style={styles.customerName}>{customer?.name ?? 'Customer'}</Text>
            {outcome?.outcome && (
              <View style={[styles.outcomePill, { backgroundColor: `${outcomeTone}18` }]}>
                <Text style={[styles.outcomeLabel, { color: outcomeTone }]}>
                  {capitalise(outcome.outcome)}
                </Text>
              </View>
            )}
            {employeeName && (
              <View style={styles.employeeTag}>
                <Text style={styles.employeeTagIcon}>◉</Text>
                <Text style={styles.employeeTagText}>{employeeName}</Text>
              </View>
            )}
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaDate}>
              {new Date(call.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
            {call.duration_seconds && (
              <Text style={styles.heroMetaDuration}>{formatDuration(call.duration_seconds)}</Text>
            )}
          </View>
        </View>

        {/* ── SUMMARY ──────────────────────────────────────────── */}
        {outcome?.summary && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>SUMMARY</Text>
            <Text style={styles.summaryText}>{outcome.summary}</Text>
          </View>
        )}

        {/* ── NEXT ACTION ──────────────────────────────────────── */}
        {outcome?.action_required && (
          <View style={styles.nextActionCard}>
            <Text style={styles.nextActionEyebrow}>NEXT ACTION</Text>
            <Text style={styles.nextActionText}>{outcome.action_required}</Text>
          </View>
        )}

        {/* ── PRIMARY ACTIONS ──────────────────────────────────── */}
        <View style={styles.actionsRow}>
          {pendingFollowUps.length > 0 && (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && { opacity: 0.8 }]}
              onPress={() => completeFollowUp(pendingFollowUps[0].id)}
              accessibilityLabel="Mark follow-up complete"
            >
              <Text style={styles.actionBtnTextPrimary}>✓ Follow up</Text>
            </Pressable>
          )}
          {customer?.phone && (
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.8 }]}
              onPress={callCustomer}
              accessibilityLabel={`Call ${customer.name}`}
            >
              <Text style={styles.actionBtnTextOutline}>☎ Call</Text>
            </Pressable>
          )}
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.8 }]}
            onPress={() => router.push('/customers' as any)}
            accessibilityLabel="View customer record"
          >
            <Text style={styles.actionBtnTextOutline}>Profile</Text>
          </Pressable>
        </View>

        {/* ── CALL DETAILS ─────────────────────────────────────── */}
        <View style={styles.detailCard}>
          <Text style={styles.cardEyebrow}>CALL DETAILS</Text>
          <View style={styles.detailGrid}>
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Status</Text>
              <View style={[
                styles.statusPill,
                callIsCompleted && styles.statusPillCompleted,
                callIsFailed && styles.statusPillFailed,
              ]}>
                <Text style={[
                  styles.statusPillText,
                  callIsCompleted && styles.statusPillTextCompleted,
                  callIsFailed && styles.statusPillTextFailed,
                ]}>
                  {capitalise(call.status)}
                </Text>
              </View>
            </View>
            {call.duration_seconds && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Duration</Text>
                <Text style={styles.detailValue}>{formatDuration(call.duration_seconds)}</Text>
              </View>
            )}
            {outcome?.sentiment && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Sentiment</Text>
                <Text style={styles.detailValue}>
                  {sentimentEmoji(outcome.sentiment)} {capitalise(outcome.sentiment)}
                </Text>
              </View>
            )}
            {call.started_at && (
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Started</Text>
                <Text style={styles.detailValue}>
                  {new Date(call.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* ── FOLLOW-UPS ───────────────────────────────────────── */}
        {followUps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Follow-ups</Text>
            <View style={styles.listCard}>
              {followUps.map((followUp) => (
                <View key={followUp.id} style={styles.followUpRow}>
                  <View style={styles.followUpBody}>
                    <Text style={styles.followUpTitle}>{followUp.title}</Text>
                    {followUp.description && (
                      <Text style={styles.followUpDesc}>{followUp.description}</Text>
                    )}
                    {followUp.due_at && (
                      <Text style={styles.followUpDue}>
                        Due {new Date(followUp.due_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric',
                        })}
                      </Text>
                    )}
                  </View>
                  {followUp.status !== 'completed' ? (
                    <Pressable
                      style={styles.followUpCompleteBtn}
                      onPress={() => completeFollowUp(followUp.id)}
                      accessibilityLabel="Mark complete"
                    >
                      <Text style={styles.followUpCompleteBtnText}>Done</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.followUpDonePill}>
                      <Text style={styles.followUpDoneText}>✓ Done</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── TRANSCRIPT ───────────────────────────────────────── */}
        {call.transcript && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Transcript</Text>
            <View style={styles.transcriptCard}>
              <Text style={styles.transcriptText}>{call.transcript}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.ivory,
  },
  loader: { flex: 1 },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  missingTitle: { color: Colors.ink, fontSize: 16, fontWeight: '700' },
  missingBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  missingBtnText: { color: Colors.surface, fontSize: 13, fontWeight: '700' },

  content: {
    padding: 16,
    paddingBottom: 60,
  },
  contentWide: {
    maxWidth: 720,
    alignSelf: 'center',
    width: '100%',
    padding: 28,
    paddingBottom: 60,
  },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backArrow: { color: Colors.accent, fontSize: 26, lineHeight: 26 },
  backText: { color: Colors.accent, fontSize: 13, fontWeight: '700' },
  refreshBtn: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  refreshText: { color: Colors.accent, fontSize: 11, fontWeight: '700' },

  // Hero
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    gap: 12,
  },
  heroLeft: { flex: 1 },
  eyebrow: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  customerName: {
    color: Colors.ink,
    fontSize: 26,
    fontWeight: '800',
    lineHeight: 30,
  },
  outcomePill: {
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 8,
  },
  outcomeLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  employeeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  employeeTagIcon: {
    color: Colors.accent,
    fontSize: 10,
  },
  employeeTagText: {
    color: Colors.accentText,
    fontSize: 11,
    fontWeight: '600',
  },
  heroMeta: {
    alignItems: 'flex-end',
    paddingTop: 20,
  },
  heroMetaDate: {
    color: Colors.inkMuted,
    fontSize: 11,
    fontWeight: '500',
  },
  heroMetaDuration: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },

  // Summary
  summaryCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 12,
    ...Shadow.subtle,
  },
  summaryEyebrow: {
    color: Colors.inkFaint,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  summaryText: {
    color: Colors.ink,
    fontSize: 14,
    lineHeight: 21,
  },

  // Next action
  nextActionCard: {
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: '#BEE3E6',
    borderRadius: Radius.md,
    padding: 14,
    marginBottom: 16,
  },
  nextActionEyebrow: {
    color: Colors.accentText,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  nextActionText: {
    color: Colors.accentText,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },

  // Actions
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Radius.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  actionBtnPrimary: { backgroundColor: Colors.accent },
  actionBtnOutline: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  actionBtnTextPrimary: { color: Colors.surface, fontSize: 13, fontWeight: '700' },
  actionBtnTextOutline: { color: Colors.ink, fontSize: 13, fontWeight: '600' },

  // Call details
  detailCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 16,
    marginBottom: 20,
  },
  cardEyebrow: {
    color: Colors.inkFaint,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  detailItem: { minWidth: 100 },
  detailLabel: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailValue: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.neutralLight,
    borderRadius: Radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillCompleted: { backgroundColor: Colors.positiveLight },
  statusPillFailed: { backgroundColor: Colors.attentionLight },
  statusPillText: {
    color: Colors.neutral,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  statusPillTextCompleted: { color: Colors.positive },
  statusPillTextFailed: { color: Colors.attention },

  // Section
  section: { marginBottom: 20 },
  sectionTitle: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },

  // List card
  listCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },

  // Follow-ups
  followUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  followUpBody: { flex: 1 },
  followUpTitle: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  followUpDesc: {
    color: Colors.inkMuted,
    fontSize: 11,
    marginTop: 2,
  },
  followUpDue: {
    color: Colors.accent,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  followUpCompleteBtn: {
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  followUpCompleteBtnText: {
    color: Colors.accentText,
    fontSize: 11,
    fontWeight: '800',
  },
  followUpDonePill: {
    backgroundColor: Colors.positiveLight,
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  followUpDoneText: {
    color: Colors.positive,
    fontSize: 10,
    fontWeight: '700',
  },

  // Transcript
  transcriptCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
  },
  transcriptText: {
    color: Colors.inkMuted,
    fontSize: 12,
    lineHeight: 19,
  },
});
