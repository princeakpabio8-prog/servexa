// @ts-nocheck
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import AppShell from '../components/app-shell';
import { Colors, Radius } from '../constants/theme';
import { ensureSession, supabase } from '../lib/supabase';

type Customer = {
  uuid: string;
  name: string;
  phone: string;
  reason?: string;
};

type Template = {
  id: string;
  name: string;
  purpose: string;
  description: string;
};

const TEMPLATES = [
  {
    id: 'loan_recovery',
    name: 'Loan Recovery',
    purpose: 'Loan Repayment Follow-up',
    description: 'Understand repayment status and identify appropriate next step',
    fields: ['amount', 'currency', 'due_date'],
  },
  {
    id: 'payment_reminder',
    name: 'Payment Reminder',
    purpose: 'Payment Reminder',
    description: 'Remind customer about upcoming/overdue payment',
    fields: ['amount', 'currency', 'due_date'],
  },
  {
    id: 'payment_confirmation',
    name: 'Payment Confirmation',
    purpose: 'Payment Confirmation',
    description: 'Confirm whether a payment has been made and identify any discrepancy',
    fields: ['amount', 'currency'],
  },
  {
    id: 'customer_followup',
    name: 'Customer Follow-up',
    purpose: 'Customer Follow-up',
    description: 'Reconnect with customer who needs another conversation',
    fields: [],
  },
  {
    id: 'repayment_assistance',
    name: 'Repayment Assistance',
    purpose: 'Repayment Assistance',
    description: 'Explore payment options and assistance programs',
    fields: ['amount', 'currency'],
  },
  {
    id: 'account_inquiry',
    name: 'Account Inquiry',
    purpose: 'Account Inquiry',
    description: 'Address customer questions about their account status',
    fields: [],
  },
];

export default function CallInstructionScreen() {
  const params = useLocalSearchParams<{
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    templateId?: string;
  }>();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [dueDate, setDueDate] = useState('');
  const [customQuestion, setCustomQuestion] = useState('');
  const [customContext, setCustomContext] = useState('');
  const [referenceInfo, setReferenceInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [initiating, setInitiating] = useState(false);
  const [step, setStep] = useState<'select_customer' | 'select_template' | 'details' | 'confirm'>('select_customer');

  useEffect(() => {
    fetchCustomers();

    // Arrived from Customers screen with a customer (and maybe a template) already chosen
    if (params.customerId && params.customerName && params.customerPhone) {
      setSelectedCustomer({
        uuid: params.customerId,
        name: params.customerName,
        phone: params.customerPhone,
      });

      const preselectedTemplate = TEMPLATES.find((t) => t.id === params.templateId);
      if (preselectedTemplate) {
        setSelectedTemplate(preselectedTemplate);
        setStep('details');
      } else {
        setStep('select_template');
      }
    }
  }, []);

  const fetchCustomers = async () => {
    try {
      await ensureSession();

      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone')
        .order('name', { ascending: true });

      if (error) throw error;

      const formattedCustomers = data?.map((c: any) => ({
        uuid: c.id,
        name: c.name,
        phone: c.phone,
      })) || [];

      setCustomers(formattedCustomers);
    } catch (err) {
      Alert.alert('Error', 'Failed to load customers');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateCall = async () => {
    if (!selectedCustomer || !selectedTemplate) {
      Alert.alert('Missing info', 'Please select a customer and template');
      return;
    }

    if (!customQuestion && !amount) {
      Alert.alert('Custom instruction required', 'Please provide either a specific question or an amount context');
      return;
    }

    setInitiating(true);

    try {
      const body: Record<string, any> = {
        customer_id: selectedCustomer.uuid,
        template_name: selectedTemplate.id,
      };

      if (customQuestion) body.custom_question = customQuestion;
      if (customContext) body.custom_context = customContext;
      if (amount) body.amount = parseFloat(amount);
      if (currency) body.currency = currency;
      if (dueDate) body.due_date = dueDate;
      if (referenceInfo) body.reference_info = referenceInfo;

      const { data, error } = await supabase.functions.invoke('start-customer-call', {
        body,
      });

      if (error) throw error;

      Alert.alert(
        'Call Initiated',
        `Human-directed call started with ${selectedCustomer.name}\nTemplate: ${selectedTemplate.name}\nCall ID: ${data?.servexa_call_id?.slice(0, 8)}...`
      );

      // Reset and return to customers
      setSelectedCustomer(null);
      setSelectedTemplate(null);
      setAmount('');
      setCustomQuestion('');
      setCustomContext('');
      setDueDate('');
      setReferenceInfo('');
      setStep('select_customer');
      router.push('/customers');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unable to initiate call';
      Alert.alert('Call Failed', errorMsg);
    } finally {
      setInitiating(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <View style={styles.container}>
        {/* Back / context header */}
        <Pressable
          style={styles.backRow}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Text style={styles.backArrow}>‹</Text>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        <Text style={styles.heading}>Start a Directed AI Call</Text>
        <Text style={styles.subheading}>Choose a customer, select a call template, and let your AI employee handle the conversation</Text>

        {/* Step 1: Select Customer */}
        {(step === 'select_customer' || selectedCustomer) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>1. Select Customer</Text>
            {!selectedCustomer ? (
              <View style={styles.listBox}>
                {customers.length === 0 ? (
                  <Text style={styles.emptyText}>No customers found. Create a customer first.</Text>
                ) : (
                  customers.map((customer) => (
                    <Pressable
                      key={customer.uuid}
                      style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
                      onPress={() => {
                        setSelectedCustomer(customer);
                        setStep('select_template');
                      }}
                    >
                      <View style={styles.listRowContent}>
                        <Text style={styles.listRowName}>{customer.name}</Text>
                        <Text style={styles.listRowSub}>{customer.phone}</Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : (
              <View style={styles.selectedItem}>
                <View style={styles.selectedItemContent}>
                  <Text style={styles.selectedItemName}>{selectedCustomer.name}</Text>
                  <Text style={styles.selectedItemSub}>{selectedCustomer.phone}</Text>
                </View>
                <Pressable onPress={() => setSelectedCustomer(null)}>
                  <Text style={styles.changeLink}>Change</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Step 2: Select Template */}
        {selectedCustomer && (step === 'select_template' || selectedTemplate) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>2. Select Template</Text>
            {!selectedTemplate ? (
              <View style={styles.listBox}>
                {TEMPLATES.map((template) => (
                  <Pressable
                    key={template.id}
                    style={({ pressed }) => [styles.listRow, pressed && { opacity: 0.7 }]}
                    onPress={() => {
                      setSelectedTemplate(template);
                      setStep('details');
                    }}
                  >
                    <View style={styles.listRowContent}>
                      <Text style={styles.listRowName}>{template.name}</Text>
                      <Text style={styles.listRowSub}>{template.description}</Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View style={styles.selectedItem}>
                <View style={styles.selectedItemContent}>
                  <Text style={styles.selectedItemName}>{selectedTemplate.name}</Text>
                  <Text style={styles.selectedItemSub}>{selectedTemplate.description}</Text>
                </View>
                <Pressable onPress={() => setSelectedTemplate(null)}>
                  <Text style={styles.changeLink}>Change</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Step 3: Details */}
        {selectedTemplate && step === 'details' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>3. Call Details & Instructions</Text>

            {/* Amount & Currency */}
            {selectedTemplate.id !== 'customer_followup' && selectedTemplate.id !== 'account_inquiry' && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Amount</Text>
                <View style={styles.amountRow}>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    placeholder="0.00"
                    placeholderTextColor="#999"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="decimal-pad"
                  />
                  <View style={styles.currencySelector}>
                    <Text style={styles.currencyText}>{currency}</Text>
                  </View>
                </View>
              </View>
            )}

            {/* Due Date */}
            {(selectedTemplate.id === 'loan_recovery' || selectedTemplate.id === 'payment_reminder') && (
              <View style={styles.formGroup}>
                <Text style={styles.label}>Due Date (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor="#999"
                  value={dueDate}
                  onChangeText={setDueDate}
                />
              </View>
            )}

            {/* Custom Question */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Specific Question or Instruction</Text>
              <Text style={styles.labelHint}>What would you like the AI to ask naturally during the conversation?</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="e.g., Ask whether the customer can make a partial payment this week."
                placeholderTextColor="#999"
                value={customQuestion}
                onChangeText={setCustomQuestion}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Custom Context */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Additional Context (optional)</Text>
              <Text style={styles.labelHint}>Background information to help the AI understand the call better</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                placeholder="e.g., The customer previously said they expected their salary on Friday."
                placeholderTextColor="#999"
                value={customContext}
                onChangeText={setCustomContext}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Reference Info */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Reference Information (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Account #, Loan ID, etc."
                placeholderTextColor="#999"
                value={referenceInfo}
                onChangeText={setReferenceInfo}
              />
            </View>

            <View style={styles.formGroup}>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  customQuestion || amount ? styles.buttonPrimary : styles.buttonDisabled,
                  pressed && { opacity: 0.85 },
                ]}
                onPress={() => setStep('confirm')}
                disabled={!customQuestion && !amount}
              >
                <Text style={styles.buttonText}>Review & Initiate Call</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirm' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>4. Confirm Call Details</Text>

            <View style={styles.confirmBox}>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Customer:</Text>
                <Text style={styles.confirmValue}>{selectedCustomer?.name}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={styles.confirmLabel}>Template:</Text>
                <Text style={styles.confirmValue}>{selectedTemplate?.name}</Text>
              </View>
              {amount && (
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Amount:</Text>
                  <Text style={styles.confirmValue}>{currency} {amount}</Text>
                </View>
              )}
              {dueDate && (
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Due Date:</Text>
                  <Text style={styles.confirmValue}>{dueDate}</Text>
                </View>
              )}
              <View style={[styles.confirmRow, styles.confirmRowLast]}>
                <Text style={styles.confirmLabel}>Instruction:</Text>
                <Text style={styles.confirmValue}>{customQuestion}</Text>
              </View>
            </View>

            <View style={styles.formGroup}>
              <Pressable
                style={({ pressed }) => [styles.button, styles.buttonPrimary, pressed && { opacity: 0.85 }]}
                onPress={handleInitiateCall}
                disabled={initiating}
              >
                {initiating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Initiate Call</Text>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.button, styles.buttonSecondary, pressed && { opacity: 0.85 }]}
                onPress={() => setStep('details')}
                disabled={initiating}
              >
                <Text style={styles.buttonTextSecondary}>Back to Details</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },

  container: {
    // AppShell's mainContent already provides padding; no extra maxWidth
    // needed here — the shell's 1400px cap is sufficient on desktop.
  },

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backArrow: {
    color: Colors.accent,
    fontSize: 26,
    lineHeight: 28,
  },
  backText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },

  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 6,
  },

  subheading: {
    fontSize: 15,
    color: Colors.inkMuted,
    marginBottom: 28,
    flexShrink: 1,
  },

  section: {
    marginBottom: 28,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 12,
  },

  // ── List boxes (customer/template selection) ───────────────────────────────
  listBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  listRowContent: {
    flex: 1,
    marginRight: 8,
  },

  listRowName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.ink,
  },

  listRowSub: {
    fontSize: 12,
    color: Colors.inkMuted,
    marginTop: 3,
  },

  chevron: {
    fontSize: 20,
    color: Colors.inkFaint,
  },

  // ── Selected item pill ─────────────────────────────────────────────────────
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.accentLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.accent,
  },

  selectedItemContent: {
    flex: 1,
    marginRight: 8,
  },

  selectedItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.ink,
  },

  selectedItemSub: {
    fontSize: 12,
    color: Colors.inkMuted,
    marginTop: 3,
  },

  changeLink: {
    fontSize: 13,
    color: Colors.accent,
    fontWeight: '600',
  },

  // ── Form ──────────────────────────────────────────────────────────────────
  formGroup: {
    marginBottom: 16,
  },

  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
    marginBottom: 6,
  },

  labelHint: {
    fontSize: 12,
    color: Colors.inkFaint,
    marginBottom: 8,
  },

  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: Colors.ink,
    backgroundColor: Colors.surface,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  amountInput: {
    flex: 1,
  },

  currencySelector: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 72,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },

  currencyText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.ink,
  },

  textarea: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  button: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: Radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },

  buttonPrimary: {
    backgroundColor: Colors.accent,
  },

  buttonSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },

  buttonDisabled: {
    backgroundColor: Colors.border,
  },

  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },

  buttonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.ink,
  },

  // ── Confirm box ───────────────────────────────────────────────────────────
  confirmBox: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
  },

  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.ivoryDeep,
    gap: 12,
  },

  confirmRowLast: {
    borderBottomWidth: 0,
  },

  confirmLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.inkMuted,
    flexShrink: 0,
  },

  confirmValue: {
    fontSize: 12,
    color: Colors.ink,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
    flexWrap: 'wrap',
  },

  emptyText: {
    fontSize: 13,
    color: Colors.inkFaint,
    paddingVertical: 16,
    paddingHorizontal: 14,
    textAlign: 'center',
  },
});
