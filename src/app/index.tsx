// @ts-nocheck
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import AppShell from '../components/app-shell';
import { Colors, Radius, Shadow } from '../constants/theme';
import { ensureSession, supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';

// ─── Types ────────────────────────────────────────────────────────────────────

type AIEmployee = {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'paused' | 'draft';
  callsToday: number;
  totalCalls: number;
};

type AttentionItem = {
  id: string;
  type: 'follow_up' | 'failed_call' | 'escalation';
  customerName: string;
  reason: string;
  callId?: string;
  customerId?: string;
};

type RecentCall = {
  id: string;
  customerName: string;
  outcome: string;
  durationSeconds: number | null;
  time: string;
  type: 'resolved' | 'attention' | 'follow' | 'failed';
};

type KPI = { label: string; value: string; tone: 'good' | 'neutral' | 'alert' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatRelativeTime = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const statusText = (status: string) => {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Paused';
  return 'Draft';
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function EmployeeCard({ emp, onPress }: { emp: AIEmployee; onPress: () => void }) {
  const isActive = emp.status === 'active';
  return (
    <Pressable
      style={({ pressed }) => [styles.employeeCard, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${emp.name} — ${emp.role}`}
    >
      {/* Avatar */}
      <View style={[styles.employeeAvatar, isActive && styles.employeeAvatarActive]}>
        <Text style={styles.employeeAvatarText}>{emp.name.slice(0, 2).toUpperCase()}</Text>
      </View>

      {/* Details */}
      <View style={styles.employeeInfo}>
        <Text style={styles.employeeName}>{emp.name}</Text>
        <Text style={styles.employeeRole}>{emp.role}</Text>
        <View style={styles.employeeStatusRow}>
          <View style={[styles.statusDot, isActive ? styles.statusDotActive : styles.statusDotPaused]} />
          <Text style={[styles.statusLabel, isActive ? styles.statusLabelActive : styles.statusLabelPaused]}>
            {statusText(emp.status)}
          </Text>
          {emp.callsToday > 0 && (
            <Text style={styles.employeeCallsToday}> · {emp.callsToday} calls today</Text>
          )}
        </View>
      </View>

      {/* Chevron */}
      <Text style={styles.cardChevron}>›</Text>
    </Pressable>
  );
}

function AttentionCard({ item, onPress }: { item: AttentionItem; onPress: () => void }) {
  const iconMap = {
    escalation: '!',
    failed_call: '✕',
    follow_up: '↗',
  };
  const icon = iconMap[item.type] ?? '!';
  return (
    <Pressable
      style={({ pressed }) => [styles.attentionCard, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Attention: ${item.customerName}`}
    >
      <View style={styles.attentionIcon}>
        <Text style={styles.attentionIconText}>{icon}</Text>
      </View>
      <View style={styles.attentionBody}>
        <Text style={styles.attentionName}>{item.customerName}</Text>
        <Text style={styles.attentionReason} numberOfLines={1}>{item.reason}</Text>
      </View>
      <Pressable
        style={styles.attentionAction}
        onPress={onPress}
        accessibilityLabel="Review"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.attentionActionText}>Review ›</Text>
      </Pressable>
    </Pressable>
  );
}

function CallRow({ call, onPress }: { call: RecentCall; onPress: () => void }) {
  const dotStyle =
    call.type === 'resolved' ? styles.callDotResolved
    : call.type === 'attention' || call.type === 'failed' ? styles.callDotAttention
    : styles.callDotNeutral;

  return (
    <Pressable
      style={({ pressed }) => [styles.callRow, pressed && styles.cardPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Call: ${call.customerName}`}
    >
      <View style={[styles.callDot, dotStyle]} />
      <View style={styles.callBody}>
        <Text style={styles.callName}>{call.customerName}</Text>
        <Text style={styles.callMeta} numberOfLines={1}>
          {call.outcome}{call.durationSeconds ? ` · ${formatDuration(call.durationSeconds)}` : ''}
        </Text>
      </View>
      <Text style={styles.callTime}>{call.time}</Text>
    </Pressable>
  );
}

function KPIChip({ kpi }: { kpi: KPI }) {
  const bg =
    kpi.tone === 'good' ? Colors.positiveLight
    : kpi.tone === 'alert' ? Colors.attentionLight
    : Colors.neutralLight;
  const color =
    kpi.tone === 'good' ? Colors.positive
    : kpi.tone === 'alert' ? Colors.attention
    : Colors.neutral;
  return (
    <View style={[styles.kpiChip, { backgroundColor: bg }]}>
      <Text style={[styles.kpiValue, { color }]}>{kpi.value}</Text>
      <Text style={styles.kpiLabel}>{kpi.label}</Text>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { profile } = useWorkspace();

  const [employees, setEmployees] = useState<AIEmployee[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [kpis, setKpis] = useState<KPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const loadDashboard = async (signal?: { cancelled: boolean }) => {
    try {
      await ensureSession();
      if (signal?.cancelled) return;

      // ── Fetch everything in parallel ──────────────────────────
      const [
        { data: campaigns },
        { data: allCalls },
        { data: followUps },
        { data: activities },
      ] = await Promise.all([
        supabase
          .from('campaigns')
          .select('id, name, description, objective, status')
          .order('created_at', { ascending: false }),
        supabase
          .from('calls')
          .select('id, status, created_at, customer_id, duration_seconds')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('follow_ups')
          .select('id, customer_id, call_id, title, status')
          .eq('status', 'pending')
          .limit(10),
        supabase
          .from('activities')
          .select('id, customer_id, call_id, title, description, metadata, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      // ── Customer names batch ──────────────────────────────────
      const customerIds = Array.from(new Set([
        ...(allCalls ?? []).map((c) => c.customer_id),
        ...(activities ?? []).map((a) => a.customer_id),
        ...(followUps ?? []).map((f) => f.customer_id),
      ].filter(Boolean)));

      const { data: customers } = customerIds.length
        ? await supabase.from('customers').select('id, name').in('id', customerIds)
        : { data: [] };
      const nameMap = new Map((customers ?? []).map((c) => [c.id, c.name]));

      // ── Call outcomes for recent calls ────────────────────────
      const recentCallIds = (allCalls ?? []).slice(0, 10).map((c) => c.id);
      const { data: outcomes } = recentCallIds.length
        ? await supabase
            .from('call_outcomes')
            .select('call_id, outcome, summary')
            .in('call_id', recentCallIds)
        : { data: [] };
      const outcomeMap = new Map((outcomes ?? []).map((o) => [o.call_id, o]));

      // ── AI Employees (campaigns as employees) ─────────────────
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCalls = (allCalls ?? []).filter((c) => new Date(c.created_at) >= today);

      const employeeList: AIEmployee[] = (campaigns ?? []).map((campaign) => {
        const callsToday = todayCalls.filter((c) => c.campaign_id === campaign.id).length;
        const totalCalls = (allCalls ?? []).filter((c) => c.campaign_id === campaign.id).length;

        let empStatus: AIEmployee['status'] = 'draft';
        if (campaign.status === 'active') empStatus = 'active';
        else if (campaign.status === 'paused') empStatus = 'paused';

        const role = campaign.objective || campaign.description || 'AI Call Assistant';

        return {
          id: campaign.id,
          name: campaign.name || 'Unnamed Agent',
          role,
          status: empStatus,
          callsToday,
          totalCalls,
        };
      });

      // ── Needs Attention ───────────────────────────────────────
      const escalations = (activities ?? [])
        .filter((a) => a.metadata?.escalation_required)
        .slice(0, 3)
        .map((a): AttentionItem => ({
          id: a.id,
          type: 'escalation',
          customerName: nameMap.get(a.customer_id) ?? 'Unknown customer',
          reason: a.metadata?.escalation_reason ?? a.description ?? 'Needs your review',
          callId: a.call_id,
          customerId: a.customer_id,
        }));

      const failedCalls = (allCalls ?? [])
        .filter((c) => c.status === 'failed')
        .slice(0, 2)
        .map((c): AttentionItem => ({
          id: c.id,
          type: 'failed_call',
          customerName: nameMap.get(c.customer_id) ?? 'Unknown customer',
          reason: 'Call did not connect',
          callId: c.id,
          customerId: c.customer_id,
        }));

      const pendingFollowUps = (followUps ?? [])
        .slice(0, 2)
        .map((f): AttentionItem => ({
          id: f.id,
          type: 'follow_up',
          customerName: nameMap.get(f.customer_id) ?? 'Unknown customer',
          reason: f.title,
          callId: f.call_id ?? undefined,
          customerId: f.customer_id,
        }));

      // Prioritize: escalations → failed → follow-ups, cap at 5
      const attentionItems = [...escalations, ...failedCalls, ...pendingFollowUps].slice(0, 5);

      // ── Recent calls ──────────────────────────────────────────
      const recent: RecentCall[] = (allCalls ?? []).slice(0, 8).map((c) => {
        const outcome = outcomeMap.get(c.id);
        const outcomeLabel = outcome?.outcome
          ? outcome.outcome.replace(/_/g, ' ')
          : c.status === 'failed' ? 'Failed' : c.status === 'completed' ? 'Completed' : c.status;

        let type: RecentCall['type'] = 'follow';
        if (c.status === 'failed') type = 'failed';
        else if (outcome?.outcome === 'resolved' || outcome?.outcome === 'completed') type = 'resolved';
        else if (outcome?.outcome === 'escalation_needed') type = 'attention';

        return {
          id: c.id,
          customerName: nameMap.get(c.customer_id) ?? 'Unknown customer',
          outcome: outcomeLabel,
          durationSeconds: c.duration_seconds,
          time: formatRelativeTime(c.created_at),
          type,
        };
      });

      // ── KPIs ──────────────────────────────────────────────────
      const completedToday = todayCalls.filter((c) => c.status === 'completed').length;
      const failedToday = todayCalls.filter((c) => c.status === 'failed').length;
      setKpis([
        {
          label: 'Calls today',
          value: String(todayCalls.length),
          tone: todayCalls.length > 0 ? 'good' : 'neutral',
        },
        {
          label: 'Completed',
          value: String(completedToday),
          tone: completedToday > 0 ? 'good' : 'neutral',
        },
        {
          label: 'Follow-ups',
          value: String(followUps?.length ?? 0),
          tone: (followUps?.length ?? 0) > 0 ? 'neutral' : 'good',
        },
        {
          label: 'Need action',
          value: String(attentionItems.length),
          tone: attentionItems.length > 0 ? 'alert' : 'good',
        },
      ]);

      if (signal?.cancelled) return;
      setLoadError(false);
      setEmployees(employeeList);
      setAttention(attentionItems);
      setRecentCalls(recent);
    } catch (err) {
      if (signal?.cancelled) return;
      console.error('[Dashboard] load error:', err);
      setLoadError(true);
    } finally {
      if (!signal?.cancelled) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  // ── Stable ref so the subscription callback can call the latest version ──
  const loadDashboardRef = useRef(loadDashboard);
  useEffect(() => { loadDashboardRef.current = loadDashboard; });

  useEffect(() => {
    const signal = { cancelled: false };
    loadDashboard(signal);

    // ── Realtime: re-fetch dashboard when calls or activities change ──────
    // Two lightweight subscriptions scoped to INSERT/UPDATE only.
    // We debounce to avoid thrashing when a webhook fires multiple rows.
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => loadDashboardRef.current(), 1200);
    };

    const callsSub = supabase
      .channel('dashboard-calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, scheduleReload)
      .subscribe();

    const activitiesSub = supabase
      .channel('dashboard-activities')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities' }, scheduleReload)
      .subscribe();

    return () => {
      signal.cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(callsSub);
      supabase.removeChannel(activitiesSub);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboard();
  };

  // Greeting
  const firstName = profile.full_name?.split(' ')[0]?.trim() || '';
  const workspaceName = profile.company_name || 'My Workspace';
  const h = new Date().getHours();
  const salutation = firstName ? `${firstName}` : workspaceName;
  const greeting =
    h < 12 ? `Good morning, ${salutation}.`
    : h < 17 ? `Good afternoon, ${salutation}.`
    : `Good evening, ${salutation}.`;

  const activeEmployeeCount = employees.filter((e) => e.status === 'active').length;
  // New workspace: no employees AND no calls yet
  const isNewWorkspace = !loading && !loadError && employees.length === 0 && recentCalls.length === 0;

  // Loading guard — prevents blank white screen on navigation
  if (loading && !refreshing) {
    return (
      <AppShell scrollable={false}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </AppShell>
    );
  }

  // Error state — data failed to load
  if (loadError) {
    return (
      <AppShell scrollable={false}>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorTitle}>Could not load dashboard</Text>
          <Text style={styles.errorBody}>Check your connection and try again.</Text>
          <Pressable
            style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.8 }]}
            onPress={() => { setLoading(true); setLoadError(false); loadDashboard(); }}
            accessibilityRole="button"
            accessibilityLabel="Retry loading dashboard"
          >
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell scrollable={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        {/* ── 1. GREETING / WORKSPACE CONTEXT ─────────────────── */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingCopy}>
            <Text style={styles.eyebrow}>WORKFORCE OVERVIEW</Text>
            <Text style={[styles.greeting, isMobile && styles.greetingMobile]}>{greeting}</Text>
            {activeEmployeeCount > 0 ? (
              <Text style={styles.greetingSub}>
                {activeEmployeeCount} AI employee{activeEmployeeCount !== 1 ? 's' : ''} on duty.
              </Text>
            ) : (
              <Text style={styles.greetingSub}>
                {isNewWorkspace ? 'Your workspace is ready.' : 'No active employees.'}
              </Text>
            )}
          </View>
          {!isMobile && !isNewWorkspace && (
            <Pressable
              style={styles.activityBtn}
              onPress={() => router.push('/activity' as any)}
              accessibilityLabel="View live activity"
            >
              <View style={styles.liveDot} />
              <Text style={styles.activityBtnText}>Live activity</Text>
            </Pressable>
          )}
        </View>

        {/* ── NEW WORKSPACE ONBOARDING STATE ───────────────────── */}
        {isNewWorkspace && (
          <View style={styles.onboardingCard}>
            <View style={styles.onboardingTop}>
              <View style={styles.onboardingIcon}>
                <Text style={styles.onboardingIconText}>◉</Text>
              </View>
              <View style={styles.onboardingBadge}>
                <View style={styles.onboardingBadgeDot} />
                <Text style={styles.onboardingBadgeText}>WORKSPACE READY</Text>
              </View>
            </View>
            <Text style={styles.onboardingTitle}>
              Create your first AI employee
            </Text>
            <Text style={styles.onboardingBody}>
              AI employees handle your customer calls automatically — collecting information, following up, and surfacing what needs your attention.
            </Text>
            <View style={styles.onboardingActions}>
              <Pressable
                style={({ pressed }) => [styles.onboardingBtn, pressed && { opacity: 0.85 }]}
                onPress={() => router.push('/campaigns' as any)}
                accessibilityLabel="Create first AI employee"
              >
                <Text style={styles.onboardingBtnText}>Create AI employee →</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.onboardingBtnSecondary, pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/customers' as any)}
                accessibilityLabel="Add a customer first"
              >
                <Text style={styles.onboardingBtnSecondaryText}>Add a customer first</Text>
              </Pressable>
            </View>
            <View style={styles.onboardingSteps}>
              {[
                { n: '1', label: 'Create an AI employee' },
                { n: '2', label: 'Add your customers' },
                { n: '3', label: 'Let them work' },
              ].map((step) => (
                <View key={step.n} style={styles.onboardingStep}>
                  <View style={styles.onboardingStepNum}>
                    <Text style={styles.onboardingStepNumText}>{step.n}</Text>
                  </View>
                  <Text style={styles.onboardingStepLabel}>{step.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── 2. AI EMPLOYEES ──────────────────────────────────── */}
        {!isNewWorkspace && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>AI Employees</Text>
            <Pressable onPress={() => router.push('/campaigns' as any)}>
              <Text style={styles.sectionLink}>Manage →</Text>
            </Pressable>
          </View>

          {employees.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No AI employees yet</Text>
              <Text style={styles.emptyBody}>
                Create your first AI employee from the AI Employees tab.
              </Text>
              <Pressable
                style={styles.emptyAction}
                onPress={() => router.push('/campaigns' as any)}
              >
                <Text style={styles.emptyActionText}>Create AI employee →</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.employeeList}>
              {employees.map((emp) => (
                <EmployeeCard
                  key={emp.id}
                  emp={emp}
                  onPress={() => router.push({ pathname: '/employee/[id]', params: { id: emp.id } })}
                />
              ))}
            </View>
          )}
        </View>
        )}

        {/* ── 3. NEEDS YOUR ATTENTION ──────────────────────────── */}
        {!loading && attention.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Needs Your Attention</Text>
                <View style={styles.attentionBadge}>
                  <Text style={styles.attentionBadgeText}>{attention.length}</Text>
                </View>
              </View>
            </View>
            <View style={styles.attentionList}>
              {attention.map((item) => (
                <AttentionCard
                  key={item.id}
                  item={item}
                  onPress={() => {
                    if (item.callId) {
                      router.push({ pathname: '/call-detail', params: { callId: item.callId } } as any);
                    } else {
                      router.push('/customers' as any);
                    }
                  }}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── 4. RECENT CALL ACTIVITY ──────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View style={styles.sectionTitleRow}>
              <Text style={styles.sectionTitle}>Recent Calls</Text>
              <View style={styles.livePill}>
                <View style={styles.livePillDot} />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            </View>
            <Pressable onPress={() => router.push('/activity' as any)}>
              <Text style={styles.sectionLink}>See all →</Text>
            </Pressable>
          </View>

          {recentCalls.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No calls yet</Text>
              <Text style={styles.emptyBody}>
                When your AI employees make calls, they'll appear here in real time.
              </Text>
              <Pressable
                style={styles.emptyAction}
                onPress={() => router.push('/customers' as any)}
                accessibilityLabel="Go to Customers"
              >
                <Text style={styles.emptyActionText}>Start a call →</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.callList}>
              {recentCalls.map((call) => (
                <CallRow
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

        {/* ── 5. KPI STRIP ─────────────────────────────────────── */}
        {!loading && kpis.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Today's Performance</Text>
            <View style={[styles.kpiRow, isMobile && styles.kpiRowMobile]}>
              {kpis.map((kpi) => (
                <KPIChip key={kpi.label} kpi={kpi} />
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorTitle: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    color: Colors.inkMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 4,
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryBtnText: {
    color: Colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 24,
    paddingBottom: 60,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  contentMobile: {
    // Reset desktop centering constraints so content fills the viewport width
    maxWidth: undefined,
    alignSelf: 'stretch',
    padding: 16,
    paddingBottom: 100,
  },

  // Greeting
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 28,
    gap: 12,
  },
  greetingCopy: { flex: 1 },
  eyebrow: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  greeting: {
    color: Colors.ink,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
  },
  greetingMobile: {
    fontSize: 19,
  },
  greetingSub: {
    color: Colors.inkMuted,
    fontSize: 13,
    marginTop: 4,
  },
  activityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.positive,
  },
  activityBtnText: {
    color: Colors.inkMuted,
    fontSize: 12,
    fontWeight: '600',
  },

  // Section
  section: {
    marginBottom: 28,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  sectionLink: {
    color: Colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },

  // AI Employee cards
  employeeList: { gap: 8 },
  employeeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 14,
    gap: 12,
    ...Shadow.subtle,
  },
  cardPressed: { opacity: 0.75 },
  employeeAvatar: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    backgroundColor: Colors.neutralLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeAvatarActive: {
    backgroundColor: Colors.accentLight,
  },
  employeeAvatarText: {
    color: Colors.accent,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  employeeInfo: { flex: 1 },
  employeeName: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  employeeRole: {
    color: Colors.inkMuted,
    fontSize: 12,
    marginTop: 1,
  },
  employeeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusDotActive: { backgroundColor: Colors.positive },
  statusDotPaused: { backgroundColor: Colors.neutral },
  statusLabel: { fontSize: 10, fontWeight: '700' },
  statusLabelActive: { color: Colors.positive },
  statusLabelPaused: { color: Colors.neutral },
  employeeCallsToday: {
    color: Colors.inkFaint,
    fontSize: 10,
  },
  cardChevron: {
    color: Colors.inkFaint,
    fontSize: 20,
    lineHeight: 22,
  },

  // Attention
  attentionBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.attention,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  attentionBadgeText: {
    color: Colors.surface,
    fontSize: 10,
    fontWeight: '800',
  },
  attentionList: { gap: 8 },
  attentionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.attentionLight,
    borderWidth: 1,
    borderColor: '#F0CEC7',
    borderRadius: Radius.md,
    padding: 12,
    gap: 10,
  },
  attentionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.attention,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attentionIconText: {
    color: Colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  attentionBody: { flex: 1 },
  attentionName: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
  attentionReason: {
    color: Colors.inkMuted,
    fontSize: 11,
    marginTop: 1,
  },
  attentionAction: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.attention,
    borderRadius: Radius.sm,
  },
  attentionActionText: {
    color: Colors.surface,
    fontSize: 10,
    fontWeight: '800',
  },

  // Recent calls
  callList: { gap: 0 },
  callRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  callDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  callDotResolved: { backgroundColor: Colors.positive },
  callDotAttention: { backgroundColor: Colors.attention },
  callDotNeutral: { backgroundColor: Colors.neutral },
  callBody: { flex: 1 },
  callName: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  callMeta: {
    color: Colors.inkFaint,
    fontSize: 11,
    marginTop: 1,
    textTransform: 'capitalize',
  },
  callTime: {
    color: Colors.inkFaint,
    fontSize: 10,
    fontWeight: '500',
  },

  // KPI
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  kpiRowMobile: { gap: 6 },
  kpiChip: {
    flex: 1,
    minWidth: 70,
    borderRadius: Radius.md,
    padding: 12,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  kpiLabel: {
    color: Colors.inkMuted,
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    textAlign: 'center',
  },

  // Empty
  emptyCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptyBody: {
    color: Colors.inkMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.inkFaint,
    fontSize: 12,
  },
  emptyAction: {
    marginTop: 14,
    backgroundColor: Colors.accent,
    borderRadius: Radius.sm,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  emptyActionText: {
    color: Colors.surface,
    fontSize: 12,
    fontWeight: '700',
  },

  // Live pill
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.positiveLight,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  livePillDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.positive,
  },
  livePillText: {
    color: Colors.positive,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Onboarding empty state
  onboardingCard: {
    backgroundColor: Colors.brand,
    borderRadius: Radius.xl,
    padding: 24,
    marginBottom: 28,
  },
  onboardingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  onboardingIcon: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingIconText: {
    color: '#72C5CB',
    fontSize: 22,
  },
  onboardingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  onboardingBadgeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#67D6A0',
  },
  onboardingBadgeText: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  onboardingTitle: {
    color: Colors.surface,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 8,
  },
  onboardingBody: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  onboardingActions: {
    gap: 10,
    marginBottom: 24,
  },
  onboardingBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingVertical: 13,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  onboardingBtnText: {
    color: Colors.brand,
    fontSize: 14,
    fontWeight: '800',
  },
  onboardingBtnSecondary: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  onboardingBtnSecondaryText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
  },
  onboardingSteps: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingTop: 16,
  },
  onboardingStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  onboardingStepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  onboardingStepNumText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '800',
  },
  onboardingStepLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
  },
});
