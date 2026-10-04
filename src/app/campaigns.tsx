// @ts-nocheck
/**
 * Team screen — AI employees backed by campaigns data.
 * Each campaign is presented as an AI employee, not a campaign workflow.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
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

// ─── Types ────────────────────────────────────────────────────────────────────

type Employee = {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'paused' | 'draft' | 'completed';
  callsTotal: number;
  callsToday: number;
  completedCalls: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const statusLabel = (status: Employee['status']) => {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Paused';
  if (status === 'completed') return 'Completed';
  return 'Draft';
};

const campaignToStatus = (s: string): Employee['status'] => {
  if (s === 'active') return 'active';
  if (s === 'paused') return 'paused';
  if (s === 'completed') return 'completed';
  return 'draft';
};

// ─── Employee Card ────────────────────────────────────────────────────────────

function EmployeeCard({
  emp,
  onPress,
  onToggle,
}: {
  emp: Employee;
  onPress: () => void;
  onToggle: () => void;
}) {
  const isActive = emp.status === 'active';

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={emp.name}
    >
      {/* Top row */}
      <View style={styles.cardTop}>
        <View style={[styles.avatar, isActive && styles.avatarActive]}>
          <Text style={[styles.avatarText, isActive && styles.avatarTextActive]}>
            {emp.name.slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{emp.name}</Text>
          <Text style={styles.cardRole} numberOfLines={1}>{emp.role}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, isActive ? styles.dotActive : styles.dotPaused]} />
            <Text style={[styles.statusText, isActive ? styles.statusTextActive : styles.statusTextPaused]}>
              {statusLabel(emp.status)}
            </Text>
          </View>
        </View>
        <Text style={styles.cardChevron}>›</Text>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{emp.callsTotal}</Text>
          <Text style={styles.statLabel}>Total calls</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statValue, emp.callsToday > 0 && styles.statValueGood]}>
            {emp.callsToday}
          </Text>
          <Text style={styles.statLabel}>Today</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{emp.completedCalls}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.cardActions}>
        <Pressable
          style={({ pressed }) => [
            styles.actionBtn,
            isActive ? styles.actionBtnPause : styles.actionBtnResume,
            pressed && { opacity: 0.75 },
          ]}
          onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel={isActive ? 'Pause employee' : 'Resume employee'}
        >
          <Text style={[styles.actionBtnText, isActive ? styles.actionBtnTextPause : styles.actionBtnTextResume]}>
            {isActive ? '⏸ Pause' : '▶ Resume'}
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.75 }]}
          onPress={(e) => {
            e.stopPropagation?.();
            router.push({ pathname: '/call-instruction' as any, params: { employeeId: emp.id } });
          }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="Test employee"
        >
          <Text style={styles.actionBtnTextOutline}>⚡ Test</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.75 }]}
          onPress={(e) => { e.stopPropagation?.(); onPress(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="View details"
        >
          <Text style={styles.actionBtnTextOutline}>Details</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TeamScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTeam = async () => {
    try {
      await ensureSession();

      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, name, description, objective, status, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;

      if (!campaigns || campaigns.length === 0) {
        setEmployees([]);
        return;
      }

      // Fetch call stats for all campaigns in one query
      const { data: calls } = await supabase
        .from('calls')
        .select('id, status, created_at, campaign_id')
        .in('campaign_id', campaigns.map((c) => c.id))
        .order('created_at', { ascending: false });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const list: Employee[] = campaigns.map((campaign) => {
        const campaignCalls = (calls ?? []).filter((c) => c.campaign_id === campaign.id);
        const todayCalls = campaignCalls.filter((c) => new Date(c.created_at) >= today);
        const completedCalls = campaignCalls.filter((c) => c.status === 'completed');

        return {
          id: campaign.id,
          name: campaign.name || 'Unnamed',
          role: campaign.objective || campaign.description || 'AI Call Assistant',
          status: campaignToStatus(campaign.status),
          callsTotal: campaignCalls.length,
          callsToday: todayCalls.length,
          completedCalls: completedCalls.length,
        };
      });

      setEmployees(list);
    } catch (err) {
      console.error('[Team] load error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { loadTeam(); }, []);

  const onRefresh = () => { setRefreshing(true); loadTeam(); };

  const handleToggle = async (emp: Employee) => {
    const newStatus = emp.status === 'active' ? 'paused' : 'active';
    const verb = newStatus === 'active' ? 'Resume' : 'Pause';

    Alert.alert(
      `${verb} ${emp.name}?`,
      `This will ${verb.toLowerCase()} this AI employee.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: verb,
          style: newStatus === 'active' ? 'default' : 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('campaigns')
              .update({ status: newStatus })
              .eq('id', emp.id);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              setEmployees((prev) =>
                prev.map((e) => e.id === emp.id ? { ...e, status: newStatus } : e)
              );
            }
          },
        },
      ]
    );
  };

  const activeCount = employees.filter((e) => e.status === 'active').length;

  return (
    <AppShell scrollable={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />
        }
      >
        {/* ── HEADER ───────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>AI WORKFORCE</Text>
            <Text style={styles.title}>Your Team</Text>
            {!isMobile && (
              <Text style={styles.subtitle}>
                Manage your AI employees — each one handles a specific customer-care role on your behalf.
              </Text>
            )}
          </View>
          {activeCount > 0 && (
            <View style={styles.activePill}>
              <View style={styles.activePillDot} />
              <Text style={styles.activePillText}>{activeCount} active</Text>
            </View>
          )}
        </View>

        {/* ── TEAM LIST ────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading team…</Text>
          </View>
        ) : employees.length === 0 ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>◉</Text>
            </View>
            <Text style={styles.emptyTitle}>No AI employees yet</Text>
            <Text style={styles.emptyBody}>
              Create your first AI employee. They'll handle customer calls, follow-ups, and surface what needs your attention.
            </Text>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => Alert.alert(
                'Coming soon',
                'Full employee creation is coming soon. For now, use Customers → Use a call template to run directed calls.'
              )}
              accessibilityLabel="Create AI employee"
            >
              <Text style={styles.emptyBtnText}>+ Create AI employee</Text>
            </Pressable>
            <Text style={styles.emptyHint}>
              Tip: Use the Customers tab to run a directed call right now.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {employees.map((emp) => (
              <EmployeeCard
                key={emp.id}
                emp={emp}
                onPress={() => router.push(`/employee/${emp.id}` as any)}
                onToggle={() => handleToggle(emp)}
              />
            ))}
            {/* Add employee CTA */}
            <Pressable
              style={styles.addCard}
              onPress={() => Alert.alert(
                'Coming soon',
                'Full employee creation is coming soon. For now, use Customers → Use a call template to run directed calls.'
              )}
              accessibilityLabel="Add AI employee"
            >
              <Text style={styles.addCardIcon}>+</Text>
              <Text style={styles.addCardText}>Add AI employee</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </AppShell>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 24,
    paddingBottom: 60,
    maxWidth: 780,
    width: '100%',
    alignSelf: 'center',
  },
  contentMobile: {
    padding: 16,
    paddingBottom: 100,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 12,
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  title: {
    color: Colors.ink,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: Colors.inkMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.positiveLight,
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  activePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.positive,
  },
  activePillText: {
    color: Colors.positive,
    fontSize: 11,
    fontWeight: '700',
  },

  // List
  list: { gap: 12 },

  // Employee card
  card: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 16,
    ...Shadow.subtle,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.neutralLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActive: { backgroundColor: Colors.accentLight },
  avatarText: {
    color: Colors.neutral,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  avatarTextActive: { color: Colors.accent },
  cardInfo: { flex: 1 },
  cardName: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  cardRole: {
    color: Colors.inkMuted,
    fontSize: 12,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: { backgroundColor: Colors.positive },
  dotPaused: { backgroundColor: Colors.neutral },
  statusText: { fontSize: 11, fontWeight: '600' },
  statusTextActive: { color: Colors.positive },
  statusTextPaused: { color: Colors.neutral },
  cardChevron: {
    color: Colors.inkFaint,
    fontSize: 22,
    marginTop: 2,
  },

  // Stats strip
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.ivoryDeep,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 0,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: Colors.border,
  },
  statValue: {
    color: Colors.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  statValueGood: { color: Colors.positive },
  statLabel: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: Radius.md,
    alignItems: 'center',
    minHeight: 40,
    justifyContent: 'center',
  },
  actionBtnPause: {
    backgroundColor: Colors.attentionLight,
    borderWidth: 1,
    borderColor: '#F0CEC7',
  },
  actionBtnResume: {
    backgroundColor: Colors.accentLight,
    borderWidth: 1,
    borderColor: '#BEE3E6',
  },
  actionBtnOutline: {
    backgroundColor: Colors.ivoryDeep,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  actionBtnTextPause: { color: Colors.attention },
  actionBtnTextResume: { color: Colors.accentText },
  actionBtnTextOutline: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: '600',
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.lg,
    padding: 28,
    alignItems: 'center',
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    backgroundColor: Colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIcon: {
    color: Colors.accent,
    fontSize: 26,
  },
  emptyTitle: {
    color: Colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    color: Colors.inkMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 300,
  },
  emptyText: {
    color: Colors.inkFaint,
    fontSize: 13,
  },
  emptyBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginBottom: 12,
  },
  emptyBtnText: {
    color: Colors.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  emptyHint: {
    color: Colors.inkFaint,
    fontSize: 11,
    textAlign: 'center',
  },

  // Add card
  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    paddingVertical: 16,
  },
  addCardIcon: {
    color: Colors.inkFaint,
    fontSize: 20,
    fontWeight: '300',
  },
  addCardText: {
    color: Colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
  },
});
