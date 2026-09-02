import { Link, router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
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

type DashboardStat = { label: string; value: string; change: string; tone: string };
type AttentionItem = { name: string; reason: string; priority: string };
type ActivityItem = { name: string; detail: string; result: string; time: string; type: string };

const formatRelativeTime = (value: string) => {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 1050;
  const [stats, setStats] = useState<DashboardStat[]>([]);
  const [attention, setAttention] = useState<AttentionItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        await ensureSession();

        const [{ data: calls }, { data: followUps }, { data: activities }] = await Promise.all([
          supabase.from('calls').select('id, status, created_at').order('created_at', { ascending: false }),
          supabase.from('follow_ups').select('id, status').eq('status', 'pending'),
          supabase
            .from('activities')
            .select('id, customer_id, title, description, metadata, created_at')
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayCalls = (calls ?? []).filter((call) => new Date(call.created_at) >= today);
        const resolvedToday = (activities ?? []).filter(
          (item) => new Date(item.created_at) >= today && item.metadata?.outcome === 'resolved'
        ).length;
        const attentionItems = (activities ?? []).filter((item) => item.metadata?.escalation_required);

        const customerIds = Array.from(new Set((activities ?? []).map((item) => item.customer_id).filter(Boolean)));
        const { data: customers } = customerIds.length
          ? await supabase.from('customers').select('id, name').in('id', customerIds)
          : { data: [] };
        const customerNames = new Map((customers ?? []).map((customer) => [customer.id, customer.name]));

        setStats([
          { label: 'Calls today', value: String(todayCalls.length), change: 'Live', tone: 'good' },
          { label: 'Resolved today', value: String(resolvedToday), change: todayCalls.length ? `${Math.round((resolvedToday / todayCalls.length) * 100)}%` : '—', tone: 'good' },
          { label: 'Follow-ups queued', value: String(followUps?.length ?? 0), change: 'Pending', tone: 'neutral' },
          { label: 'Human attention', value: String(attentionItems.length), change: 'Needs action', tone: 'alert' },
        ]);

        setAttention(
          attentionItems.slice(0, 3).map((item) => ({
            name: customerNames.get(item.customer_id) ?? 'Unknown customer',
            reason: item.metadata?.escalation_reason ?? item.description ?? 'Review required',
            priority: 'Review',
          }))
        );
        setActivity(
          (activities ?? []).slice(0, 3).map((item) => ({
            name: customerNames.get(item.customer_id) ?? 'Unknown customer',
            detail: item.title,
            result: item.metadata?.outcome ?? 'Recorded',
            time: formatRelativeTime(item.created_at),
            type: item.metadata?.escalation_required ? 'attention' : item.metadata?.outcome === 'resolved' ? 'resolved' : 'follow',
          }))
        );
      } catch (error) {
        console.error('Failed to load dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.app}>
        {/* SIDEBAR */}
        <View style={styles.sidebar}>
          <View>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>
              <View>
                <Text style={styles.brand}>SERVEXA</Text>
                <Text style={styles.brandSub}>CUSTOMER OPERATIONS</Text>
              </View>
            </View>

            <Text style={styles.workspaceLabel}>WORKSPACE</Text>

            <View style={styles.workspace}>
              <View style={styles.companyAvatar}>
                <Text style={styles.companyAvatarText}>LG</Text>
              </View>

              <View style={styles.workspaceText}>
                <Text style={styles.companyName}>Example Organization</Text>
                <Text style={styles.companyRole}>Customer Care</Text>
              </View>

              <Text style={styles.chevron}>⌄</Text>
            </View>

            <View style={styles.nav}>
              <Link href="/" asChild>
                <Pressable style={styles.navItemActive}>
                  <Text style={[styles.navIcon, styles.navIconActive]}>⌂</Text>
                  <Text style={[styles.navText, styles.navTextActive]}>Overview</Text>
                </Pressable>
              </Link>

              <Link href="/customers" asChild>
                <Pressable style={styles.navItem}>
                  <Text style={styles.navIcon}>◎</Text>
                  <Text style={styles.navText}>Customers</Text>
                </Pressable>
              </Link>

              <Link href="/campaigns" asChild>
                <Pressable style={styles.navItem}>
                  <Text style={styles.navIcon}>◫</Text>
                  <Text style={styles.navText}>Campaigns</Text>
                </Pressable>
              </Link>

              <Link href="/activity" asChild>
                <Pressable style={styles.navItem}>
                  <Text style={styles.navIcon}>◷</Text>
                  <Text style={styles.navText}>Activity</Text>
                </Pressable>
              </Link>

              <Link href="/settings" asChild>
                <Pressable style={styles.navItem}>
                  <Text style={styles.navIcon}>⚙</Text>
                  <Text style={styles.navText}>Settings</Text>
                </Pressable>
              </Link>
            </View>
          </View>

          <View style={styles.sidebarBottom}>
            <View style={styles.planCard}>
              <View style={styles.planTop}>
                <View>
                  <Text style={styles.planEyebrow}>CURRENT PLAN</Text>
                  <Text style={styles.planTitle}>Growth</Text>
                </View>
                <View style={styles.planDot} />
              </View>

              <Text style={styles.planText}>Usage is available in Settings</Text>

              <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
              </View>

              <Pressable>
                <Text style={styles.upgradeText}>Manage plan  →</Text>
              </Pressable>
            </View>

            <Text style={styles.version}>SERVEXA v0.1</Text>
          </View>
        </View>

        {/* MAIN */}
        <View style={styles.main}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              isWide && styles.contentWide,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* HEADER */}
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.eyebrow}>CUSTOMER OPERATIONS</Text>
                <Text style={styles.heading}>Good morning.</Text>
                <Text style={styles.subheading}>
                  Your customer-care operation is running.
                </Text>
              </View>

              <View style={styles.headerActions}>
                <Pressable
                  style={styles.docsButton}
                  onPress={() => router.push('/activity' as any)}
                >
                  <Text style={styles.docsButtonText}>Live activity</Text>
                </Pressable>

                <Pressable style={styles.avatar}>
                  <Text style={styles.avatarText}>AE</Text>
                </Pressable>
              </View>
            </View>

            {/* PREMIUM HERO */}
            <View style={styles.hero}>
              <View style={styles.heroGlowOne} />
              <View style={styles.heroGlowTwo} />

              <View style={styles.heroCopy}>
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>SERVEXA IS READY</Text>
                </View>

                <Text style={styles.heroTitle}>
                  Let automation handle the routine. Let your team handle what matters.
                </Text>

                <Text style={styles.heroText}>
                  SERVEXA keeps customer conversations moving with automated calls,
                  reminders, follow-ups, and intelligent escalation to your staff.
                </Text>

                <View style={styles.heroActions}>
                  <Pressable
                    style={styles.primaryButton}
                    onPress={() => router.push('/campaigns' as any)}
                  >
                    <Text style={styles.primaryButtonText}>Create campaign</Text>
                    <Text style={styles.primaryButtonArrow}>→</Text>
                  </Pressable>

                  <Pressable
                    style={styles.secondaryButton}
                    onPress={() => router.push('/activity' as any)}
                  >
                    <Text style={styles.secondaryButtonText}>View activity</Text>
                  </Pressable>
                </View>
              </View>

              {/* CALL-E VISUAL */}
              <View style={styles.agentVisual}>
                <View style={styles.agentRingOuter}>
                  <View style={styles.agentRingMiddle}>
                    <View style={styles.agentCore}>
                      <Text style={styles.agentCoreTop}>CALL-E</Text>
                      <Text style={styles.agentCoreIcon}>AI</Text>
                      <Text style={styles.agentCoreBottom}>ACTIVE</Text>
                    </View>
                  </View>
                </View>

                <View style={[styles.signal, styles.signalOne]} />
                <View style={[styles.signal, styles.signalTwo]} />
                <View style={[styles.signal, styles.signalThree]} />
              </View>
            </View>

            {/* KPI HEADER */}
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Today's overview</Text>
                <Text style={styles.sectionSubtitle}>
                  Live customer-care performance
                </Text>
              </View>

              <Pressable onPress={() => router.push('/activity' as any)}>
                <Text style={styles.viewAll}>View analytics  →</Text>
              </Pressable>
            </View>

            {/* KPI CARDS */}
            <View style={styles.statsGrid}>
              {loading ? (
                <Text style={styles.loadingText}>Loading live performance...</Text>
              ) : stats.map((stat) => (
                <View style={styles.statCard} key={stat.label}>
                  <View style={styles.statCardTop}>
                    <Text style={styles.statLabel}>{stat.label}</Text>

                    <View
                      style={[
                        styles.statStatus,
                        stat.tone === 'alert' && styles.statStatusAlert,
                        stat.tone === 'neutral' && styles.statStatusNeutral,
                      ]}
                    >
                      <View
                        style={[
                          styles.statStatusDot,
                          stat.tone === 'alert' && styles.statStatusDotAlert,
                        ]}
                      />
                    </View>
                  </View>

                  <View style={styles.statRow}>
                    <Text style={styles.statValue}>{stat.value}</Text>

                    <View
                      style={[
                        styles.statBadge,
                        stat.tone === 'alert' && styles.statBadgeAlert,
                        stat.tone === 'neutral' && styles.statBadgeNeutral,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statBadgeText,
                          stat.tone === 'alert' && styles.statBadgeTextAlert,
                          stat.tone === 'neutral' && styles.statBadgeTextNeutral,
                        ]}
                      >
                        {stat.change}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* LOWER PANELS */}
            <View
              style={[
                styles.twoColumn,
                isWide && styles.twoColumnWide,
              ]}
            >
              {/* ATTENTION */}
              <View style={[styles.panel, isWide && styles.panelLarge]}>
                <View style={styles.panelHeader}>
                  <View>
                    <Text style={styles.panelTitle}>Needs attention</Text>
                    <Text style={styles.panelSubtitle}>
                      Customers requiring human action
                    </Text>
                  </View>

                  <View style={styles.countBadge}>
                    <Text style={styles.countBadgeText}>{attention.length}</Text>
                  </View>
                </View>

                {loading ? (
                  <Text style={styles.emptyText}>Loading escalations...</Text>
                ) : attention.length === 0 ? (
                  <Text style={styles.emptyText}>No escalations recorded.</Text>
                ) : attention.map((item) => (
                  <Pressable
                    style={styles.attentionRow}
                    key={item.name}
                    onPress={() => router.push('/customers' as any)}
                  >
                    <View style={styles.attentionIcon}>
                      <Text style={styles.attentionIconText}>!</Text>
                    </View>

                    <View style={styles.rowContent}>
                      <Text style={styles.attentionName}>{item.name}</Text>
                      <Text style={styles.attentionReason}>{item.reason}</Text>
                    </View>

                    <View style={styles.rowEnd}>
                      <Text style={styles.priority}>{item.priority}</Text>
                      <Text style={styles.chevronRight}>›</Text>
                    </View>
                  </Pressable>
                ))}

                <Pressable
                  style={styles.panelLink}
                  onPress={() => router.push('/customers' as any)}
                >
                  <Text style={styles.panelLinkText}>
                    View all escalations  →
                  </Text>
                </Pressable>
              </View>

              {/* ACTIVITY */}
              <View style={[styles.panel, isWide && styles.panelLarge]}>
                <View style={styles.panelHeader}>
                  <View>
                    <Text style={styles.panelTitle}>Recent activity</Text>
                    <Text style={styles.panelSubtitle}>
                      Latest customer interactions
                    </Text>
                  </View>

                  <View style={styles.activityLive}>
                    <View style={styles.activityLiveDot} />
                    <Text style={styles.activityLiveText}>LIVE</Text>
                  </View>
                </View>

                {loading ? (
                  <Text style={styles.emptyText}>Loading activity...</Text>
                ) : activity.length === 0 ? (
                  <Text style={styles.emptyText}>No activity recorded yet.</Text>
                ) : activity.map((item) => (
                  <Pressable
                    style={styles.activityRow}
                    key={item.name}
                    onPress={() => router.push('/activity' as any)}
                  >
                    <View
                      style={[
                        styles.activityStatus,
                        item.type === 'resolved' && styles.activityResolved,
                        item.type === 'attention' && styles.activityAttention,
                      ]}
                    >
                      <Text style={styles.activityStatusText}>
                        {item.type === 'resolved'
                          ? '✓'
                          : item.type === 'attention'
                          ? '!'
                          : '↗'}
                      </Text>
                    </View>

                    <View style={styles.rowContent}>
                      <Text style={styles.activityName}>{item.name}</Text>
                      <Text style={styles.activityDetail}>
                        {item.detail} • {item.result}
                      </Text>
                    </View>

                    <Text style={styles.activityTime}>{item.time}</Text>
                  </Pressable>
                ))}

                <Pressable
                  style={styles.panelLink}
                  onPress={() => router.push('/activity' as any)}
                >
                  <Text style={styles.panelLinkText}>Open activity  →</Text>
                </Pressable>
              </View>
            </View>

            {/* AUTOMATION STRIP */}
            <View style={styles.automationStrip}>
              <View style={styles.automationIcon}>
                <Text style={styles.automationIconText}>AI</Text>
              </View>

              <View style={styles.automationCopy}>
                <Text style={styles.automationTitle}>
                  Your automated customer-care agent is on duty.
                </Text>
                <Text style={styles.automationText}>
                  Calls can be initiated, responses recorded, notes captured,
                  and follow-up actions surfaced for your staff.
                </Text>
              </View>

              <Pressable
                style={styles.automationButton}
                onPress={() => router.push('/customers' as any)}
              >
                <Text style={styles.automationButtonText}>Open customers</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F6F7F9',
  },

  app: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F6F7F9',
  },

  sidebar: {
    width: 260,
    backgroundColor: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#E7E9ED',
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 20,
    justifyContent: 'space-between',
  },

  loadingText: {
    color: '#77828C',
    fontSize: 11,
    paddingVertical: 20,
  },

  emptyText: {
    color: '#77828C',
    fontSize: 11,
    paddingVertical: 18,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
  },

  brandMark: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#172A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },

  brand: {
    color: '#172A3A',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 1.1,
  },

  brandSub: {
    color: '#9AA2AB',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 2,
  },

  workspaceLabel: {
    marginTop: 40,
    marginBottom: 10,
    paddingHorizontal: 6,
    color: '#98A0AA',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  workspace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 14,
    padding: 10,
  },

  workspaceText: {
    flex: 1,
  },

  companyAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EAF4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  companyAvatarText: {
    color: '#137A82',
    fontSize: 11,
    fontWeight: '800',
  },

  companyName: {
    color: '#20252C',
    fontSize: 12,
    fontWeight: '700',
  },

  companyRole: {
    color: '#8C949E',
    fontSize: 10,
    marginTop: 2,
  },

  chevron: {
    color: '#8C949E',
    fontSize: 18,
  },

  nav: {
    marginTop: 28,
    gap: 5,
  },

  navItem: {
    height: 46,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  navItemActive: {
    backgroundColor: '#EEF4F5',
  },

  navIcon: {
    width: 20,
    color: '#89929D',
    fontSize: 18,
    textAlign: 'center',
  },

  navIconActive: {
    color: '#137A82',
  },

  navText: {
    color: '#6E7782',
    fontSize: 13,
    fontWeight: '600',
  },

  navTextActive: {
    color: '#137A82',
    fontWeight: '800',
  },

  sidebarBottom: {
    gap: 18,
  },

  planCard: {
    backgroundColor: '#F5F7F8',
    borderRadius: 16,
    padding: 15,
  },

  planTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  planDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#3FA77C',
    marginTop: 5,
  },

  planEyebrow: {
    color: '#8B949E',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  planTitle: {
    color: '#1F2730',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },

  planText: {
    color: '#7E8791',
    fontSize: 10,
    marginTop: 8,
  },

  progressTrack: {
    height: 5,
    backgroundColor: '#DDE3E5',
    borderRadius: 10,
    marginTop: 9,
    overflow: 'hidden',
  },

  progressFill: {
    width: '74%',
    height: '100%',
    backgroundColor: '#137A82',
    borderRadius: 10,
  },

  upgradeText: {
    color: '#137A82',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 11,
  },

  version: {
    color: '#B0B6BD',
    fontSize: 9,
    paddingHorizontal: 4,
  },

  main: {
    flex: 1,
  },

  content: {
    padding: 26,
    paddingBottom: 50,
  },

  contentWide: {
    maxWidth: 1450,
    width: '100%',
    alignSelf: 'center',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },

  headerCopy: {
    flex: 1,
  },

  eyebrow: {
    color: '#9AA1A9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },

  heading: {
    color: '#17212B',
    fontSize: 31,
    fontWeight: '800',
    marginTop: 5,
  },

  subheading: {
    color: '#77818B',
    fontSize: 13,
    marginTop: 6,
  },

  headerActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },

  docsButton: {
    height: 42,
    paddingHorizontal: 15,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EC',
    alignItems: 'center',
    justifyContent: 'center',
  },

  docsButtonText: {
    color: '#53606C',
    fontSize: 11,
    fontWeight: '700',
  },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#172A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  hero: {
    minHeight: 285,
    backgroundColor: '#172A3A',
    borderRadius: 25,
    padding: 30,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },

  heroCopy: {
    flex: 1,
    zIndex: 2,
  },

  heroGlowOne: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 300,
    right: 40,
    top: -100,
    backgroundColor: 'rgba(19,122,130,0.16)',
  },

  heroGlowTwo: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 210,
    right: 190,
    bottom: -130,
    backgroundColor: 'rgba(114,197,203,0.08)',
  },

  livePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#67D6A0',
  },

  liveText: {
    color: '#B8D2D4',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  heroTitle: {
    maxWidth: 720,
    color: '#FFFFFF',
    fontSize: 28,
    lineHeight: 35,
    fontWeight: '800',
    marginTop: 18,
  },

  heroText: {
    maxWidth: 690,
    color: '#B7C2CC',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },

  heroActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },

  primaryButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },

  primaryButtonText: {
    color: '#172A3A',
    fontSize: 12,
    fontWeight: '800',
  },

  primaryButtonArrow: {
    color: '#137A82',
    fontSize: 16,
    fontWeight: '800',
  },

  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },

  secondaryButtonText: {
    color: '#D4DEE3',
    fontSize: 11,
    fontWeight: '700',
  },

  agentVisual: {
    width: 270,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },

  agentRingOuter: {
    width: 205,
    height: 205,
    borderRadius: 205,
    borderWidth: 1,
    borderColor: 'rgba(114,197,203,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  agentRingMiddle: {
    width: 150,
    height: 150,
    borderRadius: 150,
    borderWidth: 1,
    borderColor: 'rgba(114,197,203,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  agentCore: {
    width: 96,
    height: 96,
    borderRadius: 96,
    backgroundColor: 'rgba(114,197,203,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(114,197,203,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  agentCoreTop: {
    color: '#8ED7DC',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  agentCoreIcon: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '800',
    marginTop: 2,
  },

  agentCoreBottom: {
    color: '#7FBEC3',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 2,
  },

  signal: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: '#72C5CB',
  },

  signalOne: {
    right: 15,
    top: 50,
  },

  signalTwo: {
    left: 18,
    bottom: 55,
  },

  signalThree: {
    right: 52,
    bottom: 22,
  },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 30,
    marginBottom: 13,
  },

  sectionTitle: {
    color: '#202832',
    fontSize: 17,
    fontWeight: '800',
  },

  sectionSubtitle: {
    color: '#929AA3',
    fontSize: 11,
    marginTop: 3,
  },

  viewAll: {
    color: '#137A82',
    fontSize: 11,
    fontWeight: '700',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  statCard: {
    flexGrow: 1,
    minWidth: 190,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 17,
    padding: 18,
  },

  statCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  statLabel: {
    color: '#89929C',
    fontSize: 11,
    fontWeight: '600',
  },

  statStatus: {
    width: 25,
    height: 25,
    borderRadius: 8,
    backgroundColor: '#EEF7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  statStatusNeutral: {
    backgroundColor: '#F2F4F6',
  },

  statStatusAlert: {
    backgroundColor: '#FFF1ED',
  },

  statStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#3FA77C',
  },

  statStatusDotAlert: {
    backgroundColor: '#C95F47',
  },

  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },

  statValue: {
    color: '#1E2730',
    fontSize: 25,
    fontWeight: '800',
  },

  statBadge: {
    backgroundColor: '#EEF7F3',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },

  statBadgeNeutral: {
    backgroundColor: '#F2F4F6',
  },

  statBadgeAlert: {
    backgroundColor: '#FFF1ED',
  },

  statBadgeText: {
    color: '#3B8C6B',
    fontSize: 9,
    fontWeight: '800',
  },

  statBadgeTextNeutral: {
    color: '#737D87',
  },

  statBadgeTextAlert: {
    color: '#C95F47',
  },

  twoColumn: {
    marginTop: 12,
    gap: 12,
  },

  twoColumnWide: {
    flexDirection: 'row',
  },

  panel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 18,
    padding: 18,
  },

  panelLarge: {
    flex: 1,
  },

  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },

  panelTitle: {
    color: '#202832',
    fontSize: 15,
    fontWeight: '800',
  },

  panelSubtitle: {
    color: '#969EA7',
    fontSize: 10,
    marginTop: 3,
  },

  countBadge: {
    minWidth: 27,
    height: 27,
    borderRadius: 9,
    backgroundColor: '#FFF1ED',
    alignItems: 'center',
    justifyContent: 'center',
  },

  countBadgeText: {
    color: '#C95F47',
    fontSize: 10,
    fontWeight: '800',
  },

  activityLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#EEF7F3',
  },

  activityLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#3FA77C',
  },

  activityLiveText: {
    color: '#3B8C6B',
    fontSize: 8,
    fontWeight: '800',
  },

  attentionRow: {
    minHeight: 62,
    borderTopWidth: 1,
    borderTopColor: '#EFF1F3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  attentionIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#FFF1ED',
    alignItems: 'center',
    justifyContent: 'center',
  },

  attentionIconText: {
    color: '#C95F47',
    fontWeight: '900',
  },

  rowContent: {
    flex: 1,
  },

  attentionName: {
    color: '#303942',
    fontSize: 11,
    fontWeight: '800',
  },

  attentionReason: {
    color: '#8E969F',
    fontSize: 10,
    marginTop: 3,
  },

  rowEnd: {
    alignItems: 'flex-end',
  },

  priority: {
    color: '#C95F47',
    fontSize: 9,
    fontWeight: '800',
  },

  chevronRight: {
    color: '#A7AEB5',
    fontSize: 18,
    marginTop: 1,
  },

  panelLink: {
    marginTop: 7,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#EFF1F3',
  },

  panelLinkText: {
    color: '#137A82',
    fontSize: 10,
    fontWeight: '800',
  },

  activityRow: {
    minHeight: 62,
    borderTopWidth: 1,
    borderTopColor: '#EFF1F3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },

  activityStatus: {
    width: 31,
    height: 31,
    borderRadius: 10,
    backgroundColor: '#EAF4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  activityResolved: {
    backgroundColor: '#EEF7F3',
  },

  activityAttention: {
    backgroundColor: '#FFF1ED',
  },

  activityStatusText: {
    color: '#137A82',
    fontSize: 13,
    fontWeight: '900',
  },

  activityName: {
    color: '#303942',
    fontSize: 11,
    fontWeight: '800',
  },

  activityDetail: {
    color: '#8E969F',
    fontSize: 10,
    marginTop: 3,
  },

  activityTime: {
    color: '#A0A7AE',
    fontSize: 9,
  },

  automationStrip: {
    marginTop: 18,
    padding: 18,
    borderRadius: 17,
    backgroundColor: '#EAF4F5',
    borderWidth: 1,
    borderColor: '#D9EAEC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },

  automationIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#137A82',
    alignItems: 'center',
    justifyContent: 'center',
  },

  automationIconText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },

  automationCopy: {
    flex: 1,
  },

  automationTitle: {
    color: '#155E65',
    fontSize: 13,
    fontWeight: '800',
  },

  automationText: {
    color: '#58777A',
    fontSize: 10,
    lineHeight: 16,
    marginTop: 3,
  },

  automationButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CFE2E4',
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },

  automationButtonText: {
    color: '#137A82',
    fontSize: 10,
    fontWeight: '800',
  },
});