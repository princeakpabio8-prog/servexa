import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
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
  const { width } = useWindowDimensions();
  const isWide = width >= 1000;

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

  const nav = [
    ['⌂', 'Overview', '/'],
    ['◎', 'Customers', '/customers'],
    ['◫', 'Campaigns', '/campaigns'],
    ['◷', 'Activity', '/activity'],
    ['⚙', 'Settings', '/settings'],
  ];

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.app}>
        <View style={styles.sidebar}>
          <View>
            <Pressable style={styles.brandRow} onPress={() => router.push('/')}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>
              <View>
                <Text style={styles.brand}>SERVEXA</Text>
                <Text style={styles.brandSmall}>CUSTOMER OPERATIONS</Text>
              </View>
            </Pressable>

            <Text style={styles.workspaceLabel}>WORKSPACE</Text>

            <View style={styles.workspace}>
              <View style={styles.companyAvatar}>
                <Text style={styles.companyAvatarText}>LG</Text>
              </View>

              <View style={styles.workspaceText}>
                <Text style={styles.companyName}>Lekki Gardens</Text>
                <Text style={styles.companyRole}>Customer Care</Text>
              </View>

              <Text style={styles.chevron}>⌄</Text>
            </View>

            <View style={styles.nav}>
              {nav.map(([icon, label, route]) => {
                const active = label === 'Activity';

                return (
                  <Pressable
                    key={label}
                    onPress={() => router.push(route as any)}
                    style={({ pressed }) => [
                      styles.navItem,
                      active && styles.navItemActive,
                      pressed && styles.navPressed,
                    ]}
                  >
                    <Text style={[styles.navIcon, active && styles.navIconActive]}>
                      {icon}
                    </Text>
                    <Text style={[styles.navText, active && styles.navTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <View style={styles.planCard}>
              <View style={styles.planHeader}>
                <View>
                  <Text style={styles.planEyebrow}>CURRENT PLAN</Text>
                  <Text style={styles.planTitle}>Growth</Text>
                </View>
                <View style={styles.planDot} />
              </View>

              <Text style={styles.planText}>7,420 of 10,000 calls</Text>

              <View style={styles.track}>
                <View style={styles.fill} />
              </View>

              <Text style={styles.manage}>Manage plan →</Text>
            </View>

            <Text style={styles.version}>SERVEXA v0.1 • Enterprise Preview</Text>
          </View>
        </View>

        <View style={styles.main}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.content, isWide && styles.contentWide]}
          >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>CUSTOMER OPERATIONS</Text>
                <Text style={styles.title}>Activity</Text>
                <Text style={styles.subtitle}>
                  See what SERVEXA handled, what customers said, and what your team needs to do next.
                </Text>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  onPress={syncPendingCalls}
                  disabled={syncing}
                  style={({ pressed }) => [styles.refreshButton, pressed && styles.pressed]}
                >
                  <Text style={styles.refreshButtonText}>
                    {syncing ? 'Refreshing…' : '↻ Refresh status'}
                  </Text>
                </Pressable>

                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>CALL-E LIVE</Text>
                </View>
              </View>
            </View>

            <View style={styles.summaryCard}>
              <View style={styles.summaryMain}>
                <Text style={styles.summaryEyebrow}>TODAY'S AUTOMATED ACTIVITY</Text>
                <Text style={styles.summaryValue}>1,071</Text>
                <Text style={styles.summaryDescription}>
                  customer conversations processed by SERVEXA
                </Text>
              </View>

              <View style={styles.summaryDivider} />

              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>85.3%</Text>
                <Text style={styles.summaryStatLabel}>Resolved automatically</Text>
              </View>

              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>8</Text>
                <Text style={styles.summaryStatLabel}>Need human attention</Text>
              </View>

              <View style={styles.summaryStat}>
                <Text style={styles.summaryStatValue}>34</Text>
                <Text style={styles.summaryStatLabel}>Follow-ups created</Text>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Recent activity</Text>
                <Text style={styles.sectionSubtitle}>
                  Every important customer interaction in one place
                </Text>
              </View>

              <View style={styles.filterRow}>
                {filters.map((filter, index) => (
                  <Pressable
                    key={filter}
                    style={[
                      styles.filter,
                      index === 0 && styles.filterActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        index === 0 && styles.filterTextActive,
                      ]}
                    >
                      {filter}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.activityCard}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeading, styles.customerColumn]}>CUSTOMER</Text>
                <Text style={[styles.tableHeading, styles.actionColumn]}>INTERACTION</Text>
                <Text style={[styles.tableHeading, styles.outcomeColumn]}>OUTCOME</Text>
                <Text style={[styles.tableHeading, styles.nextColumn]}>NEXT ACTION</Text>
                <Text style={styles.tableHeading}>TIME</Text>
              </View>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#0066cc" />
                </View>
              ) : activities.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No activities yet. Start making calls to see activity records here.</Text>
                </View>
              ) : (
                activities.map((activity, index) => {
                  const activityType = getActivityType(activity.metadata);
                  const customerInitials = activity.customer_name ? getInitials(activity.customer_name) : 'XX';
                  const outcome = activity.metadata?.outcome || 'unknown';
                  const nextAction = activity.metadata?.next_action || 'Pending review';

                  return (
                    <Pressable
                      key={activity.id}
                      onPress={() => router.push('/customers' as any)}
                      style={({ pressed }) => [
                        styles.event,
                        index === activities.length - 1 && styles.eventLast,
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
                        <View
                          style={[
                            styles.outcomeBadge,
                            activityType === 'attention' && styles.outcomeAttention,
                            activityType === 'resolved' && styles.outcomeResolved,
                          ]}
                        >
                          <View
                            style={[
                              styles.outcomeDot,
                              activityType === 'attention' && styles.outcomeDotAttention,
                              activityType === 'resolved' && styles.outcomeDotResolved,
                            ]}
                          />
                          <Text
                            style={[
                              styles.outcomeText,
                              activityType === 'attention' && styles.outcomeTextAttention,
                              activityType === 'resolved' && styles.outcomeTextResolved,
                            ]}
                          >
                            {activityType === 'attention'
                              ? 'Attention'
                              : activityType === 'resolved'
                              ? 'Resolved'
                              : 'Follow-up'}
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
                })
              )}
            </View>

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
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F6F8' },
  app: { flex: 1, flexDirection: 'row' },

  sidebar: {
    width: 270,
    backgroundColor: '#FFF',
    borderRightWidth: 1,
    borderRightColor: '#E5E8EC',
    padding: 20,
    paddingTop: 28,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },

  brandMark: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#122735',
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  brand: { color: '#152532', fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  brandSmall: { color: '#9AA4AD', fontSize: 7, fontWeight: '800', letterSpacing: 1, marginTop: 2 },

  workspaceLabel: {
    marginTop: 38,
    marginBottom: 10,
    color: '#98A1AA',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },

  workspace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E8EC',
    borderRadius: 15,
    padding: 11,
  },

  workspaceText: { flex: 1 },

  companyAvatar: {
    width: 35,
    height: 35,
    borderRadius: 11,
    backgroundColor: '#E6F3F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  companyAvatarText: { color: '#147983', fontSize: 10, fontWeight: '900' },
  companyName: { color: '#202A33', fontSize: 12, fontWeight: '800' },
  companyRole: { color: '#8B949D', fontSize: 9, marginTop: 2 },
  chevron: { color: '#8C959E', fontSize: 17 },

  nav: { marginTop: 27, gap: 5 },

  navItem: {
    minHeight: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  navPressed: { opacity: 0.65 },
  navItemActive: { backgroundColor: '#EAF3F4' },
  navIcon: { width: 20, color: '#89939D', fontSize: 17, textAlign: 'center' },
  navIconActive: { color: '#147983' },
  navText: { color: '#69747E', fontSize: 13, fontWeight: '600' },
  navTextActive: { color: '#147983', fontWeight: '800' },

  planCard: {
    backgroundColor: '#F5F7F8',
    borderWidth: 1,
    borderColor: '#E9ECEF',
    borderRadius: 17,
    padding: 15,
  },

  planHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  planDot: { width: 7, height: 7, borderRadius: 7, backgroundColor: '#4EAC82', marginTop: 4 },
  planEyebrow: { color: '#8A949D', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  planTitle: { color: '#1D2831', fontSize: 17, fontWeight: '900', marginTop: 5 },
  planText: { color: '#7E8891', fontSize: 9, marginTop: 7 },

  track: {
    height: 6,
    backgroundColor: '#DCE3E6',
    borderRadius: 10,
    marginTop: 10,
    overflow: 'hidden',
  },

  fill: { width: '74%', height: '100%', backgroundColor: '#147983' },
  manage: { color: '#147983', fontSize: 9, fontWeight: '900', marginTop: 10 },
  version: { color: '#B0B7BD', fontSize: 8, marginTop: 17 },

  main: { flex: 1 },

  content: {
    padding: 28,
    paddingBottom: 60,
  },

  contentWide: {
    maxWidth: 1450,
    width: '100%',
    alignSelf: 'center',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 24,
  },

  headerCopy: { flex: 1 },
  eyebrow: { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#15232E', fontSize: 32, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6, maxWidth: 720 },

  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },

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
    borderRadius: 22,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 150,
  },

  summaryMain: { flex: 1 },
  summaryEyebrow: { color: '#91AEB2', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: '#FFF', fontSize: 42, fontWeight: '900', marginTop: 4 },
  summaryDescription: { color: '#AFC0C7', fontSize: 10, marginTop: 2 },

  summaryDivider: {
    width: 1,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 28,
  },

  summaryStat: { minWidth: 125, paddingHorizontal: 12 },
  summaryStatValue: { color: '#FFF', fontSize: 23, fontWeight: '900' },
  summaryStatLabel: { color: '#91AEB2', fontSize: 8, lineHeight: 12, marginTop: 4 },

  sectionHeader: {
    marginTop: 30,
    marginBottom: 13,
  },

  sectionTitle: { color: '#202A33', fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { color: '#919AA3', fontSize: 10, marginTop: 3 },

  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 13,
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
  insightCopy: { flex: 1 },
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
});