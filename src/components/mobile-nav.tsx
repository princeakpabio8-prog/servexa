// @ts-nocheck
/**
 * MobileNav — Bottom navigation bar for mobile screens.
 * Only shown when viewport width < 768.
 */
import { router, usePathname } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/theme';

type NavItem = {
  label: string;
  icon: string;
  route: string;
  paths: string[];
};

const NAV_ITEMS: NavItem[] = [
  { label: 'Overview',     icon: '⌂',  route: '/',           paths: ['/'] },
  { label: 'AI Employees', icon: '◉',  route: '/campaigns',  paths: ['/campaigns', '/employee'] },
  { label: 'Customers',    icon: '◎',  route: '/customers',  paths: ['/customers', '/call-detail', '/call-instruction'] },
  { label: 'Activity',     icon: '◷',  route: '/activity',   paths: ['/activity'] },
  { label: 'Settings',     icon: '⚙',  route: '/settings',   paths: ['/settings'] },
];

export default function MobileNav() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: Math.max(insets.bottom, 8) },
      ]}
      accessibilityRole="tablist"
    >
      {NAV_ITEMS.map((item) => {
        const active = item.paths.some((p) =>
          p === '/' ? pathname === '/' : pathname.startsWith(p)
        );
        return (
          <Pressable
            key={item.label}
            style={({ pressed }) => [
              styles.tab,
              pressed && styles.tabPressed,
            ]}
            onPress={() => router.replace(item.route as any)}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabIcon, active && styles.tabIconActive]}>
              {item.icon}
            </Text>
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {item.label}
            </Text>
            {active && <View style={styles.tabActiveDot} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
    paddingHorizontal: 4,
    // subtle shadow upward
    ...Platform.select({
      ios: {
        shadowColor: '#1A1A1A',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      },
      android: { elevation: 8 },
      web: { boxShadow: '0 -4px 12px rgba(0,0,0,0.06)' } as any,
    }),
  },

  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 12,
    position: 'relative',
    minHeight: 48,
    justifyContent: 'center',
  },

  tabPressed: {
    backgroundColor: Colors.ivoryDeep,
  },

  tabIcon: {
    fontSize: 20,
    color: Colors.inkFaint,
    marginBottom: 3,
    lineHeight: 24,
  },

  tabIconActive: {
    color: Colors.accent,
  },

  tabLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: Colors.inkFaint,
    letterSpacing: 0.3,
  },

  tabLabelActive: {
    color: Colors.accent,
    fontWeight: '700',
  },

  tabActiveDot: {
    position: 'absolute',
    top: 2,
    width: 4,
    height: 4,
    borderRadius: 4,
    backgroundColor: Colors.accent,
  },
});
