// @ts-nocheck
import { router } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';
import AppShell from '../components/app-shell';
import WorkspaceAvatar from '../components/workspace-avatar';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';
import { clearOnboardingFlag } from './welcome';

function SettingRow({
  title,
  description,
  right,
  onPress,
}: {
  title: string;
  description: string;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.settingRow, pressed && onPress && styles.pressed]}
      accessibilityRole={onPress ? 'button' : 'none'}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      {right}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const { profile, settings, updateSettings } = useWorkspace();
  const [signingOut, setSigningOut] = useState(false);

  const displayName     = profile.company_name || 'My Workspace';
  const displayInitials = profile.initials     || '?';

  const handleComingSoon = (feature: string) => {
    Alert.alert('Coming soon', `${feature} will be available in a future update.`);
  };

  const goToEditProfile = () => router.push('/edit-profile' as any);
  const goToPlan        = () => router.push('/plan' as any);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      // Clear device-level onboarding flag so next user starts fresh
      await clearOnboardingFlag();
      // Clear any pending profile data
      try {
        const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
        await AsyncStorage.removeItem('servexa_pending_profile');
      } catch { /* ignore */ }
      // Sign out of Supabase — triggers SIGNED_OUT in useWorkspace
      await supabase.auth.signOut();
      router.replace('/welcome');
    } catch (e) {
      setSigningOut(false);
      Alert.alert('Error', 'Could not sign out. Please try again.');
    }
  };

  return (
    <AppShell>
            <View style={styles.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.eyebrow}>WORKSPACE CONFIGURATION</Text>
                <Text style={styles.title}>Settings</Text>
                <Text style={styles.subtitle}>Configure how SERVEXA works for your customer-care operation.</Text>
              </View>
              <View style={styles.secure}><Text style={styles.secureText}>● SECURE WORKSPACE</Text></View>
            </View>

            <View style={styles.profileCard}>
              <WorkspaceAvatar
                avatarUrl={profile.avatar_url}
                initials={displayInitials}
                size={44}
                radius={13}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.profileName} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.profileDescription}>Customer Care workspace</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
                onPress={goToEditProfile}
                accessibilityLabel="Edit workspace"
                accessibilityRole="button"
              >
                <Text style={styles.editText}>Edit workspace</Text>
              </Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>CUSTOMER CARE</Text>
              <Text style={styles.sectionTitle}>Automation preferences</Text>
              <Text style={styles.sectionSubtitle}>Control how SERVEXA handles routine conversations.</Text>

              <View style={styles.card}>
                <SettingRow
                  title="Automatic follow-ups"
                  description="Allow SERVEXA to follow up with customers when a conversation needs another touch."
                  onPress={() => updateSettings('auto_follow_ups', !settings.auto_follow_ups)}
                  right={
                    <Switch
                      value={settings.auto_follow_ups}
                      onValueChange={(v) => updateSettings('auto_follow_ups', v)}
                      accessibilityLabel="Toggle automatic follow-ups"
                    />
                  }
                />
                <SettingRow
                  title="Escalate difficult conversations"
                  description="Send conversations to your human team when customers require manual attention."
                  onPress={() => updateSettings('escalate_difficult', !settings.escalate_difficult)}
                  right={
                    <Switch
                      value={settings.escalate_difficult}
                      onValueChange={(v) => updateSettings('escalate_difficult', v)}
                      accessibilityLabel="Toggle escalate difficult conversations"
                    />
                  }
                />
                <SettingRow
                  title="Payment reminders"
                  description="Automatically remind customers about upcoming or outstanding payments."
                  onPress={() => updateSettings('payment_reminders', !settings.payment_reminders)}
                  right={
                    <Switch
                      value={settings.payment_reminders}
                      onValueChange={(v) => updateSettings('payment_reminders', v)}
                      accessibilityLabel="Toggle payment reminders"
                    />
                  }
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>WORKSPACE</Text>
              <Text style={styles.sectionTitle}>Workspace settings</Text>
              <Text style={styles.sectionSubtitle}>Manage the people and information connected to this workspace.</Text>

              <View style={styles.card}>
                <SettingRow
                  title="Team members"
                  description="Manage agents and administrators who can access SERVEXA."
                  onPress={() => handleComingSoon('Team members')}
                  right={<Text style={styles.arrow}>›</Text>}
                />
                <SettingRow
                  title="Business profile"
                  description="Company name, contact details, operating hours and identity."
                  onPress={goToEditProfile}
                  right={<Text style={styles.arrow}>›</Text>}
                />
                <SettingRow
                  title="Notification preferences"
                  description="Choose which events your team should be notified about."
                  onPress={() => handleComingSoon('Notification preferences')}
                  right={<Text style={styles.arrow}>›</Text>}
                />
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.planBanner, pressed && { opacity: 0.88 }]}
              onPress={goToPlan}
              accessibilityRole="button"
              accessibilityLabel="View and manage your plan"
            >
              <View>
                <Text style={styles.planBannerEyebrow}>CURRENT PLAN</Text>
                <Text style={styles.planBannerTitle}>{settings.plan_name}</Text>
                <Text style={styles.planBannerText}>Tap to view your plan details</Text>
              </View>
              <View style={styles.manageButton}>
                <Text style={styles.manageButtonText}>Manage plan →</Text>
              </View>
            </Pressable>

            {/* Sign out */}
            <Pressable
              style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }, signingOut && { opacity: 0.5 }]}
              onPress={handleSignOut}
              disabled={signingOut}
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Text style={styles.signOutText}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
            </Pressable>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 25 },
  eyebrow: { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#15232E', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6 },
  secure: { backgroundColor: '#EDF7F2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  secureText: { color: '#4E8B70', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  profileCard: { backgroundColor: '#112936', borderRadius: 21, padding: 16, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  profileName: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  profileDescription: { color: '#A9BCC4', fontSize: 9, marginTop: 3 },
  editButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, minHeight: 40, justifyContent: 'center' },
  editText: { color: '#D6E1E5', fontSize: 8, fontWeight: '800' },
  section: { marginTop: 24 },
  sectionEyebrow: { color: '#9AA2AA', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#202A33', fontSize: 17, fontWeight: '900', marginTop: 4 },
  sectionSubtitle: { color: '#919AA3', fontSize: 10, marginTop: 3 },
  card: { marginTop: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E8EC', borderRadius: 18, paddingHorizontal: 14 },
  settingRow: { minHeight: 72, borderBottomWidth: 1, borderBottomColor: '#EEF0F2', flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  pressed: { opacity: 0.65 },
  settingTitle: { color: '#303A43', fontSize: 11, fontWeight: '900' },
  settingDescription: { color: '#8C969F', fontSize: 9, lineHeight: 14, marginTop: 3 },
  arrow: { color: '#A2AAB1', fontSize: 21 },
  planBanner: { marginTop: 20, backgroundColor: '#E8F3F4', borderRadius: 17, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  planBannerEyebrow: { color: '#6D9295', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  planBannerTitle: { color: '#155F66', fontSize: 18, fontWeight: '900', marginTop: 3 },
  planBannerText: { color: '#58787B', fontSize: 9, marginTop: 3 },
  manageButton: { backgroundColor: '#147983', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11, minHeight: 40, justifyContent: 'center' },
  signOutBtn: { marginTop: 16, borderWidth: 1, borderColor: '#E0E4E8', borderRadius: 14, paddingVertical: 14, alignItems: 'center', backgroundColor: '#F8F9FA', minHeight: 50 },
  signOutText: { color: '#C0392B', fontSize: 13, fontWeight: '700' },
  manageButtonText: { color: '#FFF', fontSize: 9, fontWeight: '900' },
});
