// @ts-nocheck
/**
 * AI Employees screen — each campaign record is surfaced as an AI Employee.
 * Includes creation modal (Fix 2), corrected empty state (Fix 3),
 * and standardised "AI Employees" terminology (Fix 1).
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
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
          accessibilityLabel={isActive ? 'Pause AI employee' : 'Resume AI employee'}
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
          accessibilityLabel="Test this AI employee"
        >
          <Text style={styles.actionBtnTextOutline}>⚡ Test</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.75 }]}
          onPress={(e) => { e.stopPropagation?.(); onPress(); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityLabel="View employee details"
        >
          <Text style={styles.actionBtnTextOutline}>Details</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ─── Employee Templates ───────────────────────────────────────────────────────

type EmployeeTemplate = {
  id: string;
  label: string;
  tagline: string;
  icon: string;
  defaultName: string;
  role: string;
  description: string;
};

const EMPLOYEE_TEMPLATES: EmployeeTemplate[] = [
  {
    id: 'sales_rep',
    label: 'Sales Representative',
    tagline: 'Qualifies leads and follows up with prospects.',
    icon: '◈',
    defaultName: 'Sales Rep',
    role: 'Sales representative',
    description: 'You are a professional sales representative. Your job is to qualify inbound leads by asking about their needs, budget, and timeline. Be friendly, listen carefully, and identify whether the prospect is a good fit. Summarise what you learn and flag any qualified leads for follow-up.',
  },
  {
    id: 'customer_support',
    label: 'Customer Support',
    tagline: 'Handles customer questions and common requests.',
    icon: '◎',
    defaultName: 'Support Agent',
    role: 'Customer support specialist',
    description: 'You are a customer support specialist. Your job is to answer customer questions, resolve common issues, and ensure the customer feels heard and helped. Be polite and empathetic. Escalate to a human agent if the issue cannot be resolved on the call.',
  },
  {
    id: 'payment_followup',
    label: 'Payment Follow-Up',
    tagline: 'Follows up with customers about outstanding payments.',
    icon: '₦',
    defaultName: 'Payment Agent',
    role: 'Payment follow-up specialist',
    description: 'You are a payment follow-up specialist. Your job is to contact customers about outstanding payments, understand their situation, and find a path to resolution. Be firm but empathetic. Ask about payment status, expected dates, and any challenges the customer is facing.',
  },
  {
    id: 'appointment',
    label: 'Appointment Assistant',
    tagline: 'Confirms and follows up on appointments.',
    icon: '◷',
    defaultName: 'Appointment Agent',
    role: 'Appointment confirmation assistant',
    description: 'You are an appointment confirmation assistant. Your job is to confirm upcoming appointments, check whether the customer can attend, and reschedule if needed. Be efficient and friendly. Record the confirmed time and flag any cancellations for the team.',
  },
  {
    id: 'lead_qualifier',
    label: 'Lead Qualifier',
    tagline: 'Calls leads and identifies qualified prospects.',
    icon: '↗',
    defaultName: 'Lead Qualifier',
    role: 'Lead qualification specialist',
    description: 'You are a lead qualification specialist. Your job is to call leads, introduce the business, and ask a short set of qualifying questions to determine whether the lead is ready to move forward. Record key information and classify the lead as hot, warm, or cold based on what you learn.',
  },
  {
    id: 'custom',
    label: 'Custom Employee',
    tagline: 'Start from scratch.',
    icon: '+',
    defaultName: '',
    role: '',
    description: '',
  },
];

// ─── Create Employee Modal ────────────────────────────────────────────────────
// Two-step flow: (1) pick a template, (2) edit + save the pre-filled form.

function CreateEmployeeModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (employee: Employee) => void;
}) {
  // 'template' = template picker step, 'form' = edit + save step
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<any>(null);

  // Reset to template picker each time the modal opens
  useEffect(() => {
    if (visible) {
      setStep('template');
      setName('');
      setRole('');
      setDescription('');
      setSaving(false);
    }
  }, [visible]);

  // Focus name field when entering form step
  useEffect(() => {
    if (step === 'form') {
      setTimeout(() => nameRef.current?.focus(), 200);
    }
  }, [step]);

  const selectTemplate = (tpl: EmployeeTemplate) => {
    setName(tpl.defaultName);
    setRole(tpl.role);
    setDescription(tpl.description);
    setStep('form');
  };

  const canSave = name.trim().length > 0 && role.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const session = await ensureSession();
      if (!session) throw new Error('Session expired — please sign in again.');

      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          owner_id: session.user.id,
          name: name.trim(),
          objective: role.trim(),
          description: description.trim() || null,
          status: 'draft',
        })
        .select('id, name, objective, description, status')
        .single();

      if (error) throw error;

      onCreated({
        id: data.id,
        name: data.name,
        role: data.objective || data.description || 'AI Call Assistant',
        status: campaignToStatus(data.status),
        callsTotal: 0,
        callsToday: 0,
        completedCalls: 0,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create AI employee.';
      Alert.alert('Could not create AI employee', msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalCard}>

          {/* ── STEP 1: Template picker ───────────────────────── */}
          {step === 'template' && (
            <>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Create an AI employee</Text>
                  <Text style={styles.modalSubtitle}>
                    Start with a template or build your own.
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  style={styles.modalClose}
                  accessibilityLabel="Close"
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </Pressable>
              </View>

              {/* Template grid */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.templateGrid}
                keyboardShouldPersistTaps="handled"
              >
                {EMPLOYEE_TEMPLATES.map((tpl) => {
                  const isCustom = tpl.id === 'custom';
                  return (
                    <Pressable
                      key={tpl.id}
                      onPress={() => selectTemplate(tpl)}
                      style={({ pressed }) => [
                        styles.templateCard,
                        isCustom && styles.templateCardCustom,
                        pressed && { opacity: 0.8 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${tpl.label} template`}
                    >
                      <View style={[styles.templateIcon, isCustom && styles.templateIconCustom]}>
                        <Text style={[styles.templateIconText, isCustom && styles.templateIconTextCustom]}>
                          {tpl.icon}
                        </Text>
                      </View>
                      <View style={styles.templateBody}>
                        <Text style={[styles.templateLabel, isCustom && styles.templateLabelCustom]}>
                          {tpl.label}
                        </Text>
                        <Text style={styles.templateTagline}>{tpl.tagline}</Text>
                      </View>
                      <Text style={styles.templateChevron}>›</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </>
          )}

          {/* ── STEP 2: Edit + save form ──────────────────────── */}
          {step === 'form' && (
            <>
              {/* Header — back button instead of close */}
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={() => setStep('template')}
                  style={styles.modalBack}
                  accessibilityLabel="Back to templates"
                >
                  <Text style={styles.modalBackText}>‹ Back</Text>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Configure employee</Text>
                  <Text style={styles.modalSubtitle}>
                    Edit the details — everything can be changed.
                  </Text>
                </View>
                <Pressable
                  onPress={onClose}
                  style={styles.modalClose}
                  accessibilityLabel="Close"
                >
                  <Text style={styles.modalCloseText}>×</Text>
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                {/* Name */}
                <Text style={styles.modalLabel}>EMPLOYEE NAME</Text>
                <TextInput
                  ref={nameRef}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g. Ada, Recovery Agent 1"
                  placeholderTextColor={Colors.inkFaint}
                  style={styles.modalInput}
                  autoCapitalize="words"
                  returnKeyType="next"
                  maxLength={60}
                />

                {/* Role */}
                <Text style={styles.modalLabel}>JOB / ROLE</Text>
                <Text style={styles.modalHint}>What does this AI employee handle on every call?</Text>
                <TextInput
                  value={role}
                  onChangeText={setRole}
                  placeholder="e.g. Payment follow-up specialist"
                  placeholderTextColor={Colors.inkFaint}
                  style={styles.modalInput}
                  autoCapitalize="sentences"
                  returnKeyType="next"
                  maxLength={120}
                />

                {/* Instructions */}
                <Text style={styles.modalLabel}>INSTRUCTIONS <Text style={styles.optionalLabel}>(optional)</Text></Text>
                <Text style={styles.modalHint}>
                  Background context the AI should know — your business name, tone, and any specific guidance.
                </Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="e.g. You represent Lekki Finance. Always be polite and empathetic."
                  placeholderTextColor={Colors.inkFaint}
                  style={[styles.modalInput, styles.modalTextarea]}
                  autoCapitalize="sentences"
                  multiline
                  numberOfLines={4}
                  maxLength={600}
                />

                {/* Draft note */}
                <View style={styles.draftNote}>
                  <Text style={styles.draftNoteText}>
                    ◉ Saved as Draft — voice configuration is set up separately after creation.
                  </Text>
                </View>

                {/* Actions */}
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setStep('template')}
                    style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
                    disabled={saving}
                  >
                    <Text style={styles.modalCancelText}>← Back</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleSave}
                    disabled={!canSave || saving}
                    style={({ pressed }) => [
                      styles.modalSave,
                      (!canSave || saving) && styles.modalSaveDisabled,
                      pressed && canSave && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.modalSaveText, (!canSave || saving) && styles.modalSaveTextDisabled]}>
                      {saving ? 'Creating…' : 'Create AI employee →'}
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </>
          )}

        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TeamScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [createVisible, setCreateVisible] = useState(false);

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
      console.error('[AI Employees] load error:', err);
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

  const handleCreated = (employee: Employee) => {
    setEmployees((prev) => [employee, ...prev]);
    // Navigate straight to the new employee's detail screen
    router.push(`/employee/${employee.id}` as any);
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
            <Text style={styles.title}>AI Employees</Text>
            {!isMobile && (
              <Text style={styles.subtitle}>
                Each AI employee handles a specific customer-care role on your behalf — calls, follow-ups, and escalations.
              </Text>
            )}
          </View>
          <View style={styles.headerRight}>
            {activeCount > 0 && (
              <View style={styles.activePill}>
                <View style={styles.activePillDot} />
                <Text style={styles.activePillText}>{activeCount} active</Text>
              </View>
            )}
            {/* Fix 1: always-visible "New AI employee" button */}
            <Pressable
              style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setCreateVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Create a new AI employee"
            >
              <Text style={styles.createBtnText}>+ New employee</Text>
            </Pressable>
          </View>
        </View>

        {/* ── TEAM LIST ────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Loading AI employees…</Text>
          </View>
        ) : employees.length === 0 ? (
          // Fix 3: corrected empty state — CTA starts creation, not a misdirect
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconWrap}>
              <Text style={styles.emptyIcon}>◉</Text>
            </View>
            <Text style={styles.emptyTitle}>Create your first AI employee</Text>
            <Text style={styles.emptyBody}>
              Give it a name, define its job, and deploy it to handle customer calls automatically — collecting information, following up, and surfacing what needs your attention.
            </Text>
            <Pressable
              style={styles.emptyBtn}
              onPress={() => setCreateVisible(true)}
              accessibilityLabel="Create first AI employee"
            >
              <Text style={styles.emptyBtnText}>Create AI employee →</Text>
            </Pressable>
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
            {/* Add another employee */}
            <Pressable
              style={styles.addCard}
              onPress={() => setCreateVisible(true)}
              accessibilityLabel="Create a new AI employee"
            >
              <Text style={styles.addCardIcon}>+</Text>
              <Text style={styles.addCardText}>New AI employee</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Creation modal */}
      <CreateEmployeeModal
        visible={createVisible}
        onClose={() => setCreateVisible(false)}
        onCreated={handleCreated}
      />
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
    maxWidth: undefined,
    alignSelf: 'stretch',
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
  headerRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
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
  createBtn: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignSelf: 'flex-start',
  },
  createBtnText: {
    color: Colors.surface,
    fontSize: 12,
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
    maxWidth: 320,
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

  // ── Creation modal ────────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26,26,26,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: 24,
    paddingBottom: 36,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    gap: 12,
  },
  modalTitle: {
    color: Colors.ink,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 3,
  },
  modalSubtitle: {
    color: Colors.inkMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.ivoryDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: Colors.inkMuted,
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '400',
  },
  modalLabel: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  modalHint: {
    color: Colors.inkMuted,
    fontSize: 12,
    marginBottom: 6,
    marginTop: -4,
  },
  optionalLabel: {
    color: Colors.inkFaint,
    fontWeight: '400',
    fontSize: 9,
    letterSpacing: 0,
    textTransform: 'lowercase',
  },
  modalInput: {
    backgroundColor: Colors.ivoryDeep,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.ink,
    fontSize: 14,
    marginBottom: 14,
  },
  modalTextarea: {
    minHeight: 96,
    textAlignVertical: 'top',
    paddingTop: 12,
    marginBottom: 16,
  },

  // Draft note
  draftNote: {
    backgroundColor: Colors.ivoryDeep,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  draftNoteText: {
    color: Colors.inkMuted,
    fontSize: 11,
    lineHeight: 16,
  },

  // Back button inside form step header
  modalBack: {
    paddingRight: 10,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  modalBackText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },

  // ── Template picker ───────────────────────────────────────────────────────
  templateGrid: {
    gap: 8,
    paddingBottom: 4,
  },
  templateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.ivoryDeep,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  templateCardCustom: {
    borderStyle: 'dashed',
    backgroundColor: Colors.surface,
  },
  templateIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    backgroundColor: Colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  templateIconCustom: {
    backgroundColor: Colors.neutralLight,
  },
  templateIconText: {
    color: Colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  templateIconTextCustom: {
    color: Colors.neutral,
  },
  templateBody: {
    flex: 1,
  },
  templateLabel: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  templateLabelCustom: {
    color: Colors.inkMuted,
  },
  templateTagline: {
    color: Colors.inkMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  templateChevron: {
    color: Colors.inkFaint,
    fontSize: 20,
  },

  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    backgroundColor: Colors.ivoryDeep,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modalCancelText: {
    color: Colors.inkMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  modalSave: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: Radius.md,
    alignItems: 'center',
    backgroundColor: Colors.accent,
  },
  modalSaveDisabled: {
    backgroundColor: Colors.neutralLight,
  },
  modalSaveText: {
    color: Colors.surface,
    fontSize: 14,
    fontWeight: '700',
  },
  modalSaveTextDisabled: {
    color: Colors.inkFaint,
  },
});
