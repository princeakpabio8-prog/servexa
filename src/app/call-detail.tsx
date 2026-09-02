import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { ensureSession, supabase } from '../lib/supabase';

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

const label = (value: string | null | undefined) =>
  (value ?? 'Unknown').replace(/_/g, ' ');

export default function CallDetailScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const { callId } = useLocalSearchParams<{ callId?: string }>();
  const [call, setCall] = useState<CallRecord | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [customerName, setCustomerName] = useState('Customer');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadReport();
  }, [callId]);

  const loadReport = async () => {
    if (!callId) {
      setLoading(false);
      return;
    }

    try {
      await ensureSession();
      const { data: callData, error: callError } = await supabase
        .from('calls')
        .select('id, status, transcript, recording_url, duration_seconds, started_at, ended_at, created_at, customer_id')
        .eq('id', callId)
        .single();
      if (callError) throw callError;

      const [{ data: outcomeData }, { data: followUpData }, { data: customer }] = await Promise.all([
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
        supabase.from('customers').select('name').eq('id', callData.customer_id).single(),
      ]);

      setCall(callData);
      setOutcome(outcomeData);
      setFollowUps(followUpData ?? []);
      setCustomerName(customer?.name ?? 'Customer');
    } catch (error) {
      console.error('Failed to load call report:', error);
      Alert.alert('Report unavailable', 'We could not load this call report yet. Try refreshing shortly.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const refreshReport = async () => {
    setRefreshing(true);
    await loadReport();
  };

  const completeFollowUp = async (followUpId: string) => {
    const { error } = await supabase
      .from('follow_ups')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', followUpId);
    if (error) {
      Alert.alert('Update failed', error.message);
      return;
    }
    setFollowUps((items) => items.map((item) => item.id === followUpId ? { ...item, status: 'completed' } : item));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={styles.loader} size="large" color="#147983" />
      </SafeAreaView>
    );
  }

  if (!call) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={styles.title}>Call report unavailable</Text>
          <Pressable style={styles.primaryButton} onPress={() => router.back()}>
            <Text style={styles.primaryButtonText}>Back to activity</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={[styles.content, isWide && styles.contentWide]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Activity</Text>
          </Pressable>
          <Pressable onPress={refreshReport} disabled={refreshing} style={styles.refreshButton}>
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : '↻ Refresh report'}</Text>
          </Pressable>
        </View>

        <Text style={styles.eyebrow}>CALL REPORT</Text>
        <Text style={styles.title}>{customerName}</Text>
        <Text style={styles.subtitle}>Full record of what SERVEXA handled and what needs to happen next.</Text>

        <View style={styles.statusRow}>
          <View style={[styles.statusPill, call.status === 'completed' ? styles.statusCompleted : styles.statusPending]}>
            <Text style={styles.statusText}>{label(call.status)}</Text>
          </View>
          <Text style={styles.dateText}>{new Date(call.created_at).toLocaleString()}</Text>
        </View>

        <View style={styles.grid}>
          <View style={styles.mainColumn}>
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>OUTCOME</Text>
              <Text style={styles.outcomeTitle}>{label(outcome?.outcome)}</Text>
              <Text style={styles.cardLabel}>Summary</Text>
              <Text style={styles.bodyText}>{outcome?.summary ?? 'No outcome summary has been recorded yet.'}</Text>
              <View style={styles.detailRow}>
                <View style={styles.detailItem}>
                  <Text style={styles.cardLabel}>Sentiment</Text>
                  <Text style={styles.detailValue}>{label(outcome?.sentiment)}</Text>
                </View>
                <View style={styles.detailItem}>
                  <Text style={styles.cardLabel}>Next action</Text>
                  <Text style={styles.detailValue}>{outcome?.action_required ?? 'No next action recorded'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>CONVERSATION TRANSCRIPT</Text>
              {call.transcript ? (
                <Text style={styles.transcript}>{call.transcript}</Text>
              ) : (
                <Text style={styles.bodyText}>No transcript was returned for this call.</Text>
              )}
            </View>
          </View>

          <View style={styles.sideColumn}>
            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>CALL DETAILS</Text>
              <Text style={styles.cardLabel}>Duration</Text>
              <Text style={styles.detailValue}>{call.duration_seconds ? `${call.duration_seconds} seconds` : 'Not available'}</Text>
              <Text style={styles.cardLabel}>Started</Text>
              <Text style={styles.detailValue}>{call.started_at ? new Date(call.started_at).toLocaleString() : 'Not available'}</Text>
              <Text style={styles.cardLabel}>Ended</Text>
              <Text style={styles.detailValue}>{call.ended_at ? new Date(call.ended_at).toLocaleString() : 'Not available'}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardEyebrow}>FOLLOW-UP</Text>
              {followUps.length === 0 ? (
                <Text style={styles.bodyText}>No follow-up task was created.</Text>
              ) : followUps.map((followUp) => (
                <View key={followUp.id} style={styles.followUp}>
                  <Text style={styles.followUpTitle}>{followUp.title}</Text>
                  <Text style={styles.bodyText}>{followUp.description ?? 'No additional details.'}</Text>
                  <Text style={styles.followUpDue}>{followUp.due_at ? `Due ${new Date(followUp.due_at).toLocaleString()}` : 'No due date'}</Text>
                  {followUp.status !== 'completed' && (
                    <Pressable style={styles.completeButton} onPress={() => completeFollowUp(followUp.id)}>
                      <Text style={styles.completeText}>Mark complete</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F8' },
  loader: { flex: 1 },
  content: { padding: 20, paddingBottom: 60 },
  contentWide: { maxWidth: 1180, width: '100%', alignSelf: 'center', padding: 34 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backArrow: { color: '#147983', fontSize: 28, lineHeight: 28 },
  backText: { color: '#147983', fontSize: 13, fontWeight: '800' },
  refreshButton: { borderWidth: 1, borderColor: '#D6E3E5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  refreshText: { color: '#147983', fontSize: 10, fontWeight: '800' },
  eyebrow: { color: '#89959E', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#172832', fontSize: 30, fontWeight: '900', marginTop: 6 },
  subtitle: { color: '#77828C', fontSize: 12, lineHeight: 18, marginTop: 6, maxWidth: 680 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, marginBottom: 22 },
  statusPill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  statusCompleted: { backgroundColor: '#E7F5EE' },
  statusPending: { backgroundColor: '#FFF3D9' },
  statusText: { color: '#317A5A', fontSize: 10, fontWeight: '800', textTransform: 'capitalize' },
  dateText: { color: '#89959E', fontSize: 10 },
  grid: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  mainColumn: { flex: 1, minWidth: 280, gap: 16 },
  sideColumn: { width: 320, minWidth: 280, gap: 16 },
  card: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8EA', borderRadius: 14, padding: 18 },
  cardEyebrow: { color: '#89959E', fontSize: 8, fontWeight: '900', letterSpacing: 1.1, marginBottom: 10 },
  outcomeTitle: { color: '#147983', fontSize: 20, fontWeight: '900', textTransform: 'capitalize', marginBottom: 16 },
  cardLabel: { color: '#8C969F', fontSize: 9, fontWeight: '800', marginTop: 10 },
  bodyText: { color: '#53616A', fontSize: 11, lineHeight: 17, marginTop: 4 },
  detailRow: { flexDirection: 'row', gap: 22, borderTopWidth: 1, borderTopColor: '#EEF1F2', marginTop: 16, paddingTop: 4 },
  detailItem: { flex: 1 },
  detailValue: { color: '#26343D', fontSize: 11, fontWeight: '800', marginTop: 4, textTransform: 'capitalize' },
  transcript: { color: '#26343D', fontSize: 11, lineHeight: 19, backgroundColor: '#F7F9F9', borderRadius: 9, padding: 12 },
  followUp: { borderTopWidth: 1, borderTopColor: '#EEF1F2', paddingTop: 10, marginTop: 4 },
  followUpTitle: { color: '#26343D', fontSize: 11, fontWeight: '900' },
  followUpDue: { color: '#147983', fontSize: 9, fontWeight: '800', marginTop: 8 },
  completeButton: { alignSelf: 'flex-start', marginTop: 10, backgroundColor: '#EAF3F4', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  completeText: { color: '#147983', fontSize: 9, fontWeight: '900' },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  primaryButton: { backgroundColor: '#147983', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, marginTop: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});
