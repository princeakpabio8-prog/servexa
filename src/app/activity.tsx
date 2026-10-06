import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import AppShell from '../components/app-shell';
import AlertBanner from '../components/alert-banner';
import { Colors, Radius } from '../constants/theme';
import { ensureSession, supabase } from '../lib/supabase';

type Activity = {
  id: string;
  customer_id: string;
  call_id?: string;
  activity_type: string;
  title: string;
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  customer_name?: string;
};

const filters = ['All activity', 'Calls', 'Follow-ups', 'Attention', 'Resolved'];

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffHours < 1) return 'Now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getActivityType = (metadata: Record<string, any>) => {
  const outcome = metadata?.outcome || 'unknown';
  if (outcome === 'escalation_needed' || metadata?.escalation_required) return 'attention';
  if (metadata?.follow_up_required) return 'follow';
  if (outcome === 'resolved') return 'resolved';
  return 'follow';
};

export default function ActivityScreen() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState(filters[0]);
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  useEffect(() => {
    fetchActivities();
  }, []);

  const fetchActivities = async () => {
    try {
      await ensureSession();

      const { data, error } = await supabase
        .from('activities')
        .select('id, customer_id, call_id, activity_type, title, description, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch customer names for each activity
      const activitiesWithNames = await Promise.all(
        (data || []).map(async (activity) => {
          if (!activity.customer_id) return activity;

          const { data: customer } = await supabase
            .from('customers')
            .select('name')
            .eq('id', activity.customer_id)
            .single();

          return {
            ...activity,
            customer_name: customer?.name || 'Unknown Customer',
          };
        })
      );

      setActivities(activitiesWithNames);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  // Manually pull the latest status for calls still awaiting a webhook.
  // Falls back gracefully if CALL-E hasn't reached a terminal state yet.
  const syncPendingCalls = async () => {
    setSyncing(true);

    try {
      await ensureSession();

      const { data: pendingCalls, error } = await supabase
        .from('calls')
        .select('id')
        .in('status', ['initiated', 'queued', 'ringing', 'in_progress'])
        .not('provider_call_id', 'is', null);

      if (error) throw error;

      await Promise.all(
        (pendingCalls || []).map((call) =>
          supabase.functions.invoke('sync-call-status', { body: { call_id: call.id } })
        )
      );

      await fetchActivities();
    } catch (err) {
      console.error('Failed to sync pending calls:', err);
    } finally {
      setSyncing(false);
    }
  };

  // ── Grouping helpers ──────────────────────────────────────────────────────
  const { attentionItems, filteredActivities, groupedActivities } = useMemo(() => {
    // Filter by tab
    const filtered = activities.filter((a) => {
      const t = getActivityType(a.metadata);
      if (activeFilter === 'All activity') return true;
      if (activeFilter === 'Calls') return a.activity_type === 'call' || a.activity_type === 'call_completed';
      if (activeFilter === 'Follow-ups') return t === 'follow' || a.metadata?.follow_up_required;
      if (activeFilter === 'Attention') return t === 'attention';
      if (activeFilter === 'Resolved') return t === 'resolved';
      return true;
    });

    // Attention items always surfaced at top
    const attention = filtered.filter((a) => getActivityType(a.metadata) === 'attention');

    // Time grouping
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart); yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7);

    const groups: { label: string; items: Activity[] }[] = [];
    const todayItems = filtered.filter((a) => new Date(a.created_at) >= todayStart);
    const yesterdayItems = filtered.filter((a) => {
      const d = new Date(a.created_at);
      return d >= yesterdayStart && d < todayStart;
    });
    const thisWeekItems = filtered.filter((a) => {
      const d = new Date(a.created_at);
      return d >= weekStart && d < yesterdayStart;
    });
    const olderItems = filtered.filter((a) => new Date(a.created_at) < weekStart);

    if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems });
    if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems });
    if (thisWeekItems.length > 0) groups.push({ label: 'This week', items: thisWeekItems });
    if (olderItems.length > 0) groups.push({ label: 'Earlier', items: olderItems });

    return { attentionItems: attention, filteredActivities: filtered, groupedActivities: groups };
  }, [activities, activeFilter]);

  return (
    <AppShell>
            {/* ── PAGE HEADER ─────────────────────────────────────── */}
            <View style={[styles.header, isMobile && styles.headerMobile]}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>CUSTOMER OPERATIONS</Text>
                <Text style={styles.title}>Activity</Text>
                {!isMobile && (
                  <Text style={styles.subtitle}>
                    See what SERVEXA handled, what customers said, and what your team needs to do next.
                  </Text>
                )}
              </View>

              <View style={[styles.headerActions, isMobile && styles.headerActionsMobile]}>
                <Pressable
                  onPress={syncPendingCalls}
                  disabled={syncing}
                  style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
                >
                  <Text style={styles.refreshButtonText}>
                    {syncing ? 'Refreshing…' : '↻ Refresh'}
                  </Text>
                </Pressable>

                {!isMobile && (
                  <View style={styles.livePill}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveText}>LIVE</Text>
                  </View>
                )}
              </View>
            </View>

            {/* ── SUMMARY STATS ──────────────────────────────────── */}
            <View style={[styles.summaryCard, isMobile && styles.summaryCardMobile]}>
              <View style={[styles.summaryStat, isMobile && styles.summaryStatHalf]}>
                <Text style={styles.summaryStatValue}>{activities.length}</Text>
                <Text style={styles.summaryStatLabel}>Interactions</Text>
              </View>

              {!isMobile && <View style={styles.summaryStatDivider} />}

              <View style={[styles.summaryStat, isMobile && styles.summaryStatHalf]}>
                <Text style={styles.summaryStatValue}>
                  {activities.length ? `${Math.round((activities.filter((item) => item.metadata?.outcome === 'resolved').length / activities.length) * 100)}%` : '—'}
                </Text>
                <Text style={styles.summaryStatLabel}>Resolved auto</Text>
              </View>

              {!isMobile && <View style={styles.summaryStatDivider} />}

              <View style={[styles.summaryStat, isMobile && styles.summaryStatHalf]}>
                <Text style={styles.summaryStatValue}>
                  {activities.filter((item) => item.metadata?.escalation_required).length}
                </Text>
                <Text style={styles.summaryStatLabel}>Need attention</Text>
              </View>

              {!isMobile && <View style={styles.summaryStatDivider} />}

              <View style={[styles.summaryStat, isMobile && styles.summaryStatHalf]}>
                <Text style={styles.summaryStatValue}>
                  {activities.filter((item) => item.metadata?.follow_up_required).length}
                </Text>
                <Text style={styles.summaryStatLabel}>Follow-ups</Text>
              </View>
            </View>

            {/* ── SECTION HEADER + FILTERS ───────────────────────── */}
            <View style={styles.sectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>Activity</Text>
                {!isMobile && (
                  <Text style={styles.sectionSubtitle}>
                    Every important customer interaction in one place
                  </Text>
                )}
              </View>
            </View>

            {/* Filter pills */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
              style={styles.filterScroll}
            >
              {filters.map((filter) => {
                const active = filter === activeFilter;
                return (
                  <Pressable
                    key={filter}
                    onPress={() => setActiveFilter(filter)}
                    style={[styles.filter, active && styles.filterActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Filter by ${filter}`}
                  >
                    <Text style={[styles.filterText, active && styles.filterTextActive]}>
                      {filter}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── NEEDS ATTENTION — surfaced at top ─────────────── */}
            {!loading && attentionItems.length > 0 && activeFilter === 'All activity' && (
              <View style={styles.attentionSection}>
                <View style={styles.attentionSectionHeader}>
                  <Text style={styles.attentionSectionTitle}>Needs Attention</Text>
                  <View style={styles.attentionBadge}>
                    <Text style={styles.attentionBadgeText}>{attentionItems.length}</Text>
                  </View>
                </View>
                {attentionItems.slice(0, 3).map((item) => (
                  <View key={item.id} style={styles.attentionBannerWrap}>
                    <AlertBanner
                      type="escalation"
                      title={item.customer_name || 'Customer'}
                      subtitle={item.metadata?.escalation_reason || item.description || 'Needs review'}
                      action="View"
                      onAction={() =>
                        item.call_id
                          ? router.push({ pathname: '/call-detail' as any, params: { callId: item.call_id } })
                          : router.push('/customers' as any)
                      }
                    />
                  </View>
                ))}
              </View>
            )}

            {/* ── GROUPED ACTIVITY LIST ─────────────────────────── */}
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0066cc" />
              </View>
            ) : filteredActivities.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No activities yet. Start making calls to see activity records here.</Text>
              </View>
            ) : (
              groupedActivities.map((group) => (
                <View key={group.label}>
                  {/* Group label */}
                  <View style={styles.groupHeader}>
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    <View style={styles.groupLine} />
                  </View>

                  <View style={styles.activityCard}>
                    {!isMobile && (
                      <View style={styles.tableHeader}>
                        <Text style={[styles.tableHeading, styles.customerColumn]}>CUSTOMER</Text>
                        <Text style={[styles.tableHeading, styles.actionColumn]}>INTERACTION</Text>
                        <Text style={[styles.tableHeading, styles.outcomeColumn]}>OUTCOME</Text>
                        <Text style={[styles.tableHeading, styles.nextColumn]}>NEXT ACTION</Text>
                        <Text style={styles.tableHeading}>TIME</Text>
                      </View>
                    )}

                    {group.items.map((activity, index) => {
                      const activityType = getActivityType(activity.metadata);
                      const customerInitials = activity.customer_name ? getInitials(activity.customer_name) : 'XX';
                      const outcome = activity.metadata?.outcome || 'unknown';
                      const nextAction = activity.metadata?.next_action || 'Pending review';

                      if (isMobile) {
                        return (
                          <Pressable
                            key={activity.id}
                            onPress={() =>
                              activity.call_id
                                ? router.push({ pathname: '/call-detail' as any, params: { callId: activity.call_id } })
                                : router.push('/customers' as any)
                            }
                            style={({ pressed }) => [styles.mobileActivityRow, pressed && styles.pressed]}
                          >
                            <View style={styles.personAvatar}>
                              <Text style={styles.personAvatarText}>{customerInitials}</Text>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={styles.name} numberOfLines={1}>{activity.customer_name || 'Unknown'}</Text>
                              <Text style={styles.action} numberOfLines={1}>{activity.title || activity.activity_type}</Text>
                            </View>
                            <View style={[
                              styles.outcomeBadge,
                              activityType === 'attention' && styles.outcomeAttention,
                              activityType === 'resolved' && styles.outcomeResolved,
                            ]}>
                              <Text style={[
                                styles.outcomeText,
                                activityType === 'attention' && styles.outcomeTextAttention,
                                activityType === 'resolved' && styles.outcomeTextResolved,
                              ]}>
                                {activityType === 'attention' ? 'Attention' : activityType === 'resolved' ? 'Resolved' : 'Follow-up'}
                              </Text>
                            </View>
                            <Text style={styles.time}>{formatTime(activity.created_at)}</Text>
                          </Pressable>
                        );
                      }

                      return (
                        <Pressable
                          key={activity.id}
                          onPress={() =>
                            activity.call_id
                              ? router.push({ pathname: '/call-detail' as any, params: { callId: activity.call_id } })
                              : router.push('/customers' as any)
                          }
                          style={({ pressed }) => [
                            styles.event,
                            index === group.items.length - 1 && styles.eventLast,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View style={styles.customerColumn}>
                            <View style={styles.customerCell}>
                              <View style={styles.personAvatar}>
                                <Text style={styles.personAvatarText}>{customerInitials}</Text>
                              </View>
                              <View style={styles.customerInfo}>
                                <Text style={styles.name}>{activity.customer_name || 'Unknown'}</Text>
                                <Text style={styles.customerType}>Customer</Text>
                              </View>
                            </View>
                          </View>
                          <View style={styles.actionColumn}>
                            <Text style={styles.action}>{activity.title || activity.activity_type}</Text>
                            <Text style={styles.agentLabel}>Handled by SERVEXA</Text>
                          </View>
                          <View style={styles.outcomeColumn}>
                            <View style={[
                              styles.outcomeBadge,
                              activityType === 'attention' && styles.outcomeAttention,
                              activityType === 'resolved' && styles.outcomeResolved,
                            ]}>
                              <View style={[
                                styles.outcomeDot,
                                activityType === 'attention' && styles.outcomeDotAttention,
                                activityType === 'resolved' && styles.outcomeDotResolved,
                              ]} />
                              <Text style={[
                                styles.outcomeText,
                                activityType === 'attention' && styles.outcomeTextAttention,
                                activityType === 'resolved' && styles.outcomeTextResolved,
                              ]}>
                                {activityType === 'attention' ? 'Attention' : activityType === 'resolved' ? 'Resolved' : 'Follow-up'}
                              </Text>
                            </View>
                            <Text style={styles.result}>{activity.description || outcome}</Text>
                          </View>
                          <View style={styles.nextColumn}>
                            <Text style={styles.nextAction}>{nextAction}</Text>
                          </View>
                          <View style={styles.timeColumn}>
                            <Text style={styles.time}>{formatTime(activity.created_at)}</Text>
                            <Text style={styles.arrow}>›</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))
            )}

            <View style={styles.callInsight}>
              <View style={styles.callIcon}>
                <Text style={styles.callIconText}>AI</Text>
              </View>

              <View style={styles.insightCopy}>
                <Text style={styles.insightTitle}>CALL-E activity summary</Text>
                <Text style={styles.insightText}>
                  Routine conversations are being handled automatically. When a customer needs
                  staff involvement, SERVEXA surfaces the response and recommended next action.
                </Text>
              </View>

              <Pressable
                style={styles.customersButton}
                onPress={() => router.push('/customers' as any)}
              >
                <Text style={styles.customersButtonText}>View customers →</Text>
              </Pressable>
            </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  mobileActivityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE9E2',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 20,
  },

  headerMobile: {
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 10,
  },

  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#15232E', fontSize: 28, fontWeight: '900', marginTop: 4 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6, maxWidth: 720 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 },
  headerActionsMobile: { flexShrink: 0 },

  refreshButton: {
    borderWidth: 1,
    borderColor: '#DCE1E5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },

  refreshButtonText: { color: '#35414A', fontSize: 10, fontWeight: '800' },

  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EDF7F2',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },

  liveDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#4EAC82' },
  liveText: { color: '#4E8B70', fontSize: 8, fontWeight: '900', letterSpacing: 1 },

  summaryCard: {
    backgroundColor: '#112936',
    borderRadius: 20,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    overflow: 'hidden',
  },

  summaryCardMobile: {
    flexWrap: 'wrap',
    padding: 16,
    gap: 0,
  },

  summaryStatFirst: {},
  // On mobile: 2-column grid (two stats per row)
  summaryStatHalf: { width: '50%', flex: 0, paddingVertical: 10, paddingHorizontal: 12 },

  summaryStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginHorizontal: 14,
    alignSelf: 'center',
  },

  // On mobile the dividers are hidden via JSX (not rendered), stats use 50% width
  summaryStat: { flex: 1, minWidth: 80, paddingHorizontal: 8, paddingVertical: 6 },
  summaryStatValue: { color: '#FFF', fontSize: 22, fontWeight: '900' },
  summaryStatLabel: { color: '#91AEB2', fontSize: 8, lineHeight: 12, marginTop: 3 },

  sectionHeader: {
    marginTop: 30,
    marginBottom: 13,
  },

  sectionTitle: { color: '#202A33', fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { color: '#919AA3', fontSize: 10, marginTop: 3 },

  filterScroll: {
    marginBottom: 12,
  },

  filterRow: {
    flexDirection: 'row',
    gap: 6,
    paddingBottom: 4,
    paddingHorizontal: 1,
  },

  filter: {
    borderWidth: 1,
    borderColor: '#E2E6EA',
    backgroundColor: '#FFF',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },

  filterActive: { backgroundColor: '#EAF3F4', borderColor: '#CDE2E4' },
  filterText: { color: '#69747E', fontSize: 9, fontWeight: '700' },
  filterTextActive: { color: '#147983', fontWeight: '900' },

  activityCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E8EC',
    borderRadius: 18,
    overflow: 'hidden',
  },

  tableHeader: {
    minHeight: 43,
    paddingHorizontal: 18,
    backgroundColor: '#FAFBFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
    flexDirection: 'row',
    alignItems: 'center',
  },

  tableHeading: {
    color: '#9AA2AA',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  customerColumn: { flex: 1.25, minWidth: 170 },
  actionColumn: { flex: 1, minWidth: 145 },
  outcomeColumn: { flex: 1.2, minWidth: 170 },
  nextColumn: { flex: 1, minWidth: 150 },
  timeColumn: { width: 75, alignItems: 'flex-end' },

  event: {
    minHeight: 86,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F2',
    flexDirection: 'row',
    alignItems: 'center',
  },

  eventLast: { borderBottomWidth: 0 },
  pressed: { opacity: 0.65 },

  customerCell: { flexDirection: 'row', alignItems: 'center', gap: 10 },

  personAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF3F4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  personAvatarText: { color: '#147983', fontSize: 9, fontWeight: '900' },
  customerInfo: { flex: 1 },
  name: { color: '#303A43', fontSize: 10, fontWeight: '900' },
  customerType: { color: '#A0A7AE', fontSize: 8, marginTop: 3 },

  action: { color: '#4D5963', fontSize: 10, fontWeight: '700' },
  agentLabel: { color: '#147983', fontSize: 8, fontWeight: '700', marginTop: 4 },
  result: { color: '#8E969F', fontSize: 8, marginTop: 5 },

  outcomeBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF3F4',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },

  outcomeResolved: { backgroundColor: '#EDF7F2' },
  outcomeAttention: { backgroundColor: '#FFF1ED' },

  outcomeDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: '#147983' },
  outcomeDotResolved: { backgroundColor: '#4EAC82' },
  outcomeDotAttention: { backgroundColor: '#D68168' },

  outcomeText: { color: '#147983', fontSize: 8, fontWeight: '900' },
  outcomeTextResolved: { color: '#4E8B70' },
  outcomeTextAttention: { color: '#C2664E' },

  nextAction: { color: '#5E6973', fontSize: 9, lineHeight: 14 },
  time: { color: '#9CA4AB', fontSize: 8 },
  arrow: { color: '#A2AAB1', fontSize: 19, marginTop: 4 },

  callInsight: {
    marginTop: 14,
    backgroundColor: '#E8F3F4',
    borderWidth: 1,
    borderColor: '#D8E9EB',
    borderRadius: 16,
    padding: 17,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },

  callIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#147983',
    alignItems: 'center',
    justifyContent: 'center',
  },

  callIconText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
  insightCopy: { flex: 1, minWidth: 160 },
  insightTitle: { color: '#155F66', fontSize: 10, fontWeight: '900' },
  insightText: { color: '#58787B', fontSize: 8, lineHeight: 13, marginTop: 3 },

  customersButton: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#CFE2E4',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  customersButtonText: { color: '#147983', fontSize: 9, fontWeight: '900' },

  loadingContainer: {
    minHeight: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },

  emptyContainer: {
    minHeight: 120,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },

  emptyText: {
    color: '#8B949D',
    fontSize: 12,
    textAlign: 'center',
  },

  // Group headers
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    marginBottom: 8,
  },
  groupLabel: {
    color: Colors.inkMuted,
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 0,
  },
  groupLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },

  // Attention section
  attentionSection: {
    marginBottom: 6,
  },
  attentionSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  attentionSectionTitle: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '700',
  },
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
  attentionBannerWrap: {
    marginBottom: 6,
  },
});