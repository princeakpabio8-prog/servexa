// @ts-nocheck
/**
 * AppShell — unified layout wrapper for all authenticated screens.
 *
 * On desktop (≥768px): sidebar + main content
 * On mobile (<768px):  full-screen content + bottom MobileNav
 */
import { router, usePathname } from 'expo-router';
import { ReactNode, useEffect } from 'react';
import {
    Alert,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
    useWindowDimensions,
} from 'react-native';
import { Colors, Fonts, Radius } from '../constants/theme';
import { hasRealSession } from '../lib/supabase';
import { useWorkspace } from '../lib/workspace';
import MobileNav from './mobile-nav';
import ServexaLogo from './servexa-logo';
import WorkspaceAvatar from './workspace-avatar';

const NAV_ITEMS = [
  { icon: '⌂', label: 'Overview',  route: '/',          active: (p: string) => p === '/' },
  { icon: '◉', label: 'Team',      route: '/campaigns', active: (p: string) => p.startsWith('/campaigns') || p.startsWith('/employee') },
  { icon: '◎', label: 'Customers', route: '/customers', active: (p: string) => p.startsWith('/customers') || p.startsWith('/call') },
  { icon: '◷', label: 'Activity',  route: '/activity',  active: (p: string) => p.startsWith('/activity') },
  { icon: '⚙', label: 'Settings',  route: '/settings',  active: (p: string) => p.startsWith('/settings') },
] as const;

type Props = {
  children: ReactNode;
  /** When true, wraps children in a ScrollView with standard padding */
  scrollable?: boolean;
};

export default function AppShell({ children, scrollable = true }: Props) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  const isDesktop = width >= 768;
  const { profile, settings } = useWorkspace();

  // Auth guard: redirect to /welcome if no real session
  useEffect(() => {
    hasRealSession().then((ok) => {
      if (!ok) router.replace('/welcome');
    });
  }, [pathname]);

  const displayName    = profile.company_name || 'My Workspace';
  const displayInitials = profile.initials    || '?';

  const sidebar = (
    <View style={[styles.sidebar, isDesktop && styles.sidebarDesktop]}>
      <View style={styles.sidebarTop}>
        {/* Brand */}
        <Pressable style={styles.brandRow} onPress={() => router.navigate('/')}>
          <ServexaLogo variant="wordmark" width={170} />
        </Pressable>

        {/* Workspace pill — navigates to settings, not a multi-workspace switcher */}
        <Text style={styles.workspaceLabel}>WORKSPACE</Text>
        <Pressable
          style={({ pressed }) => [styles.workspace, pressed && styles.workspacePressed]}
          onPress={() => router.push('/settings' as any)}
          accessibilityRole="button"
          accessibilityLabel="Workspace settings"
        >
          <WorkspaceAvatar
            avatarUrl={profile.avatar_url}
            initials={displayInitials}
            size={32}
            radius={10}
          />
          <View style={styles.workspaceText}>
            <Text style={styles.workspaceName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.workspaceRole}>Customer Care</Text>
          </View>
          {/* ⚙ settings icon — makes the tap target's destination clear */}
          <Text style={styles.workspaceChevron}>⚙</Text>
        </Pressable>

        {/* Nav */}
        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = item.active(pathname);
            return (
              <Pressable
                key={item.label}
                onPress={() => router.navigate(item.route as any)}
                style={({ pressed }) => [
                  styles.navItem,
                  active && styles.navItemActive,
                  pressed && styles.navItemPressed,
                ]}
                accessibilityRole="menuitem"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.navIcon, active && styles.navIconActive]}>
                  {item.icon}
                </Text>
                <Text style={[styles.navText, active && styles.navTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Sidebar bottom */}
      <View style={styles.sidebarBottom}>
        <Pressable
          style={({ pressed }) => [styles.planCard, pressed && { opacity: 0.85 }]}
          onPress={() => router.push('/plan' as any)}
          accessibilityRole="button"
          accessibilityLabel="View your plan"
        >
          <View style={styles.planCardTop}>
            <View>
              <Text style={styles.planEyebrow}>CURRENT PLAN</Text>
              <Text style={styles.planName}>{settings.plan_name}</Text>
            </View>
            <View style={styles.planDot} />
          </View>
          <Text style={styles.planText}>Tap to manage your plan</Text>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <Text style={styles.managePlan}>Manage plan →</Text>
        </Pressable>
        <Text style={styles.version}>SERVEXA v0.1</Text>
      </View>
    </View>
  );

  const mainContent = scrollable ? (
    <ScrollView
      style={styles.main}
      contentContainerStyle={[
        styles.mainContent,
        !isDesktop && styles.mainContentMobile,
      ]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.main, styles.mainNoScroll]}>
      {children}
    </View>
  );

  if (isDesktop) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />
        <View style={styles.layout}>
          {sidebar}
          {mainContent}
        </View>
      </SafeAreaView>
    );
  }

  // Mobile layout: full width + bottom nav
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.ivory} />
      <View style={styles.mobileLayout}>
        {/* Mobile top bar */}
        <View style={styles.mobileTopBar}>
          <Pressable onPress={() => router.navigate('/')}>
            <ServexaLogo variant="wordmark" width={120} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.mobileAvatarBtn, pressed && { opacity: 0.7 }]}
            onPress={() => router.push('/settings' as any)}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <WorkspaceAvatar
              avatarUrl={profile.avatar_url}
              initials={displayInitials}
              size={36}
              radius={11}
            />
          </Pressable>
        </View>

        {/* Content */}
        {mainContent}

        {/* Bottom nav */}
        <MobileNav />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.ivory,
  },

  layout: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.ivory,
  },

  // ── Sidebar ──────────────────────────────────────────────────────────────
  sidebar: {
    width: 260,
    backgroundColor: Colors.surface,
    borderRightWidth: 1,
    borderRightColor: Colors.border,
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 18,
    justifyContent: 'space-between',
  },

  sidebarDesktop: {
    // keep as-is on desktop
  },

  sidebarTop: {
    flex: 1,
  },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 6,
    marginBottom: 28,
  },

  brandMark: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },

  brandMarkText: {
    color: Colors.surface,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: Fonts?.serif ?? 'serif',
  },

  brandName: {
    color: Colors.brand,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 1.8,
  },

  brandSub: {
    color: Colors.inkFaint,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },

  workspaceLabel: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
    paddingHorizontal: 6,
    marginBottom: 8,
  },

  workspace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    padding: 10,
    marginBottom: 20,
  },

  workspacePressed: {
    backgroundColor: Colors.ivoryDeep,
  },

  workspaceText: {
    flex: 1,
  },

  workspaceName: {
    color: Colors.ink,
    fontSize: 12,
    fontWeight: '700',
  },

  workspaceRole: {
    color: Colors.inkFaint,
    fontSize: 10,
    marginTop: 1,
  },

  workspaceChevron: {
    color: Colors.inkFaint,
    fontSize: 16,
  },

  nav: {
    gap: 4,
  },

  navItem: {
    height: 44,
    borderRadius: Radius.md,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  navItemActive: {
    backgroundColor: Colors.accentLight,
  },

  navItemPressed: {
    backgroundColor: Colors.ivoryDeep,
  },

  navIcon: {
    width: 20,
    color: Colors.inkFaint,
    fontSize: 17,
    textAlign: 'center',
  },

  navIconActive: {
    color: Colors.accent,
  },

  navText: {
    color: Colors.inkMuted,
    fontSize: 13,
    fontWeight: '600',
  },

  navTextActive: {
    color: Colors.accentText,
    fontWeight: '700',
  },

  sidebarBottom: {
    gap: 14,
  },

  planCard: {
    backgroundColor: Colors.ivoryDeep,
    borderRadius: Radius.lg,
    padding: 14,
  },

  planCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },

  planEyebrow: {
    color: Colors.inkFaint,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  planName: {
    color: Colors.ink,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 3,
  },

  planDot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    backgroundColor: Colors.positive,
    marginTop: 5,
  },

  planText: {
    color: Colors.inkFaint,
    fontSize: 10,
    marginTop: 8,
  },

  progressTrack: {
    height: 5,
    backgroundColor: Colors.border,
    borderRadius: 10,
    marginTop: 8,
    overflow: 'hidden',
  },

  progressFill: {
    width: '74%',
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 10,
  },

  managePlan: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 10,
  },

  version: {
    color: Colors.inkFaint,
    fontSize: 9,
    paddingHorizontal: 4,
  },

  // ── Main content ──────────────────────────────────────────────────────────
  main: {
    flex: 1,
    // minWidth: 0 prevents a flex child from overflowing its parent on web
    // when the child's content would otherwise force it wider than flex allows.
    minWidth: 0,
    backgroundColor: Colors.ivory,
  },

  mainNoScroll: {
    // no padding, caller handles it
  },

  mainContent: {
    padding: 24,
    paddingBottom: 60,
    maxWidth: 1400,
    width: '100%',
    alignSelf: 'center',
  },

  mainContentMobile: {
    padding: 14,
    paddingBottom: 88,
  },

  // ── Mobile layout ─────────────────────────────────────────────────────────
  mobileLayout: {
    flex: 1,
    // Clip any accidental overflow from child content on narrow viewports
    overflow: 'hidden',
    backgroundColor: Colors.ivory,
  },

  mobileTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.ivory,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },

  mobileBrand: {
    color: Colors.ink,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
  },

  mobileAvatarBtn: {
    borderRadius: 11,
    overflow: 'hidden',
  },

});
