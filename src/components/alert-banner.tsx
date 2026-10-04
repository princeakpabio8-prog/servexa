// @ts-nocheck
/**
 * AlertBanner — actionable notification item for important events.
 *
 * Usage:
 *   <AlertBanner
 *     type="escalation"
 *     title="John Smith needs attention"
 *     subtitle="Requested human assistance"
 *     action="Review"
 *     onAction={() => router.push('/call-detail?callId=...')}
 *     onDismiss={() => ...}
 *   />
 *
 * Types: escalation | follow_up | failed_call | qualified_lead | paused
 *
 * Used on the dashboard (Needs Your Attention) and activity screen.
 * Does NOT require a notification infrastructure — just uses UI state.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors, Radius } from '../constants/theme';

export type AlertType =
  | 'escalation'
  | 'follow_up'
  | 'failed_call'
  | 'qualified_lead'
  | 'paused';

type Props = {
  type: AlertType;
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  onDismiss?: () => void;
};

const CONFIG: Record<AlertType, { icon: string; bg: string; border: string; iconBg: string; iconColor: string }> = {
  escalation: {
    icon: '!',
    bg: Colors.attentionLight,
    border: '#F0CEC7',
    iconBg: Colors.attention,
    iconColor: Colors.surface,
  },
  follow_up: {
    icon: '↗',
    bg: Colors.neutralLight,
    border: Colors.border,
    iconBg: Colors.neutral,
    iconColor: Colors.surface,
  },
  failed_call: {
    icon: '✕',
    bg: Colors.attentionLight,
    border: '#F0CEC7',
    iconBg: Colors.attention,
    iconColor: Colors.surface,
  },
  qualified_lead: {
    icon: '★',
    bg: Colors.positiveLight,
    border: '#B8E2CF',
    iconBg: Colors.positive,
    iconColor: Colors.surface,
  },
  paused: {
    icon: '⏸',
    bg: Colors.neutralLight,
    border: Colors.border,
    iconBg: Colors.neutral,
    iconColor: Colors.surface,
  },
};

export default function AlertBanner({ type, title, subtitle, action, onAction, onDismiss }: Props) {
  const cfg = CONFIG[type] ?? CONFIG.follow_up;

  return (
    <View style={[styles.container, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.iconBg }]}>
        <Text style={[styles.iconText, { color: cfg.iconColor }]}>{cfg.icon}</Text>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {action && onAction && (
          <Pressable
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: cfg.iconBg }, pressed && { opacity: 0.8 }]}
            onPress={onAction}
            accessibilityRole="button"
            accessibilityLabel={action}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[styles.actionText, { color: cfg.iconColor }]}>{action}</Text>
          </Pressable>
        )}
        {onDismiss && (
          <Pressable
            onPress={onDismiss}
            style={styles.dismissBtn}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.dismissText}>✕</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 12,
    gap: 10,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: 13,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: Colors.ink,
    fontSize: 13,
    fontWeight: '600',
  },
  subtitle: {
    color: Colors.inkMuted,
    fontSize: 11,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dismissBtn: {
    padding: 4,
  },
  dismissText: {
    color: Colors.inkFaint,
    fontSize: 12,
  },
});
