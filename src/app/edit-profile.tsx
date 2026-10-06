// @ts-nocheck
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
    useWindowDimensions,
} from 'react-native';
import AppShell from '../components/app-shell';
import WorkspaceAvatar from '../components/workspace-avatar';
// Colors and Radius tokens used by sub-components via their own imports.
import { removeAvatar, saveAvatar, saveUserProfile, useWorkspace } from '../lib/workspace';

const LABEL_STYLE = { color: '#8C96A0', fontSize: 9, fontWeight: '800', letterSpacing: 1.3, marginBottom: 6 } as const;

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', autoCapitalize = 'words', optional = false }: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: any;
  autoCapitalize?: any;
  optional?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={LABEL_STYLE}>
        {label}
        {optional && <Text style={styles.optionalTag}> (optional)</Text>}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B0BAC3"
        style={styles.input}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        returnKeyType="done"
      />
    </View>
  );
}

export default function EditProfileScreen() {
  const { width } = useWindowDimensions();
  const isMobile = width < 768;
  const { profile, refresh } = useWorkspace();

  const [fullName,     setFullName]     = useState('');
  const [companyName,  setCompanyName]  = useState('');
  const [email,        setEmail]        = useState('');
  const [businessType, setBusinessType] = useState('');
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);

  // Avatar state — tracks the current signed URL for display only
  const [avatarUrl,      setAvatarUrl]      = useState<string | null>(null);
  const [avatarLoading,  setAvatarLoading]  = useState(false);
  const [avatarError,    setAvatarError]    = useState('');

  // Pre-fill form with existing profile data once loaded
  useEffect(() => {
    if (profile.full_name !== '' || profile.company_name !== 'My Workspace') {
      setFullName(profile.full_name);
      setCompanyName(profile.company_name !== 'My Workspace' ? profile.company_name : '');
      setEmail(profile.email);
      setBusinessType(profile.business_type);
    }
    // Sync avatar URL from profile (signed URL refreshed by useWorkspace on load)
    setAvatarUrl(profile.avatar_url);
  }, [profile.full_name, profile.company_name, profile.email, profile.business_type, profile.avatar_url]);

  const canSave = fullName.trim().length > 0 && companyName.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const { error } = await saveUserProfile({
        full_name:     fullName.trim(),
        company_name:  companyName.trim(),
        email:         email.trim(),
        business_type: businessType.trim(),
        use_cases:     profile.use_cases,
      });
      if (error) {
        Alert.alert('Could not save', 'Your profile could not be updated. Please try again.');
        return;
      }
      await refresh();
      setSaved(true);
      setTimeout(() => router.back(), 900);
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Avatar handlers ──────────────────────────────────────────────────────────

  const handlePickAvatar = async () => {
    if (avatarLoading) return;
    setAvatarError('');

    // Request media library permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setAvatarError('Photo library permission is required to choose an image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],       // square crop for avatar
      quality: 0.75,
      exif: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset    = result.assets[0];
    const mimeType = asset.mimeType ?? 'image/jpeg';

    setAvatarLoading(true);
    try {
      const { signedUrl, error } = await saveAvatar(asset.uri, mimeType);
      if (error) {
        setAvatarError('Could not upload avatar. Please try again.');
        console.error('[edit-profile] saveAvatar error:', error);
      } else {
        setAvatarUrl(signedUrl);
        // Refresh workspace state so sidebar/mobile header also update
        await refresh();
      }
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleRemoveAvatar = () => {
    if (avatarLoading) return;
    Alert.alert(
      'Remove avatar',
      'Remove your workspace avatar and return to the initials display?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setAvatarLoading(true);
            setAvatarError('');
            try {
              const { error } = await removeAvatar();
              if (error) {
                setAvatarError('Could not remove avatar. Please try again.');
              } else {
                setAvatarUrl(null);
                await refresh();
              }
            } finally {
              setAvatarLoading(false);
            }
          },
        },
      ]
    );
  };

  const displayInitials = profile.initials || '?';

  return (
    <AppShell>
      {/* Header */}
      <View style={styles.pageHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.eyebrow}>WORKSPACE CONFIGURATION</Text>
          <Text style={styles.title}>Edit workspace</Text>
          <Text style={styles.subtitle}>
            Update your business details. Changes are saved to your account only.
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back to settings"
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <View style={[styles.card, !isMobile && styles.cardDesktop]}>

          {/* ── Avatar row ──────────────────────────────────────────────────── */}
          <View style={styles.avatarSection}>
            {/* Avatar with upload-progress overlay */}
            <View style={styles.avatarWrap}>
              <WorkspaceAvatar
                avatarUrl={avatarUrl}
                initials={displayInitials}
                size={64}
                radius={18}
              />
              {avatarLoading && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </View>
            <View style={styles.avatarActions}>
              <Text style={styles.avatarLabel}>WORKSPACE AVATAR</Text>
              <View style={styles.avatarBtns}>
                <Pressable
                  style={({ pressed }) => [
                    styles.avatarBtn,
                    pressed && { opacity: 0.75 },
                    avatarLoading && styles.avatarBtnDisabled,
                  ]}
                  onPress={handlePickAvatar}
                  disabled={avatarLoading}
                  accessibilityRole="button"
                  accessibilityLabel={avatarUrl ? 'Replace avatar image' : 'Upload avatar image'}
                >
                  <Text style={styles.avatarBtnText}>
                    {avatarLoading ? 'Uploading…' : avatarUrl ? 'Replace' : 'Upload photo'}
                  </Text>
                </Pressable>

                {avatarUrl && !avatarLoading && (
                  <Pressable
                    style={({ pressed }) => [styles.avatarRemoveBtn, pressed && { opacity: 0.7 }]}
                    onPress={handleRemoveAvatar}
                    accessibilityRole="button"
                    accessibilityLabel="Remove avatar"
                  >
                    <Text style={styles.avatarRemoveBtnText}>Remove</Text>
                  </Pressable>
                )}
              </View>

              {avatarError ? (
                <Text style={styles.avatarErrorText}>{avatarError}</Text>
              ) : (
                <Text style={styles.avatarHint}>
                  {avatarUrl ? 'Square image, max 2 MB' : 'JPG, PNG or WebP · max 2 MB'}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.divider} />

          <Field
            label="YOUR NAME"
            value={fullName}
            onChangeText={setFullName}
            placeholder="e.g. Ada Okafor"
          />
          <Field
            label="COMPANY / BUSINESS NAME"
            value={companyName}
            onChangeText={setCompanyName}
            placeholder="e.g. Lekki Gardens Ltd."
          />
          <Field
            label="WORK EMAIL"
            value={email}
            onChangeText={setEmail}
            placeholder="you@company.com"
            keyboardType="email-address"
            autoCapitalize="none"
            optional
          />
          <Field
            label="BUSINESS TYPE"
            value={businessType}
            onChangeText={setBusinessType}
            placeholder="e.g. Microfinance, Healthcare, Retail…"
            autoCapitalize="sentences"
            optional
          />

          {/* Save button — also disabled while avatar is uploading */}
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              (!canSave || saving || avatarLoading) && styles.saveBtnDisabled,
              pressed && canSave && !saving && !avatarLoading && styles.saveBtnPressed,
              saved && styles.saveBtnSaved,
            ]}
            onPress={handleSave}
            disabled={!canSave || saving || avatarLoading}
            accessibilityRole="button"
            accessibilityLabel="Save workspace profile"
          >
            <Text style={[styles.saveBtnText, (!canSave || saving || avatarLoading) && styles.saveBtnTextDisabled]}>
              {avatarLoading ? 'Upload in progress…' : saving ? 'Saving…' : saved ? '✓ Saved' : 'Save changes'}
            </Text>
          </Pressable>

          <Text style={styles.notice}>
            Your business details are private to your workspace and are never shared with other SERVEXA users.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </AppShell>
  );
}

const styles = StyleSheet.create({
  pageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 22,
    // Prevent the row from forcing its parent wider than the viewport
    minWidth: 0,
  },
  eyebrow:  { color: '#99A2AA', fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  title:    { color: '#15232E', fontSize: 28, fontWeight: '900', marginTop: 5 },
  subtitle: { color: '#77828C', fontSize: 12, marginTop: 6 },

  backBtn: {
    backgroundColor: '#F5F7F9',
    borderWidth: 1,
    borderColor: '#E0E4E8',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 38,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backBtnText: { color: '#2D3A42', fontSize: 11, fontWeight: '600' },

  card: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E8EC',
    borderRadius: 20,
    padding: 20,
    gap: 18,
  },
  cardDesktop: {
    maxWidth: 560,
  },

  // ── Avatar section ────────────────────────────────────────────────────────
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrap: {
    position: 'relative',
    width: 64,
    height: 64,
  },
  avatarOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActions: {
    flex: 1,
    gap: 6,
  },
  avatarLabel: {
    color: '#8C96A0',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.3,
  },
  avatarBtns: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  avatarBtn: {
    backgroundColor: '#15232E',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 36,
    justifyContent: 'center',
  },
  avatarBtnDisabled: {
    opacity: 0.55,
  },
  avatarBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  avatarRemoveBtn: {
    borderWidth: 1,
    borderColor: '#DCE2E8',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    minHeight: 36,
    justifyContent: 'center',
  },
  avatarRemoveBtnText: {
    color: '#C0392B',
    fontSize: 11,
    fontWeight: '600',
  },
  avatarHint: {
    color: '#B0BAC3',
    fontSize: 10,
  },
  avatarErrorText: {
    color: '#C0392B',
    fontSize: 10,
  },

  divider: {
    height: 1,
    backgroundColor: '#EEF1F4',
    marginVertical: 2,
  },

  // ── Fields ────────────────────────────────────────────────────────────────
  field: { gap: 0 },

  optionalTag: { color: '#B0BAC3', fontSize: 9, fontWeight: '400', letterSpacing: 0 },

  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#DCE2E8',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    color: '#15232E',
    backgroundColor: '#FAFBFC',
  },

  // ── Save ──────────────────────────────────────────────────────────────────
  saveBtn: {
    backgroundColor: '#15232E',
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    marginTop: 6,
  },
  saveBtnDisabled: {
    backgroundColor: '#EDF0F2',
    borderWidth: 1,
    borderColor: '#DCE2E8',
  },
  saveBtnPressed: { opacity: 0.88 },
  saveBtnSaved: { backgroundColor: '#147983' },
  saveBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  saveBtnTextDisabled: { color: '#A0AAB2' },

  notice: {
    color: '#8C969F',
    fontSize: 10,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});
