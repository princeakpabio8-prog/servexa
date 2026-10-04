// @ts-nocheck
/**
 * AI Employee Detail Screen
 * Shows an AI employee (campaign) as a human-feeling business worker.
 * Displays status, calls handled, recent calls, activity, and quick actions.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import AppShell from '../../components/app-shell';
import { Colors, Radius, Shadow } from '../../constants/theme';
import { ensureSession, supabase } from '../../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: string;
  name: string;
  role: string;
  description: string | null;
  status: 'active' | 'paused' | 'draft' | 'completed';
  createdAt: string;
};

type EmployeeStats = {
  totalCalls: number;
  callsToday: number;
  completedCalls: number;
  failedCalls: number;
  pendingFollowUps: number;
};

type RecentCall = {
  id: string;
  customerName: string;
  outcome: string | null;
  durationSeconds: number | null;
  status: string;
  createdAt: string;
};

type RecentActivity = {
  id: string;
  title: string;
  description: string | null;
  type: 'resolved' | 'attention' | 'follow' | 'general';
  createdAt: string;
  customerName: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatRelativeTime = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
};

const campaignStatusToEmployee = (status: string): Employee['status'] => {
  if (status === 'active') return 'active';
  if (status === 'paused') return 'paused';
  if (status === 'completed') return 'completed';
  return 'draft';
};

const statusLabel = (status: Employee['status']) => {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Paused';
  if (status === 'completed') return 'Completed';
  return 'Draft';
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBox({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'neutral' | 'alert' }) {
  const bg =
    tone === 'good' ? Colors.positiveLight
    : tone === 'alert' ? Colors.attentionLight
    : Colors.ivoryDeep;
  const valueColor =
    tone === 'good' ? Colors.positive
    : tone === 'alert' ? Colors.attention
    : Colors.ink;

  return (
    <View style={[styles.statBox, { backgroundColor: bg }]}>
      <Text style={[styles.statBoxValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
  );
}

function CallItem({ call, onPress }: { call: RecentCall; onPress: () => void }) {
  const isCompleted = call.status === 'completed';
  const isFailed = call.status === 'failed';
  const dotColor = isFailed ? Colors.attention : isCompleted ? Colors.positive : Colors.neutral;

  return (
    <Pressable
      style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Call: ${call.customerName}`}
    >
      <View style={[styles.listDot, { backgroundColor: dotColor }]} />
      <View style={styles.listBody}>
        <Text style={styles.listName}>{call.customerName}</Text>
        <Text style={styles.listMeta} numberOfLines={1}>
          {call.outcome ? call.outcome.replace(/_/g, ' ') : call.status}
          {call.durationSeconds ? ` · ${formatDuration(call.durationSeconds)}` : ''}
        </Text>
      </View>
      <Text style={styles.listTime}>{formatRelativeTime(call.createdAt)}</Text>
    </Pressable>
  );
}

function ActivityItem({ item }: { item: RecentActivity }) {
  const icon =
    item.type === 'resolved' ? '✓'
    : item.type === 'attention' ? '!'
    : '↗';
  const iconBg =
    item.type === 'resolved' ? Colors.positiveLight
    : item.type === 'attention' ? Colors.attentionLight
    : Colors.neutralLight;
  const iconColor =
    item.type === 'resolved' ? Colors.positive
    : item.type === 'attention' ? Colors.attention
    : Colors.neutral;

  return (
    <View style={styles.listRow}>
      <View style={[styles.activityIcon, { backgroundColor: iconBg }]}>
        <Text style={[styles.activityIconText, { color: iconColor }]}>{icon}</Text>
      </View>
      <View style={styles.listBody}>
        <Text style={styles.listName}>{item.customerName}</Text>
        <Text style={styles.listMeta} numberOfLines={1}>{item.title}</Text>
      </View>
      <Text style={styles.listTime}>{formatRelativeTime(item.createdAt)}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function EmployeeDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [stats, setStats] = useState<EmployeeStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  const loadEmployee = async () => {
    if (!id) { setLoading(false); return; }
    try {
      await ensureSession();

      // Load campaign
      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .select('id, name, description, objective, status, created_at')
        .eq('id', id)
        .single();
      if (campErr) throw campErr;

      setEmployee({
        id: campaign.id,
        name: campaign.name,
        role: campaign.objective || campaign.description || 'AI Call Assistant',
        description: campaign.description,
        status: campaignStatusToEmployee(campaign.status),
        createdAt: campaign.created_at,
      });

      // Load calls for this campaign
      const { data: calls } = await supabase
        .from('calls')
        .select('id, status, created_at, customer_id, duration_seconds, campaign_id')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      // Today's calls
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCalls = (calls ?? []).filter((c) => new Date(c.created_at) >= today);

      // Follow-ups pending
      const { data: followUps } = await supabase
        .from('follow_ups')
        .select('id')
        .eq('status', 'pending');

      setStats({
        totalCalls: (calls ?? []).length,
        callsToday: todayCalls.length,
        completedCalls: (calls ?? []).filter((c) => c.status === 'completed').length,
        failedCalls: (calls ?? []).filter((c) => c.status === 'failed').length,
        pendingFollowUps: (followUps ?? []).length,
      });

      // Customer names for recent calls
      const recentCallsSlice = (calls ?? []).slice(0, 8);
      const customerIds = Array.from(new Set(recentCallsSlice.map((c) => c.customer_id).filter(Boolean)));
      const { data: customers } = customerIds.length
        ? await supabase.from('customers').select('id, name').in('id', customerIds)
        : { data: [] };
      const nameMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

      // Call outcomes
      const callIds = recentCallsSlice.map((c) => c.id);
      const { data: outcomes } = callIds.length
        ? await supabase.from('call_outcomes').select('call_id, outcome').in('call_id', callIds)
        : { data: [] };
      const outcomeMap = new Map((outcomes ?? []).map((o) => [o.call_id, o.outcome]));

      setRecentCalls(recentCallsSlice.map((c) => ({
        id: c.id,
        customerName: nameMap.get(c.customer_id) ?? 'Unknown',
        outcome: outcomeMap.get(c.id) ?? null,
        durationSeconds: c.duration_seconds,
        status: c.status,
        createdAt: c.created_at,
      })));

      // Activities linked to calls in this campaign
      const campaignCallIds = (calls ?? []).map((c) => c.id);
      const { data: activities } = campaignCallIds.length
        ? await supabase
            .from('activities')
            .select('id, customer_id, call_id, title, description, metadata, created_at')
            .in('call_id', campaignCallIds)
            .order('created_at', { ascending: false })
            .limit(8)
        : { data: [] };

      const activityCustomerIds = Array.from(
        new Set((activities ?? []).map((a) => a.customer_id).filter(Boolean))
      );
      const { data: actCustomers } = activityCustomerIds.length
        ? await supabase.from('customers').select('id, name').in('id', activityCustomerIds)
        : { data: [] };
      const actNameMap = new Map((actCustomers ?? []).map((c) => [c.id, c.name]));

      setRecentActivity((activities ?? []).map((a) => ({
        id: a.id,
        title: a.title,
        description: a.description,
        type: a.metadata?.escalation_required ? 'attention'
          : a.metadata?.outcome === 'resolved' ? 'resolved'
          : a.metadata?.follow_up_required ? 'follow'
          : 'general',
        createdAt: a.created_at,
        customerName: actNameMap.get(a.customer_id) ?? 'Customer',
      })));
    } catch (err) {
      console.error('[EmployeeDetail] load error:', err);
      Alert.alert('Error', 'Could not load employee details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployee();
  }, [id]);

  const handleToggleStatus = async () => {
    if (!employee || toggling) return;
    const newStatus = employee.status === 'active' ? 'paused' : 'active';
    const label = newStatus === 'active' ? 'resume' : 'pause';

    Alert.alert(
      `${label.charAt(0).toUpperCase()}${label.slice(1)} employee?`,
      `This will ${label} ${employee.name}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `${label.charAt(0).toUpperCase()}${label.slice(1)}`,
          style: newStatus === 'active' ? 'default' : 'destructive',
          onPress: async () => {
            setToggling(true);
            const { error } = await supabase
              .from('campaigns')
              .update({ status: newStatus })
              .eq('id', employee.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setEmployee((prev) => prev ? { ...prev, status: newStatus } : prev);
            }
            setToggling(false);
          },
        },
      ]
    );
  };

  const handleTest = () => {
    router.push({ pathname: '/call-instruction', params: { employeeId: id } } as any);
  };

  const handleViewCalls = () => {
    router.push('/customers' as any);
  };

  if (loading) {
    return (
      <AppShell scrollable={false}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </AppShell>
    );
  }

  if (!employee) {
    return (
      <AppShell>
        <View style={styles.missing}>
          <Text style={styles.missingTitle}>Employee not found</Text>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go back</Text>
          </Pressable>
        </View>
      </AppShell>
    );
  }

  const isActive = employee.status === 'active';
  const isPaused = employee.status === 'paused';

  return (
    <AppShell scrollable={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Overview</Text>
          </Pressable>
        </View>

        {/* ── EMPLOYEE IDENTITY ──────────────────────────────── */}
        <View style={styles.identityRow}>
          <View style={[styles.avatarWrap, isActive && styles.avatarWrapActive]}>
            <Text style={styles.avatarText}>{employee.name.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={styles.identityInfo}>
            <Text style={styles.employeeName}>{employee.name}</Text>
            <Text style={styles.employeeRole}>{employee.role}</Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, isActive ? styles.statusDotActive : styles.statusDotPaused]} />
              <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextPaused]}>
                {statusLabel(employee.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── QUICK ACTIONS ──────────────────────────────────── */}
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              isActive ? styles.actionBtnDestructive : styles.actionBtnPrimary,
              pressed && { opacity: 0.8 },
              toggling && { opacity: 0.5 },
            ]}
            onPress={handleToggleStatus}
            disabled={toggling}
            accessibilityLabel={isActive ? 'Pause employee' : 'Resume employee'}
          >
            <Text style={[
              styles.actionBtnText,
              isActive ? styles.actionBtnTextDestructive : styles.actionBtnTextPrimary,
            ]}>
              {toggling ? '…' : isActive ? '⏸ Pause' : '▶ Resume'}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.8 }]}
            onPress={handleTest}
            accessibilityLabel="Test employee"
          >
            <Text style={styles.actionBtnTextOutline}>⚡ Test</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.8 }]}
            onPress={handleViewCalls}
            accessibilityLabel="View all calls"
          >
            <Text style={styles.actionBtnTextOutline}>Calls</Text>
          </Pressable>
        </View>

        {/* ── STATS ──────────────────────────────────────────── */}
        {stats && (
          <View style={styles.statsRow}>
            <StatBox label="Total calls" value={String(stats.totalCalls)} />
            <StatBox label="Today" value={String(stats.callsToday)} tone={stats.callsToday > 0 ? 'good' : 'neutral'} />
            <StatBox label="Completed" value={String(stats.completedCalls)} tone={stats.completedCalls > 0 ? 'good' : 'neutral'} />
            <StatBox label="Failed" value={String(stats.failedCalls)} tone={stats.failedCalls > 0 ? 'alert' : 'neutral'} />
          </View>
        )}

        {/* ── RECENT CALLS ───────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent Calls</Text>
            <Pressable onPress={() => router.push('/activity' as any)}>
              <Text style={styles.sectionLink}>See all →</Text>
            </Pressable>
          </View>
          {recentCalls.length === 0 ? (
            <Text style={styles.emptyText}>No calls handled yet.</Text>
          ) : (
            <View style={styles.listCard}>
              {recentCalls.map((call, idx) => (
                <CallItem
                  key={call.id}
                  call={call}
                  onPress={() =>
                    router.push({ pathname: '/call-detail', params: { callId: call.id } } as any)
                  }
                />
              ))}
            </View>
          )}
        </View>

        {/* ── RECENT ACTIVITY ────────────────────────────────── */}
        {recentActivity.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <View style={styles.listCard}>
              {recentActivity.map((item) => (
                <ActivityItem key={item.id} item={item} />
              ))}
            </View>
          </View>
        )}

        {/* ── INSTRUCTIONS ───────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Configuration</Text>
          <View style={styles.configCard}>
            {employee.description ? (
              <Text style={styles.configText}>{employee.description}</Text>
            ) : (
              <Text style={styles.configEmpty}>No description provided.</Text>
            )}
            <Pressable
              style={styles.configEditBtn}
              onPress={() => router.push('/campaigns' as any)}
              accessibilityLabel="Edit instructions"
            >
              <Text style={styles.configEditText}>Edit instructions →</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </AppShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loaderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  missingTitle: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  backBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  backBtnText: {
    color: Colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },

  content: {
    // AppShell's mainContent already provides horizontal padding and
    // the mobile bottom-nav inset — keep vertical padding only here.
    paddingBottom: 32,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backArrow: {
    color: Colors.accent,
    fontSize: 26,
    lineHeight: 26,
  },
  backText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },

  // Identity
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 20,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutralLight,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.subtle,
  },
  avatarWrapActive: {
    backgroundColor: Colors.accentLight,
  },
  avatarText: {
    color: Colors.accent,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  identityInfo: { flex: 1 },
  employeeName: {
    color: Colors.ink,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 26,
  },
  employeeRole: {
    color: Colors.inkMuted,
    fontSize: 13,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusDotActive: { backgroundColor: Colors.positive },
  statusDotPaused: { backgroundColor: Colors.neutral },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextActive: { color: Colors.positive },
  statusTextPaused: { color: Colors.neutral },

  // Quick actions
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
    justifyContent: 'center',
    minHeight: 44,
  },
  actionBtnPrimary: { backgroundColor: Colors.accent },
  actionBtnDestructive: { backgroundColor: Colors.attentionLight, borderWidth: 1, borderColor: '#F0CEC7' },
  actionBtnOutline: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
  actionBtnTextPrimary: { color: Colors.surface },
  actionBtnTextDestructive: { color: Colors.attention },
  actionBtnTextOutline: { color: Colors.ink, fontSize: 13, fontWeight: '600' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  statBox: {
    flex: 1,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
  },
  statBoxValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.ink,
  },
  statBoxLabel: {
    color: Colors.inkMuted,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },

  // Section
  section: { marginBottom: 24 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
  },
  sectionLink: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    color: Colors.inkFaint,
    fontSize: 12,
    paddingVertical: 12,
  },

  // List card
  listCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  listBody: { flex: 1 },
  listName: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  listMeta: {
    color: Colors.inkFaint,
    fontSize: 11,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  listTime: {
    color: Colors.inkFaint,
    fontSize: 10,
  },

  // Activity icon
  activityIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityIconText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Config
  configCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 16,
  },
  configText: {
    color: Colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  configEmpty: {
    color: Colors.inkFaint,
    fontSize: 12,
  },
  configEditBtn: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  configEditText: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});
