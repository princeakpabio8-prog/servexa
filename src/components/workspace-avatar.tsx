// @ts-nocheck
/**
 * WorkspaceAvatar
 *
 * Shared avatar component used in:
 *   - Sidebar workspace card (app-shell.tsx)
 *   - Mobile top bar (app-shell.tsx)
 *   - Settings screen profile card (settings.tsx)
 *   - Edit Profile screen (edit-profile.tsx)
 *
 * When avatarUrl is set: renders the image.
 * When null: renders the initials fallback (same teal background as before).
 *
 * Props:
 *   avatarUrl  – signed URL from useWorkspace, or null
 *   initials   – fallback text (e.g. "AO")
 *   size       – pixel diameter; defaults to 32
 *   radius     – border-radius; defaults to size * 0.3
 */
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/theme';

type Props = {
  avatarUrl:  string | null;
  initials:   string;
  size?:      number;
  radius?:    number;
};

export default function WorkspaceAvatar({ avatarUrl, initials, size = 32, radius }: Props) {
  const r      = radius ?? Math.round(size * 0.31);
  const fs     = Math.round(size * 0.34);
  const container = {
    width:            size,
    height:           size,
    borderRadius:     r,
    backgroundColor:  Colors.accentLight,
    alignItems:       'center' as const,
    justifyContent:   'center' as const,
    overflow:         'hidden' as const,
  };

  if (avatarUrl) {
    return (
      <View style={container}>
        <Image
          source={{ uri: avatarUrl }}
          style={{ width: size, height: size }}
          contentFit="cover"
          // Show initials placeholder while the image loads
          placeholder={initials}
          transition={150}
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  return (
    <View style={container}>
      <Text style={[styles.text, { fontSize: fs, lineHeight: size }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  text: {
    color:      Colors.accentText,
    fontWeight: '800',
    textAlign:  'center',
  },
});
