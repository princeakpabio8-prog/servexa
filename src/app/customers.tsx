import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Modal,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions
} from 'react-native';
import { ensureSession, supabase } from '../lib/supabase';

type CustomerStatus = 'Active' | 'Follow-up' | 'Attention' | 'Resolved';

type Customer = {
  id: string;
  uuid?: string; // Database UUID for Edge Function
  initials: string;
  name: string;
  phone: string;
  reason: string;
  amount: string;
  nextAction: string;
  status: CustomerStatus;
  lastContact: string;
};

type CustomerActivity = {
  id: string;
  call_id?: string;
  activity_type: string;
  title: string;
  description?: string;
  created_at: string;
};

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};
const filters = ['All', 'Active', 'Follow-up', 'Attention', 'Resolved'];

// Kept in sync with the template ids/names defined in call-instruction.tsx
const QUICK_TEMPLATES = [
  { id: 'loan_recovery', name: 'Loan Recovery' },
  { id: 'payment_reminder', name: 'Payment Reminder' },
  { id: 'payment_confirmation', name: 'Payment Confirmation' },
  { id: 'customer_followup', name: 'Customer Follow-up' },
  { id: 'repayment_assistance', name: 'Repayment Assistance' },
  { id: 'account_inquiry', name: 'Account Inquiry' },
];

const nav = [
  ['⌂', 'Overview', '/'],
  ['◎', 'Customers', '/customers'],
  ['◫', 'Campaigns', '/campaigns'],
  ['◷', 'Activity', '/activity'],
  ['⚙', 'Settings', '/settings'],
] as const;

export default function CustomersScreen() {
  const { width } = useWindowDimensions();
  const isWide = width >= 900;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [followUpVisible, setFollowUpVisible] = useState(false);
  const [followUpTime, setFollowUpTime] = useState('');
  const [callLoading, setCallLoading] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [manualCallLoading, setManualCallLoading] = useState(false);
  const [addCustomerVisible, setAddCustomerVisible] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerReason, setNewCustomerReason] = useState('');
  const [newCustomerAmount, setNewCustomerAmount] = useState('');
  const [newCustomerTemplate, setNewCustomerTemplate] = useState<string | null>(null);
  const [customerActivities, setCustomerActivities] = useState<CustomerActivity[]>([]);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!selected?.uuid) {
      setCustomerActivities([]);
      return;
    }

    const fetchCustomerActivities = async () => {
      const { data, error } = await supabase
        .from('activities')
        .select('id, call_id, activity_type, title, description, created_at')
        .eq('customer_id', selected.uuid)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Failed to fetch customer activity:', error);
        return;
      }

      setCustomerActivities(data ?? []);
    };

    fetchCustomerActivities();
  }, [selected?.uuid]);

  const fetchCustomers = async () => {
    try {
      await ensureSession();

      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, status, created_at')
        .order('name', { ascending: true });

      if (error) throw error;

      const formattedCustomers = (data || []).map((c: any) => ({
        id: c.id,
        uuid: c.id,
        initials: getInitials(c.name),
        name: c.name,
        phone: c.phone,
        reason: 'No case note',
        amount: '—',
        nextAction: 'No action scheduled',
        status: c.status === 'blocked' ? 'Attention' : c.status === 'inactive' ? 'Resolved' : 'Active' as CustomerStatus,
        lastContact: 'No recorded call',
      }));

      setCustomers(formattedCustomers);
    } catch (err) {
      console.error('Failed to fetch customers:', err);
      Alert.alert('Error', 'Failed to load customers from database');
    } finally {
      setLoading(false);
    }
  };

  const normalizePhoneForCall = (raw: string) => {
    const cleaned = raw.replace(/\s+/g, '').replace(/[^\d+]/g, '');

    if (!cleaned) return '';
    if (!cleaned.startsWith('+')) return `+${cleaned.replace(/\+/g, '')}`;

    return cleaned;
  };

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesFilter =
        filter === 'All' || customer.status === filter;

      const matchesSearch =
        !query ||
        customer.name.toLowerCase().includes(query) ||
        customer.phone.toLowerCase().includes(query) ||
        customer.reason.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [customers, filter, search]);

  const goTo = (path: string) => {
    router.push(path as any);
  };

  const getInitials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || 'CU';

  const addCustomer = async () => {
    const cleanName = newCustomerName.trim();
    const cleanPhone = normalizePhoneForCall(newCustomerPhone);
    const cleanReason = newCustomerReason.trim() || 'Customer follow-up';
    const cleanAmount = newCustomerAmount.trim() || '—';

    if (!cleanName || !cleanPhone) {
      Alert.alert('Add customer', 'Please enter a customer name and phone number.');
      return;
    }

    try {
      const session = await ensureSession();
      if (!session) throw new Error('Unable to authenticate session');

      const { data, error } = await supabase
        .from('customers')
        .insert({
          owner_id: session.user.id,
          name: cleanName,
          phone: cleanPhone,
        })
        .select('id, name, phone')
        .single();

      if (error) throw error;

      const newCustomer: Customer = {
        id: data.id,
        uuid: data.id,
        initials: getInitials(cleanName),
        name: data.name,
        phone: data.phone,
        reason: cleanReason,
        amount: cleanAmount,
        nextAction: 'Today, 2:00 PM',
        status: 'Follow-up',
        lastContact: 'Just now',
      };

      setCustomers((current) => [newCustomer, ...current]);
      setSelected(newCustomer);

      const chosenTemplate = newCustomerTemplate;

      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerReason('');
      setNewCustomerAmount('');
      setNewCustomerTemplate(null);
      setAddCustomerVisible(false);

      if (chosenTemplate) {
        router.push({
          pathname: '/call-instruction' as any,
          params: {
            customerId: newCustomer.uuid,
            customerName: newCustomer.name,
            customerPhone: newCustomer.phone,
            templateId: chosenTemplate,
          },
        });
      } else {
        Alert.alert('Customer added', `${cleanName} was added and is ready for testing.`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unable to add customer.';
      Alert.alert('Add customer failed', errorMsg);
    }
  };

  const callCustomer = async () => {
    if (!selected) return;

    const customerUuid = selected.uuid;
    const phoneForCall = normalizePhoneForCall(selected.phone);

    if (!customerUuid && !phoneForCall) {
      Alert.alert(
        'Unable to place AI call',
        `${selected.name} is not yet connected to the system. Only certain customers can receive AI calls at this time.`
      );
      return;
    }

    setCallLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        'start-customer-call',
        {
          body: customerUuid
            ? {
                customer_id: customerUuid,
                task: `You are SERVEXA Customer Care. Call ${selected.name} regarding ${selected.reason}.`,
              }
            : {
                phone: phoneForCall,
                customer_name: selected.name,
                task: `You are SERVEXA Customer Care. Call ${selected.name} regarding ${selected.reason}.`,
              },
        }
      );

      if (error) {
        throw error;
      }

      Alert.alert(
        'Call initiated',
        `AI call started with ${selected.name}. Call ID: ${data?.servexa_call_id?.slice(0, 8)}...`
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error
          ? err.message
          : 'Unable to start the call. Please try again.';

      Alert.alert(
        'Call failed',
        errorMsg
      );
    } finally {
      setCallLoading(false);
    }
  };

  const testManualCall = async () => {
    const normalizedPhone = normalizePhoneForCall(manualPhone);

    if (!normalizedPhone) {
      Alert.alert('Enter a valid phone number', 'Use a format like +12025550100.');
      return;
    }

    setManualCallLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('start-customer-call', {
        body: {
          phone: normalizedPhone,
          customer_name: 'Manual test customer',
          task: 'This is a live SERVEXA test call to validate the phone connection.',
        },
      });

      if (error) {
        throw error;
      }

      Alert.alert(
        'Manual test call started',
        `Call queued for ${normalizedPhone}. ID: ${data?.servexa_call_id?.slice(0, 8)}...`
      );
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : 'Unable to start the manual test call.';

      Alert.alert('Manual test failed', errorMsg);
    } finally {
      setManualCallLoading(false);
    }
  };

  const openFollowUp = () => {
    setFollowUpTime(selected?.nextAction ?? '');
    setFollowUpVisible(true);
  };

  const scheduleFollowUp = () => {
    if (!selected) return;

    const nextAction = followUpTime.trim();

    if (!nextAction) {
      Alert.alert(
        'Choose a follow-up time',
        'Enter when the customer should be contacted again.'
      );
      return;
    }

    setSelected({
      ...selected,
      nextAction,
    });
    setFollowUpVisible(false);

    Alert.alert(
      'Follow-up scheduled',
      `${selected.name} is scheduled for ${nextAction}.`
    );
  };

  const renderAddCustomerModal = () => (
    <Modal
      visible={addCustomerVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setAddCustomerVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Add customer</Text>
              <Text style={styles.modalSubtitle}>
                Add a customer and test a live phone call immediately.
              </Text>
            </View>

            <Pressable
              onPress={() => setAddCustomerVisible(false)}
              style={styles.modalClose}
            >
              <Text style={styles.modalCloseText}>×</Text>
            </Pressable>
          </View>

          <Text style={styles.modalLabel}>FULL NAME</Text>
          <TextInput
            value={newCustomerName}
            onChangeText={setNewCustomerName}
            placeholder="e.g. Ada Okafor"
            placeholderTextColor="#A0A7AE"
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>PHONE NUMBER</Text>
          <TextInput
            value={newCustomerPhone}
            onChangeText={setNewCustomerPhone}
            placeholder="+12025550100"
            placeholderTextColor="#A0A7AE"
            keyboardType="phone-pad"
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>REASON</Text>
          <TextInput
            value={newCustomerReason}
            onChangeText={setNewCustomerReason}
            placeholder="Customer follow-up"
            placeholderTextColor="#A0A7AE"
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>AMOUNT</Text>
          <TextInput
            value={newCustomerAmount}
            onChangeText={setNewCustomerAmount}
            placeholder="₦250,000"
            placeholderTextColor="#A0A7AE"
            style={styles.modalInput}
          />

          <Text style={styles.modalLabel}>CALL TEMPLATE (OPTIONAL)</Text>
          <Text style={styles.modalHint}>
            Pick a template to jump straight into a directed call after saving.
          </Text>
          <View style={styles.templatePickerRow}>
            {QUICK_TEMPLATES.map((template) => {
              const active = newCustomerTemplate === template.id;
              return (
                <Pressable
                  key={template.id}
                  onPress={() =>
                    setNewCustomerTemplate(active ? null : template.id)
                  }
                  style={[
                    styles.templatePill,
                    active && styles.templatePillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.templatePillText,
                      active && styles.templatePillTextActive,
                    ]}
                  >
                    {template.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => setAddCustomerVisible(false)}
              style={({ pressed }) => [
                styles.modalCancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={addCustomer}
              style={({ pressed }) => [
                styles.modalSave,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.modalSaveText}>Add customer</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (selected) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />

        <ScrollView
          contentContainerStyle={styles.profilePage}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => setSelected(null)}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backText}>Customers</Text>
          </Pressable>

          <View style={styles.profileHeader}>
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>
                {selected.initials}
              </Text>
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{selected.name}</Text>
              <Text style={styles.profilePhone}>{selected.phone}</Text>

              <View style={styles.profileStatus}>
                <View style={styles.statusDot} />
                <Text style={styles.profileStatusText}>
                  {selected.status}
                </Text>
              </View>
            </View>

            <Pressable
              onPress={callCustomer}
              disabled={callLoading}
              accessibilityRole="button"
              accessibilityLabel={`Call ${selected.name}`}
              style={({ pressed }) => [
                styles.callButton,
                callLoading && styles.callButtonLoading,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.callButtonIcon}>
                {callLoading ? '⟳' : '◉'}
              </Text>
              <Text style={styles.callButtonText}>
                {callLoading ? 'Calling...' : 'Call customer'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/call-instruction' as any,
                  params: {
                    customerId: selected.uuid ?? '',
                    customerName: selected.name,
                    customerPhone: selected.phone,
                  },
                })
              }
              accessibilityRole="button"
              accessibilityLabel="Create directed call"
              style={({ pressed }) => [
                styles.directedCallButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.directedCallButtonIcon}>✎</Text>
              <Text style={styles.directedCallButtonText}>
                Use a call template
              </Text>
            </Pressable>
          </View>

          <View style={styles.profileGrid}>
            <View style={styles.profileCard}>
              <Text style={styles.cardEyebrow}>ACCOUNT</Text>
              <Text style={styles.cardTitle}>{selected.reason}</Text>
              <Text style={styles.cardLabel}>Amount / value</Text>
              <Text style={styles.cardValue}>{selected.amount}</Text>
            </View>

            <View style={styles.profileCard}>
              <Text style={styles.cardEyebrow}>NEXT ACTION</Text>
              <Text style={styles.cardTitle}>{selected.nextAction}</Text>
              <Text style={styles.cardLabel}>Last contact</Text>
              <Text style={styles.cardValue}>{selected.lastContact}</Text>
            </View>
          </View>

          {__DEV__ && (
            <View style={styles.testCard}>
              <Text style={styles.testCardTitle}>Manual test call</Text>
              <Text style={styles.testCardSubtitle}>
                Enter a phone number to validate the live call connection.
              </Text>

              <TextInput
                value={manualPhone}
                onChangeText={setManualPhone}
                placeholder="+12025550100"
                placeholderTextColor="#A0A7AE"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="phone-pad"
                style={styles.testInput}
              />

              <Pressable
                onPress={testManualCall}
                disabled={manualCallLoading}
                style={({ pressed }) => [
                  styles.testButton,
                  manualCallLoading && styles.callButtonLoading,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.testButtonText}>
                  {manualCallLoading ? 'Testing...' : 'Test call now'}
                </Text>
              </Pressable>
            </View>
          )}

          <View style={styles.timelineCard}>
            <View style={styles.timelineHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  Communication timeline
                </Text>
                <Text style={styles.cardSubtitle}>
                  Every customer interaction in one place
                </Text>
              </View>

              <Pressable
                onPress={openFollowUp}
                accessibilityRole="button"
                accessibilityLabel={`Schedule a follow-up for ${selected.name}`}
                style={({ pressed }) => [
                  styles.secondaryButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.secondaryButtonText}>+ Follow-up</Text>
              </Pressable>
            </View>

            {customerActivities.length === 0 ? (
              <Text style={styles.timelineEmpty}>No recorded interactions yet.</Text>
            ) : customerActivities.map((item, index) => (
              <Pressable
                style={styles.timelineRow}
                key={item.id}
                onPress={() => item.call_id && router.push({ pathname: '/call-detail' as any, params: { callId: item.call_id } })}
              >
                <View style={styles.timelineLine}>
                  <View style={styles.timelineDot} />
                  {index < customerActivities.length - 1 && <View style={styles.timelineConnector} />}
                </View>

                <View style={{ flex: 1, paddingBottom: 22 }}>
                  <View style={styles.timelineTop}>
                    <Text style={styles.timelineType}>{item.activity_type.replace(/_/g, ' ')}</Text>
                    <Text style={styles.timelineTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
                  </View>

                  <Text style={styles.timelineTitle}>{item.title}</Text>
                  <Text style={styles.timelineDetail}>{item.description ?? 'No additional details.'}</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {renderAddCustomerModal()}

          <Modal
            visible={followUpVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setFollowUpVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modalTitle}>Schedule follow-up</Text>
                    <Text style={styles.modalSubtitle}>
                      Set the next time SERVEXA should contact {selected.name}.
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => setFollowUpVisible(false)}
                    style={styles.modalClose}
                  >
                    <Text style={styles.modalCloseText}>×</Text>
                  </Pressable>
                </View>

                <Text style={styles.modalLabel}>NEXT CONTACT</Text>

                <TextInput
                  value={followUpTime}
                  onChangeText={setFollowUpTime}
                  placeholder="e.g. Tomorrow, 10:00 AM"
                  placeholderTextColor="#A0A7AE"
                  style={styles.modalInput}
                />

                <View style={styles.quickOptions}>
                  {['Today, 4:00 PM', 'Tomorrow, 10:00 AM', 'Friday, 9:00 AM'].map(
                    (option) => (
                      <Pressable
                        key={option}
                        onPress={() => setFollowUpTime(option)}
                        style={({ pressed }) => [
                          styles.quickOption,
                          followUpTime === option && styles.quickOptionActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickOptionText,
                            followUpTime === option &&
                              styles.quickOptionTextActive,
                          ]}
                        >
                          {option}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>

                <View style={styles.modalActions}>
                  <Pressable
                    onPress={() => setFollowUpVisible(false)}
                    style={({ pressed }) => [
                      styles.modalCancel,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>

                  <Pressable
                    onPress={scheduleFollowUp}
                    style={({ pressed }) => [
                      styles.modalSave,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.modalSaveText}>
                      Schedule follow-up
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.app}>
        <View style={styles.sidebar}>
          <View>
            <Pressable
              onPress={() => goTo('/')}
              style={({ pressed }) => [
                styles.brandRow,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.brandMark}>
                <Text style={styles.brandMarkText}>S</Text>
              </View>

              <View>
                <Text style={styles.brand}>SERVEXA</Text>
                <Text style={styles.brandSmall}>
                  CUSTOMER OPERATIONS
                </Text>
              </View>
            </Pressable>

            <Text style={styles.workspaceLabel}>WORKSPACE</Text>

            <View style={styles.workspaceMini}>
              <View style={styles.companyAvatar}>
                <Text style={styles.companyAvatarText}>LG</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.companyName}>Lekki Gardens</Text>
                <Text style={styles.companyRole}>Customer Care</Text>
              </View>
            </View>

            <View style={styles.nav}>
              {nav.map(([icon, label, path]) => {
                const active = label === 'Customers';

                return (
                  <Pressable
                    key={label}
                    onPress={() => goTo(path)}
                    style={({ pressed }) => [
                      styles.navItem,
                      active && styles.navItemActive,
                      pressed && styles.navItemPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.navIcon,
                        active && styles.navIconActive,
                      ]}
                    >
                      {icon}
                    </Text>

                    <Text
                      style={[
                        styles.navText,
                        active && styles.navTextActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.sidebarBottom}>
            <View style={styles.planCard}>
              <Text style={styles.planEyebrow}>CURRENT PLAN</Text>
              <Text style={styles.planTitle}>Growth</Text>
              <Text style={styles.planText}>
                Usage is available in Settings
              </Text>

              <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
              </View>

              <Pressable>
                <Text style={styles.upgradeText}>Manage plan →</Text>
              </Pressable>
            </View>

            <Text style={styles.version}>
              SERVEXA v0.1
            </Text>
          </View>
        </View>

        <View style={styles.main}>
          <ScrollView
            contentContainerStyle={[
              styles.content,
              isWide && styles.contentWide,
            ]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>CUSTOMER CARE</Text>
                <Text style={styles.heading}>Customers</Text>
                <Text style={styles.subheading}>
                  Manage relationships, conversations, and next actions.
                </Text>
              </View>

              <Pressable
                onPress={() => setAddCustomerVisible(true)}
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.addButtonPlus}>+</Text>
                <Text style={styles.addButtonText}>
                  Add customer
                </Text>
              </Pressable>
            </View>

            <View style={styles.toolbar}>
              <View style={styles.searchBox}>
                <Text style={styles.searchIcon}>⌕</Text>

                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search customers, phone numbers..."
                  placeholderTextColor="#A0A7AE"
                  style={styles.searchInput}
                />
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterRow}
              >
                {filters.map((item) => (
                  <Pressable
                    key={item}
                    onPress={() => setFilter(item)}
                    style={({ pressed }) => [
                      styles.filter,
                      filter === item && styles.filterActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        filter === item && styles.filterTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            <View style={styles.summaryRow}>
              <Text style={styles.resultText}>
                {filteredCustomers.length} customers
              </Text>

              <Text style={styles.resultHint}>
                Sorted by latest activity
              </Text>
            </View>

            {__DEV__ && (
              <View style={styles.testPanel}>
              <Text style={styles.testPanelTitle}>Live test call</Text>
              <Text style={styles.testPanelSubtitle}>Use a direct phone number to trigger the edge function immediately.</Text>
              <View style={styles.testPanelRow}>
                <TextInput
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  placeholder="+12025550100"
                  placeholderTextColor="#A0A7AE"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="phone-pad"
                  style={styles.testPanelInput}
                />
                <Pressable
                  onPress={testManualCall}
                  disabled={manualCallLoading}
                  style={({ pressed }) => [
                    styles.testPanelButton,
                    manualCallLoading && styles.callButtonLoading,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.testPanelButtonText}>{manualCallLoading ? 'Testing...' : 'Test'}</Text>
                </Pressable>
              </View>
            </View>
            )}

          <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text
                  style={[styles.tableHeaderText, { flex: 2.1 }]}
                >
                  CUSTOMER
                </Text>

                <Text
                  style={[styles.tableHeaderText, { flex: 1.4 }]}
                >
                  REASON
                </Text>

                <Text
                  style={[styles.tableHeaderText, { flex: 1.1 }]}
                >
                  NEXT ACTION
                </Text>

                <Text
                  style={[styles.tableHeaderText, { flex: 0.9 }]}
                >
                  STATUS
                </Text>

                <Text style={{ width: 28 }} />
              </View>

              {loading ? (
                <View style={styles.loadingContainer}>
                  <Text style={styles.loadingText}>Loading customers...</Text>
                </View>
              ) : filteredCustomers.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>No customers found. Create one to get started.</Text>
                </View>
              ) : (
                filteredCustomers.map((customer) => (
                <Pressable
                  key={customer.id}
                  onPress={() => setSelected(customer)}
                  style={({ pressed }) => [
                    styles.tableRow,
                    pressed && styles.tableRowPressed,
                  ]}
                >
                  <View
                    style={[
                      styles.customerCell,
                      { flex: 2.1 },
                    ]}
                  >
                    <View style={styles.customerAvatar}>
                      <Text style={styles.customerAvatarText}>
                        {customer.initials}
                      </Text>
                    </View>

                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerName}>
                        {customer.name}
                      </Text>

                      <Text style={styles.customerPhone}>
                        {customer.phone}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flex: 1.4 }}>
                    <Text style={styles.cellPrimary}>
                      {customer.reason}
                    </Text>
                    <Text style={styles.cellSecondary}>
                      {customer.amount}
                    </Text>
                  </View>

                  <View style={{ flex: 1.1 }}>
                    <Text style={styles.cellPrimary}>
                      {customer.nextAction}
                    </Text>
                    <Text style={styles.cellSecondary}>
                      Last contact {customer.lastContact}
                    </Text>
                  </View>

                  <View style={{ flex: 0.9 }}>
                    <View
                      style={[
                        styles.statusPill,
                        customer.status === 'Attention' &&
                          styles.statusAttention,
                        customer.status === 'Follow-up' &&
                          styles.statusFollow,
                        customer.status === 'Resolved' &&
                          styles.statusResolved,
                      ]}
                    >
                      <View
                        style={[
                          styles.pillDot,
                          customer.status === 'Attention' &&
                            styles.pillDotAttention,
                          customer.status === 'Resolved' &&
                            styles.pillDotResolved,
                        ]}
                      />

                      <Text
                        style={[
                          styles.statusPillText,
                          customer.status === 'Attention' &&
                            styles.statusAttentionText,
                          customer.status === 'Resolved' &&
                            styles.statusResolvedText,
                        ]}
                      >
                        {customer.status}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.rowArrow}>›</Text>
                </Pressable>
              ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>

      {renderAddCustomerModal()}
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

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
  },

  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 10,
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

  brandSmall: {
    color: '#9AA1A9',
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.8,
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

  workspaceMini: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 14,
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

  navItemPressed: {
    opacity: 0.7,
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
    maxWidth: 1380,
    width: '100%',
    alignSelf: 'center',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 18,
  },

  eyebrow: {
    color: '#9AA1A9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },

  heading: {
    color: '#17212B',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 5,
  },

  subheading: {
    color: '#77818B',
    fontSize: 13,
    marginTop: 6,
  },

  addButton: {
    backgroundColor: '#172A3A',
    borderRadius: 12,
    paddingHorizontal: 15,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  addButtonPlus: {
    color: '#FFFFFF',
    fontSize: 17,
  },

  addButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  toolbar: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 16,
    padding: 11,
    gap: 10,
  },

  searchBox: {
    height: 44,
    backgroundColor: '#F6F7F9',
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
  },

  searchIcon: {
    color: '#68737E',
    fontSize: 23,
    marginRight: 8,
  },

  searchInput: {
    flex: 1,
    color: '#252E37',
    fontSize: 12,
  },

  filterRow: {
    gap: 7,
  },

  filter: {
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F6F7',
  },

  filterActive: {
    backgroundColor: '#172A3A',
  },

  filterText: {
    color: '#6E7782',
    fontSize: 10,
    fontWeight: '700',
  },

  filterTextActive: {
    color: '#FFFFFF',
  },

  testPanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 16,
    padding: 14,
    marginTop: 20,
    marginBottom: 10,
  },

  testPanelTitle: {
    color: '#17212B',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },

  testPanelSubtitle: {
    color: '#77818B',
    fontSize: 11,
    marginBottom: 12,
  },

  testPanelRow: {
    flexDirection: 'row',
    gap: 10,
  },

  testPanelInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#DCE1E8',
    borderRadius: 10,
    backgroundColor: '#F6F7F9',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#111827',
  },

  testPanelButton: {
    backgroundColor: '#1173FF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  testPanelButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },

  resultText: {
    color: '#27313A',
    fontSize: 12,
    fontWeight: '800',
  },

  resultHint: {
    color: '#A0A7AE',
    fontSize: 10,
  },

  table: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 18,
    overflow: 'hidden',
  },

  tableHeader: {
    minHeight: 44,
    backgroundColor: '#FAFAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E7E9ED',
    paddingHorizontal: 17,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  tableHeaderText: {
    color: '#9AA1A9',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  tableRow: {
    minHeight: 78,
    paddingHorizontal: 17,
    borderBottomWidth: 1,
    borderBottomColor: '#EFF1F3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  tableRowPressed: {
    backgroundColor: '#F8FAFA',
    opacity: 0.75,
  },

  customerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  customerAvatar: {
    width: 37,
    height: 37,
    borderRadius: 12,
    backgroundColor: '#EAF4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  customerAvatarText: {
    color: '#137A82',
    fontSize: 10,
    fontWeight: '800',
  },

  customerName: {
    color: '#27313A',
    fontSize: 11,
    fontWeight: '800',
  },

  customerPhone: {
    color: '#969EA7',
    fontSize: 9,
    marginTop: 3,
  },

  cellPrimary: {
    color: '#4A555F',
    fontSize: 10,
    fontWeight: '700',
  },

  cellSecondary: {
    color: '#9AA1A9',
    fontSize: 9,
    marginTop: 4,
  },

  statusPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EEF7F3',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },

  statusFollow: {
    backgroundColor: '#EEF4F5',
  },

  statusAttention: {
    backgroundColor: '#FFF1ED',
  },

  statusResolved: {
    backgroundColor: '#F0F1F3',
  },

  pillDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: '#3B8C6B',
  },

  pillDotAttention: {
    backgroundColor: '#C95F47',
  },

  pillDotResolved: {
    backgroundColor: '#7D8790',
  },

  statusPillText: {
    color: '#3B8C6B',
    fontSize: 8,
    fontWeight: '800',
  },

  statusAttentionText: {
    color: '#C95F47',
  },

  statusResolvedText: {
    color: '#69737D',
  },

  rowArrow: {
    width: 18,
    color: '#A5ACB3',
    fontSize: 19,
    textAlign: 'right',
  },

  emptyState: {
    paddingVertical: 55,
    alignItems: 'center',
  },

  emptyIcon: {
    color: '#9AA1A9',
    fontSize: 28,
  },

  emptyTitle: {
    color: '#27313A',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 10,
  },

  emptyText: {
    color: '#929AA3',
    fontSize: 11,
    marginTop: 5,
  },

  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  loadingText: {
    color: '#9AA1A9',
    fontSize: 12,
  },

  emptyContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  profilePage: {
    padding: 26,
    paddingBottom: 60,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 22,
  },

  backArrow: {
    color: '#172A3A',
    fontSize: 30,
    lineHeight: 25,
  },

  backText: {
    color: '#52606C',
    fontSize: 12,
    fontWeight: '700',
  },

  profileHeader: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 20,
    padding: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },

  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#EAF4F5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  profileAvatarText: {
    color: '#137A82',
    fontSize: 18,
    fontWeight: '800',
  },

  profileName: {
    color: '#202832',
    fontSize: 21,
    fontWeight: '800',
  },

  profilePhone: {
    color: '#8E969F',
    fontSize: 11,
    marginTop: 4,
  },

  profileStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: '#3B8C6B',
  },

  profileStatusText: {
    color: '#3B8C6B',
    fontSize: 9,
    fontWeight: '800',
  },

  callButton: {
    backgroundColor: '#137A82',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  callButtonIcon: {
    color: '#FFFFFF',
    fontSize: 12,
  },

  callButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },

  callButtonLoading: {
    opacity: 0.7,
  },

  directedCallButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 11,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },

  directedCallButtonIcon: {
    color: '#0066cc',
    fontSize: 12,
  },

  directedCallButtonText: {
    color: '#0066cc',
    fontSize: 11,
    fontWeight: '800',
  },

  profileGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },

  profileCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 17,
    padding: 18,
  },

  cardEyebrow: {
    color: '#9AA1A9',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  cardTitle: {
    color: '#27313A',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
  },

  cardLabel: {
    color: '#9AA1A9',
    fontSize: 9,
    marginTop: 16,
  },

  cardValue: {
    color: '#27313A',
    fontSize: 18,
    fontWeight: '800',
    marginTop: 4,
  },

  testCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 17,
    padding: 18,
  },

  testCardTitle: {
    color: '#27313A',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
  },

  testCardSubtitle: {
    color: '#8E969F',
    fontSize: 12,
    marginBottom: 16,
    lineHeight: 16,
  },

  testInput: {
    borderWidth: 1,
    borderColor: '#DCE1E8',
    borderRadius: 10,
    backgroundColor: '#F6F7F9',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    color: '#111827',
    marginBottom: 14,
  },

  testButton: {
    backgroundColor: '#137A82',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  testButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  timelineCard: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E7E9ED',
    borderRadius: 18,
    padding: 20,
  },

  timelineHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    gap: 15,
  },

  cardSubtitle: {
    color: '#969EA7',
    fontSize: 10,
    marginTop: 3,
  },

  secondaryButton: {
    borderWidth: 1,
    borderColor: '#DCE1E5',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  secondaryButtonText: {
    color: '#137A82',
    fontSize: 10,
    fontWeight: '800',
  },

  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },

  timelineLine: {
    width: 15,
    alignItems: 'center',
  },

  timelineDot: {
    width: 9,
    height: 9,
    borderRadius: 9,
    backgroundColor: '#137A82',
    marginTop: 4,
  },

  timelineConnector: {
    width: 1,
    flex: 1,
    backgroundColor: '#DCE1E5',
    marginTop: 4,
  },

  timelineTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },

  timelineType: {
    color: '#137A82',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },

  timelineTime: {
    color: '#A0A7AE',
    fontSize: 8,
  },

  timelineTitle: {
    color: '#303942',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 5,
  },

  timelineDetail: {
    color: '#8E969F',
    fontSize: 10,
    marginTop: 3,
    lineHeight: 15,
  },

  timelineEmpty: {
    color: '#8E969F',
    fontSize: 10,
    paddingVertical: 18,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 30, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },

  modalCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 22,
    borderWidth: 1,
    borderColor: '#E7E9ED',
  },

  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 22,
  },

  modalTitle: {
    color: '#202832',
    fontSize: 18,
    fontWeight: '800',
  },

  modalSubtitle: {
    color: '#8E969F',
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },

  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F5F6F7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalCloseText: {
    color: '#69737D',
    fontSize: 22,
    lineHeight: 24,
  },

  modalLabel: {
    color: '#9AA1A9',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 7,
  },

  modalInput: {
    height: 46,
    borderWidth: 1,
    borderColor: '#DCE1E5',
    borderRadius: 11,
    paddingHorizontal: 13,
    color: '#27313A',
    fontSize: 11,
    backgroundColor: '#FAFAFB',
  },

  modalHint: {
    color: '#A7AEB5',
    fontSize: 9,
    marginTop: -3,
    marginBottom: 9,
  },

  templatePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 4,
  },

  templatePill: {
    borderWidth: 1,
    borderColor: '#DCE1E5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFB',
  },

  templatePillActive: {
    borderColor: '#146F7A',
    backgroundColor: '#EAF3F4',
  },

  templatePillText: {
    color: '#5B646C',
    fontSize: 10,
    fontWeight: '700',
  },

  templatePillTextActive: {
    color: '#146F7A',
  },

  quickOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 12,
  },

  quickOption: {
    borderWidth: 1,
    borderColor: '#DCE1E5',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
  },

  quickOptionActive: {
    backgroundColor: '#EEF4F5',
    borderColor: '#137A82',
  },

  quickOptionText: {
    color: '#6E7782',
    fontSize: 9,
    fontWeight: '700',
  },

  quickOptionTextActive: {
    color: '#137A82',
    fontWeight: '800',
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 22,
  },

  modalCancel: {
    borderWidth: 1,
    borderColor: '#DCE1E5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  modalCancelText: {
    color: '#69737D',
    fontSize: 10,
    fontWeight: '800',
  },

  modalSave: {
    backgroundColor: '#137A82',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },

  pressed: {
    opacity: 0.7,
  },
});