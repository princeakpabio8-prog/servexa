import { router } from 'expo-router';
import {
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Switch,
    Text,
    View,
} from 'react-native';

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
      style={({ pressed }) => [styles.settingRow, pressed && styles.pressed]}
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
              <View style={styles.brandMark}><Text style={styles.brandMarkText}>S</Text></View>
              <View>
                <Text style={styles.brand}>SERVEXA</Text>
                <Text style={styles.brandSmall}>CUSTOMER OPERATIONS</Text>
              </View>
            </Pressable>

            <Text style={styles.workspaceLabel}>WORKSPACE</Text>

            <View style={styles.workspace}>
              <View style={styles.companyAvatar}><Text style={styles.companyAvatarText}>LG</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.companyName}>Lekki Gardens</Text>
                <Text style={styles.companyRole}>Customer Care</Text>
              </View>
              <Text style={styles.chevron}>⌄</Text>
            </View>

            <View style={styles.nav}>
              {nav.map(([icon, label, route]) => {
                const active = label === 'Settings';
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
                    <Text style={[styles.navIcon, active && styles.navIconActive]}>{icon}</Text>
                    <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View>
            <View style={styles.planCard}>
              <Text style={styles.planEyebrow}>CURRENT PLAN</Text>
              <Text style={styles.planTitle}>Growth</Text>
              <Text style={styles.planText}>Usage data will appear here when billing is connected.</Text>
              <View style={styles.track}><View style={styles.fill} /></View>
              <Text style={styles.manage}>Manage plan →</Text>
            </View>
            <Text style={styles.version}>SERVEXA v0.1 • Enterprise Preview</Text>
          </View>
        </View>

        <View style={styles.main}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>WORKSPACE CONFIGURATION</Text>
                <Text style={styles.title}>Settings</Text>
                <Text style={styles.subtitle}>Configure how SERVEXA works for your customer-care operation.</Text>
              </View>
              <View style={styles.secure}><Text style={styles.secureText}>● SECURE WORKSPACE</Text></View>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>LG</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>Lekki Gardens</Text>
                <Text style={styles.profileDescription}>Customer Care workspace</Text>
              </View>
              <Pressable style={styles.editButton}><Text style={styles.editText}>Edit workspace</Text></Pressable>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>CUSTOMER CARE</Text>
              <Text style={styles.sectionTitle}>Automation preferences</Text>
              <Text style={styles.sectionSubtitle}>Control how SERVEXA handles routine conversations.</Text>

              <View style={styles.card}>
                <SettingRow
                  title="Automatic follow-ups"
                  description="Allow SERVEXA to follow up with customers when a conversation needs another touch."
                  right={<Switch value={true} onValueChange={() => {}} />}
                />
                <SettingRow
                  title="Escalate difficult conversations"
                  description="Send conversations to your human team when customers require manual attention."
                  right={<Switch value={true} onValueChange={() => {}} />}
                />
                <SettingRow
                  title="Payment reminders"
                  description="Automatically remind customers about upcoming or outstanding payments."
                  right={<Switch value={true} onValueChange={() => {}} />}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>WORKSPACE</Text>
              <Text style={styles.sectionTitle}>Workspace settings</Text>
              <Text style={styles.sectionSubtitle}>Manage the people and information connected to this workspace.</Text>

              <View style={styles.card}>
                <SettingRow title="Team members" description="Manage agents and administrators who can access SERVEXA." right={<Text style={styles.arrow}>›</Text>} />
                <SettingRow title="Business profile" description="Company name, contact details, operating hours and identity." right={<Text style={styles.arrow}>›</Text>} />
                <SettingRow title="Notification preferences" description="Choose which events your team should be notified about." right={<Text style={styles.arrow}>›</Text>} />
              </View>
            </View>

            <View style={styles.planBanner}>
              <View>
                <Text style={styles.planBannerEyebrow}>CURRENT PLAN</Text>
                <Text style={styles.planBannerTitle}>Growth</Text>
                <Text style={styles.planBannerText}>Monthly usage is not connected yet</Text>
              </View>
              <Pressable style={styles.manageButton}>
                <Text style={styles.manageButtonText}>Manage plan</Text>
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
  sidebar: { width: 270, backgroundColor: '#FFF', borderRightWidth: 1, borderRightColor: '#E5E8EC', padding: 20, paddingTop: 28, paddingBottom: 20, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#122735', alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  brand: { color: '#152532', fontSize: 17, fontWeight: '900', letterSpacing: 1 },
  brandSmall: { color: '#9AA4AD', fontSize: 7, fontWeight: '800', letterSpacing: 1, marginTop: 2 },
  workspaceLabel: { marginTop: 38, marginBottom: 10, color: '#98A1AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  workspace: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#E5E8EC', borderRadius: 15, padding: 11 },
  companyAvatar: { width: 35, height: 35, borderRadius: 11, backgroundColor: '#E6F3F3', alignItems: 'center', justifyContent: 'center' },
  companyAvatarText: { color: '#147983', fontSize: 10, fontWeight: '900' },
  companyName: { color: '#202A33', fontSize: 12, fontWeight: '800' },
  companyRole: { color: '#8B949D', fontSize: 9, marginTop: 2 },
  chevron: { color: '#8C959E', fontSize: 17 },
  nav: { marginTop: 27, gap: 5 },
  navItem: { minHeight: 46, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  navPressed: { opacity: 0.65 },
  navItemActive: { backgroundColor: '#EAF3F4' },
  navIcon: { width: 20, color: '#89939D', fontSize: 17, textAlign: 'center' },
  navIconActive: { color: '#147983' },
  navText: { color: '#69747E', fontSize: 13, fontWeight: '600' },
  navTextActive: { color: '#147983', fontWeight: '800' },
  planCard: { backgroundColor: '#F5F7F8', borderWidth: 1, borderColor: '#E9ECEF', borderRadius: 17, padding: 15 },
  planEyebrow: { color: '#8A949D', fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  planTitle: { color: '#1D2831', fontSize: 17, fontWeight: '900', marginTop: 5 },
  planText: { color: '#7E8891', fontSize: 9, marginTop: 7 },
  track: { height: 6, backgroundColor: '#DCE3E6', borderRadius: 10, marginTop: 10, overflow: 'hidden' },
  fill: { width: '74%', height: '100%', backgroundColor: '#147983' },
  manage: { color: '#147983', fontSize: 9, fontWeight: '900', marginTop: 10 },
  version: { color: '#B0B7BD', fontSize: 8, marginTop: 17 },
  main: { flex: 1 },
  content: { padding: 28, paddingBottom: 60, maxWidth: 1300, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 25 },
  eyebrow: { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#15232E', fontSize: 32, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6, maxWidth: 650 },
  secure: { backgroundColor: '#EDF7F2', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 7 },
  secureText: { color: '#4E8B70', fontSize: 7, fontWeight: '900', letterSpacing: 0.7 },
  profileCard: { backgroundColor: '#112936', borderRadius: 21, padding: 22, flexDirection: 'row', alignItems: 'center', gap: 13 },
  profileAvatar: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#E6F3F3', alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { color: '#147983', fontSize: 14, fontWeight: '900' },
  profileName: { color: '#FFF', fontSize: 15, fontWeight: '900' },
  profileDescription: { color: '#A9BCC4', fontSize: 9, marginTop: 3 },
  editButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8 },
  editText: { color: '#D6E1E5', fontSize: 8, fontWeight: '800' },
  section: { marginTop: 29 },
  sectionEyebrow: { color: '#9AA2AA', fontSize: 7, fontWeight: '900', letterSpacing: 1.1 },
  sectionTitle: { color: '#202A33', fontSize: 17, fontWeight: '900', marginTop: 4 },
  sectionSubtitle: { color: '#919AA3', fontSize: 10, marginTop: 3 },
  card: { marginTop: 12, backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E5E8EC', borderRadius: 18, paddingHorizontal: 18 },
  settingRow: { minHeight: 76, borderBottomWidth: 1, borderBottomColor: '#EEF0F2', flexDirection: 'row', alignItems: 'center', gap: 15 },
  pressed: { opacity: 0.65 },
  settingTitle: { color: '#303A43', fontSize: 10, fontWeight: '900' },
  settingDescription: { color: '#8C969F', fontSize: 8, lineHeight: 13, marginTop: 3, maxWidth: 700 },
  arrow: { color: '#A2AAB1', fontSize: 21 },
  planBanner: { marginTop: 20, backgroundColor: '#E8F3F4', borderRadius: 17, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planBannerEyebrow: { color: '#6D9295', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  planBannerTitle: { color: '#155F66', fontSize: 18, fontWeight: '900', marginTop: 3 },
  planBannerText: { color: '#58787B', fontSize: 8, marginTop: 3 },
  manageButton: { backgroundColor: '#147983', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 9 },
  manageButtonText: { color: '#FFF', fontSize: 8, fontWeight: '900' },
});