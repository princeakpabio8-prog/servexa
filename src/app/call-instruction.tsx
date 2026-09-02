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
    TextInput,
    useWindowDimensions,
    View,
} from 'react-native';
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
  const { width } = useWindowDimensions();
  const isWide = width >= 1000;

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

  const nav = [
    ['⌂', 'Overview', '/'],
    ['◎', 'Customers', '/customers'],
    ['◫', 'Campaigns', '/campaigns'],
    ['◷', 'Activity', '/activity'],
    ['⚙', 'Settings', '/settings'],
  ];

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.app}>
          <View style={[styles.main, isWide && styles.mainWide]}>
            <ActivityIndicator size="large" color="#0066cc" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />

      <View style={styles.app}>
        <View style={styles.sidebar}>
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
              <Text style={styles.companyRole}>Administrator</Text>
            </View>
          </View>

          <Text style={styles.navLabel}>NAVIGATION</Text>

          {nav.map((n, i) => (
            <Pressable key={i} style={[styles.navItem, n[2] === '/call-instruction' && styles.navItemActive]} onPress={() => router.push(n[2])}>
              <Text style={styles.navIcon}>{n[0]}</Text>
              <Text style={[styles.navText, n[2] === '/call-instruction' && styles.navTextActive]}>{n[1]}</Text>
            </Pressable>
          ))}

          <Pressable style={[styles.navItem, styles.navItemActive]} onPress={() => {}}>
            <Text style={styles.navIcon}>✎</Text>
            <Text style={[styles.navText, styles.navTextActive]}>Directed Call</Text>
          </Pressable>
        </View>

        <View style={[styles.main, isWide && styles.mainWide]}>
          <ScrollView>
            <View style={styles.container}>
              <Text style={styles.heading}>Human-Directed Call</Text>
              <Text style={styles.subheading}>Create a custom call with operator-provided instructions</Text>

              {/* Step 1: Select Customer */}
              {(step === 'select_customer' || selectedCustomer) && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>1. Select Customer</Text>
                  {!selectedCustomer ? (
                    <View style={styles.customerList}>
                      {customers.length === 0 ? (
                        <Text style={styles.emptyText}>No customers found. Create a customer first.</Text>
                      ) : (
                        customers.map((customer) => (
                          <Pressable
                            key={customer.uuid}
                            style={styles.customerItem}
                            onPress={() => {
                              setSelectedCustomer(customer);
                              setStep('select_template');
                            }}
                          >
                            <View style={styles.customerItemContent}>
                              <Text style={styles.customerName}>{customer.name}</Text>
                              <Text style={styles.customerPhone}>{customer.phone}</Text>
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
                        <Text style={styles.selectedItemPhone}>{selectedCustomer.phone}</Text>
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
                    <View style={styles.templateList}>
                      {TEMPLATES.map((template) => (
                        <Pressable
                          key={template.id}
                          style={styles.templateItem}
                          onPress={() => {
                            setSelectedTemplate(template);
                            setStep('details');
                          }}
                        >
                          <View style={styles.templateItemContent}>
                            <Text style={styles.templateName}>{template.name}</Text>
                            <Text style={styles.templateDescription}>{template.description}</Text>
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : (
                    <View style={styles.selectedItem}>
                      <View style={styles.selectedItemContent}>
                        <Text style={styles.selectedItemName}>{selectedTemplate.name}</Text>
                        <Text style={styles.selectedItemPhone}>{selectedTemplate.description}</Text>
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
                      style={[styles.button, customQuestion || amount ? styles.buttonPrimary : styles.buttonDisabled]}
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
                      style={[styles.button, styles.buttonPrimary]}
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
                      style={[styles.button, styles.buttonSecondary]}
                      onPress={() => setStep('details')}
                      disabled={initiating}
                    >
                      <Text style={styles.buttonTextSecondary}>Back to Details</Text>
                    </Pressable>
                  </View>
                </View>
              )}
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
    backgroundColor: '#fff',
  },
  app: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 280,
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#ddd',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 32,
  },
  brandMark: {
    width: 40,
    height: 40,
    backgroundColor: '#0066cc',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandMarkText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  brand: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  brandSmall: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  workspaceLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  workspace: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 24,
  },
  companyAvatar: {
    width: 40,
    height: 40,
    backgroundColor: '#e8f0ff',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  companyAvatarText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0066cc',
  },
  workspaceText: {
    flex: 1,
  },
  companyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  companyRole: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  navItemActive: {
    backgroundColor: '#e8f0ff',
  },
  navIcon: {
    fontSize: 16,
    marginRight: 10,
    width: 20,
    textAlign: 'center',
  },
  navText: {
    fontSize: 13,
    color: '#666',
  },
  navTextActive: {
    color: '#0066cc',
    fontWeight: '600',
  },
  main: {
    flex: 1,
    backgroundColor: '#fff',
  },
  mainWide: {
    maxWidth: 1200,
  },
  container: {
    padding: 32,
    maxWidth: 800,
  },
  heading: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  customerList: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  customerItemContent: {
    flex: 1,
  },
  customerName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  customerPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  chevron: {
    fontSize: 18,
    color: '#ccc',
  },
  templateList: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    overflow: 'hidden',
  },
  templateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  templateItemContent: {
    flex: 1,
  },
  templateName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  templateDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  selectedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#e8f0ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0066cc',
  },
  selectedItemContent: {
    flex: 1,
  },
  selectedItemName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  selectedItemPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  changeLink: {
    fontSize: 12,
    color: '#0066cc',
    fontWeight: '500',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 6,
  },
  labelHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#000',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amountInput: {
    flex: 1,
  },
  currencySelector: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currencyText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  textarea: {
    minHeight: 80,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonPrimary: {
    backgroundColor: '#0066cc',
  },
  buttonSecondary: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  buttonDisabled: {
    backgroundColor: '#e0e0e0',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  buttonTextSecondary: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  confirmBox: {
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  confirmRowLast: {
    borderBottomWidth: 0,
  },
  confirmLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  confirmValue: {
    fontSize: 12,
    color: '#000',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    paddingVertical: 16,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
});
