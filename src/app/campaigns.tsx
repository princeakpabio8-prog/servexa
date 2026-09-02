import { router } from 'expo-router';
import {
    Alert,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';

const COMING_SOON_MESSAGE =
  'Campaign automation is coming soon. For now, use Customers \u2192 Use a call template to run directed calls.';

const campaigns = [
  {
    name: 'Payment reminders',
    purpose: 'Payment reminder',
    description: 'Remind customers about upcoming payments and confirm when they plan to pay.',
    status: 'Running',
    audience: '1,248 customers',
    progress: 78,
    calls: '642',
    followUps: '34',
    attention: '8',
  },
  {
    name: 'Outstanding payments',
    purpose: 'Payment & collections',
    description: 'Reach customers with overdue balances and capture their payment response.',
    status: 'Running',
    audience: '486 customers',
    progress: 61,
    calls: '291',
    followUps: '21',
    attention: '11',
  },
  {
    name: 'Customer follow-up',
    purpose: 'Follow-up',
    description: 'Reconnect with customers who need another conversation or confirmation.',
    status: 'Paused',
    audience: '324 customers',
    progress: 42,
    calls: '138',
    followUps: '13',
    attention: '5',
  },
];

export default function CampaignsScreen() {
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
              <View style={{ flex: 1 }}>
                <Text style={styles.companyName}>Lekki Gardens</Text>
                <Text style={styles.companyRole}>Customer Care</Text>
              </View>
              <Text style={styles.chevron}>⌄</Text>
            </View>

            <View style={styles.nav}>
              {[
                ['⌂', 'Overview', '/'],
                ['◎', 'Customers', '/customers'],
                ['◫', 'Campaigns', '/campaigns'],
                ['◷', 'Activity', '/activity'],
                ['⚙', 'Settings', '/settings'],
              ].map(([icon, label, route]) => {
                const active = label === 'Campaigns';
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
              <Text style={styles.planEyebrow}>CURRENT PLAN</Text>
              <Text style={styles.planTitle}>Growth</Text>
              <Text style={styles.planText}>7,420 of 10,000 calls</Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
              </View>
              <Text style={styles.manage}>Manage plan →</Text>
            </View>
            <Text style={styles.version}>SERVEXA v0.1 • Enterprise Preview</Text>
          </View>
        </View>

        <View style={styles.main}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View>
                <Text style={styles.eyebrow}>CUSTOMER OPERATIONS</Text>
                <Text style={styles.title}>Campaigns</Text>
                <Text style={styles.subtitle}>
                  Create focused customer conversations that CALL-E can handle automatically.
                </Text>
              </View>

              <Pressable
                style={styles.createButton}
                onPress={() => Alert.alert('Coming soon', COMING_SOON_MESSAGE)}
              >
                <Text style={styles.createButtonText}>+ New campaign</Text>
              </Pressable>
            </View>

            <View style={styles.summaryGrid}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>ACTIVE CAMPAIGNS</Text>
                <Text style={styles.summaryValue}>2</Text>
                <Text style={styles.summaryHint}>Currently running</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>CUSTOMERS REACHED</Text>
                <Text style={styles.summaryValue}>2,058</Text>
                <Text style={styles.summaryHint}>Across all campaigns</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>CONVERSATIONS</Text>
                <Text style={styles.summaryValue}>1,071</Text>
                <Text style={styles.summaryHint}>Automated this period</Text>
              </View>
            </View>

            <View style={styles.featured}>
              <View style={{ flex: 1 }}>
                <View style={styles.featuredBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.featuredBadgeText}>COMING SOON</Text>
                </View>
                <Text style={styles.featuredTitle}>
                  Turn a customer list into an automated conversation.
                </Text>
                <Text style={styles.featuredText}>
                  Choose a customer-care purpose, select your audience, define the rules, and let CALL-E handle the routine conversations.
                </Text>
                <Pressable
                  style={styles.featuredButton}
                  onPress={() => Alert.alert('Coming soon', COMING_SOON_MESSAGE)}
                >
                  <Text style={styles.featuredButtonText}>Start a campaign →</Text>
                </Pressable>
              </View>

              <View style={styles.featuredVisual}>
                <View style={styles.visualCircle}>
                  <Text style={styles.visualIcon}>✦</Text>
                </View>
                <View style={styles.visualCard}>
                  <View style={styles.visualStatus} />
                  <Text style={styles.visualCardText}>AI conversation</Text>
                  <Text style={styles.visualCardSub}>Customer follow-up</Text>
                </View>
              </View>
            </View>

            <View style={styles.purposeSection}>
              <Text style={styles.purposeSectionTitle}>Choose a customer-care purpose</Text>
              <Text style={styles.purposeSectionText}>
                Keep automation focused: payment, reminders, notifications, or follow-up.
              </Text>
              <View style={styles.purposeRow}>
                <View style={styles.purposeOption}><Text style={styles.purposeOptionText}>Payment & collections</Text></View>
                <View style={styles.purposeOption}><Text style={styles.purposeOptionText}>Payment reminder</Text></View>
                <View style={styles.purposeOption}><Text style={styles.purposeOptionText}>Notification</Text></View>
                <View style={styles.purposeOption}><Text style={styles.purposeOptionText}>Follow-up</Text></View>
              </View>
            </View>

            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Your campaigns</Text>
                <Text style={styles.sectionSubtitle}>Automated customer-care workflows</Text>
              </View>
              <Text style={styles.total}>3 campaigns</Text>
            </View>

            {campaigns.map((campaign) => (
              <Pressable
                key={campaign.name}
                onPress={() => Alert.alert('Coming soon', COMING_SOON_MESSAGE)}
                style={({ pressed }) => [
                  styles.campaignCard,
                  pressed && styles.cardPressed,
                ]}
              >
                <View style={styles.campaignTop}>
                  <View style={styles.campaignIcon}>
                    <Text style={styles.campaignIconText}>✦</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={styles.nameRow}>
                      <Text style={styles.campaignName}>{campaign.name}</Text>
                      <View style={[styles.status, campaign.status === 'Paused' && styles.statusPaused]}>
                        <View style={[styles.statusDot, campaign.status === 'Paused' && styles.statusDotPaused]} />
                        <Text style={[styles.statusText, campaign.status === 'Paused' && styles.statusTextPaused]}>
                          {campaign.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.purposeBadge}>
                      <Text style={styles.purposeBadgeText}>{campaign.purpose}</Text>
                    </View>

                    <Text style={styles.campaignDescription}>{campaign.description}</Text>
                  </View>

                  <Text style={styles.arrow}>›</Text>
                </View>

                <View style={styles.campaignMeta}>
                  <View>
                    <Text style={styles.metaLabel}>AUDIENCE</Text>
                    <Text style={styles.metaValue}>{campaign.audience}</Text>
                  </View>

                  <View>
                    <Text style={styles.metaLabel}>CALLS</Text>
                    <Text style={styles.metaValue}>{campaign.calls}</Text>
                  </View>

                  <View>
                    <Text style={styles.metaLabel}>FOLLOW-UPS</Text>
                    <Text style={styles.metaValue}>{campaign.followUps}</Text>
                  </View>

                  <View>
                    <Text style={styles.metaLabel}>ATTENTION</Text>
                    <Text style={styles.metaValue}>{campaign.attention}</Text>
                  </View>

                  <View style={styles.campaignProgress}>
                    <View style={styles.progressHeader}>
                      <Text style={styles.metaLabel}>PROGRESS</Text>
                      <Text style={styles.progressPercentage}>{campaign.progress}%</Text>
                    </View>
                    <View style={styles.campaignTrack}>
                      <View style={[styles.campaignFill, { width: `${campaign.progress}%` }]} />
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}


            <View style={styles.footerNote}>
              <View style={styles.footerIcon}>
                <Text style={styles.footerIconText}>✓</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.footerTitle}>Automation works best with clear intent.</Text>
                <Text style={styles.footerText}>
                  Give SERVEXA a specific customer-care objective and your team can focus on the conversations that actually require human attention.
                </Text>
              </View>
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
    width: 270, backgroundColor: '#FFFFFF', borderRightWidth: 1,
    borderRightColor: '#E5E8EC', padding: 20, paddingTop: 28,
    paddingBottom: 20, justifyContent: 'space-between',
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  brandMark: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#122735',
    alignItems: 'center', justifyContent: 'center',
  },
  brandMarkText: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
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
  progressTrack: { height: 6, backgroundColor: '#DCE3E6', borderRadius: 10, marginTop: 10, overflow: 'hidden' },
  progressFill: { width: '74%', height: '100%', backgroundColor: '#147983' },
  manage: { color: '#147983', fontSize: 9, fontWeight: '900', marginTop: 10 },
  version: { color: '#B0B7BD', fontSize: 8, marginTop: 17 },
  main: { flex: 1 },
  content: { padding: 28, paddingBottom: 60 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 25 },
  eyebrow: { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#15232E', fontSize: 32, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6, maxWidth: 650 },
  createButton: { backgroundColor: '#147983', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  createButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  summaryGrid: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E8EC', borderRadius: 17, padding: 17 },
  summaryLabel: { color: '#929AA2', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  summaryValue: { color: '#172832', fontSize: 26, fontWeight: '900', marginTop: 7 },
  summaryHint: { color: '#929AA2', fontSize: 8, marginTop: 3 },
  featured: { marginTop: 13, minHeight: 245, borderRadius: 23, backgroundColor: '#112936', padding: 27, flexDirection: 'row', overflow: 'hidden' },
  featuredBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 6, backgroundColor: '#6BD5A4' },
  featuredBadgeText: { color: '#B8CFD1', fontSize: 7, fontWeight: '900', letterSpacing: 1 },
  featuredTitle: { color: '#FFFFFF', fontSize: 26, lineHeight: 32, fontWeight: '900', maxWidth: 600, marginTop: 17 },
  featuredText: { color: '#B5C3CB', fontSize: 11, lineHeight: 18, maxWidth: 590, marginTop: 9 },
  featuredButton: { alignSelf: 'flex-start', marginTop: 18, backgroundColor: '#FFFFFF', borderRadius: 11, paddingHorizontal: 14, paddingVertical: 10 },
  featuredButtonText: { color: '#142733', fontSize: 9, fontWeight: '900' },
  featuredVisual: { width: 260, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  visualCircle: { width: 175, height: 175, borderRadius: 175, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  visualIcon: { color: '#72C6CB', fontSize: 44 },
  visualCard: { position: 'absolute', bottom: 25, right: 0, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 13, padding: 12, minWidth: 160 },
  visualStatus: { width: 7, height: 7, borderRadius: 7, backgroundColor: '#58B98B', position: 'absolute', right: 12, top: 12 },
  visualCardText: { color: '#23313A', fontSize: 9, fontWeight: '900' },
  visualCardSub: { color: '#89939C', fontSize: 7, marginTop: 3 },
  sectionHeader: { marginTop: 29, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  sectionTitle: { color: '#202A33', fontSize: 17, fontWeight: '900' },
  sectionSubtitle: { color: '#919AA3', fontSize: 10, marginTop: 3 },
  total: { color: '#8C959E', fontSize: 9, fontWeight: '700' },
  campaignCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E8EC', borderRadius: 17, padding: 18, marginBottom: 10 },
  cardPressed: { opacity: 0.7 },
  campaignTop: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  campaignIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: '#EAF3F4', alignItems: 'center', justifyContent: 'center' },
  campaignIconText: { color: '#147983', fontSize: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campaignName: { color: '#28343D', fontSize: 11, fontWeight: '900' },
  campaignDescription: { color: '#8C969F', fontSize: 8, marginTop: 4 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EDF7F2', borderRadius: 7, paddingHorizontal: 6, paddingVertical: 3 },
  statusPaused: { backgroundColor: '#F3F4F5' },
  statusDot: { width: 5, height: 5, borderRadius: 5, backgroundColor: '#4DAA80' },
  statusDotPaused: { backgroundColor: '#9BA2A8' },
  statusText: { color: '#4A8B70', fontSize: 6, fontWeight: '900' },
  statusTextPaused: { color: '#7F888F' },
  arrow: { color: '#A2AAB1', fontSize: 21 },
  campaignMeta: { marginTop: 17, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EEF0F2', flexDirection: 'row', alignItems: 'center', gap: 35 },
  metaLabel: { color: '#A0A7AE', fontSize: 6, fontWeight: '900', letterSpacing: 0.7 },
  metaValue: { color: '#35414A', fontSize: 9, fontWeight: '800', marginTop: 4 },
  campaignProgress: { flex: 1 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  progressPercentage: { color: '#147983', fontSize: 7, fontWeight: '900' },
  campaignTrack: { height: 5, backgroundColor: '#E9EDF0', borderRadius: 10, overflow: 'hidden', marginTop: 5 },
  campaignFill: { height: '100%', backgroundColor: '#147983', borderRadius: 10 },
  purposeSection: {
    marginTop: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EC',
    borderRadius: 17,
    padding: 17,
  },
  purposeSectionTitle: { color: '#26343D', fontSize: 12, fontWeight: '900' },
  purposeSectionText: { color: '#8C969F', fontSize: 8, marginTop: 4 },
  purposeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  purposeOption: {
    borderWidth: 1,
    borderColor: '#DCE5E7',
    backgroundColor: '#F8FAFA',
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  purposeOptionText: { color: '#147983', fontSize: 8, fontWeight: '800' },
  purposeBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EAF3F4',
    borderRadius: 7,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  purposeBadgeText: { color: '#147983', fontSize: 6, fontWeight: '900' },
  footerNote: { marginTop: 8, backgroundColor: '#E8F3F4', borderRadius: 16, padding: 17, flexDirection: 'row', alignItems: 'center', gap: 11 },
  footerIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  footerIconText: { color: '#147983', fontSize: 13, fontWeight: '900' },
  footerTitle: { color: '#155F66', fontSize: 10, fontWeight: '900' },
  footerText: { color: '#58787B', fontSize: 8, lineHeight: 13, marginTop: 3 },
});