// @ts-nocheck
/**
 * useWorkspace — loads and caches the current user's profile and workspace
 * settings from Supabase. Replaces all hardcoded "Example Organization" /
 * "Lekki Gardens" / "AE" placeholders throughout the app.
 *
 * Returns:
 *   profile  – name, company, initials, email, business type, use cases
 *   settings – automation prefs, plan
 *   loading  – true while the first fetch is in flight
 *   refresh  – re-fetch from the database
 *   updateSettings – optimistically update a workspace setting and persist it
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export type UserProfile = {
  full_name:     string;
  company_name:  string;
  email:         string;
  business_type: string;
  use_cases:     string[];
  initials:      string;
  /** Signed URL for the workspace avatar, or null when no avatar is set. */
  avatar_url:    string | null;
};

export type WorkspaceSettings = {
  auto_follow_ups:    boolean;
  escalate_difficult: boolean;
  payment_reminders:  boolean;
  plan_name:          string;
  plan_status:        string;
};

const DEFAULT_PROFILE: UserProfile = {
  full_name:     '',
  company_name:  'My Workspace',
  email:         '',
  business_type: '',
  use_cases:     [],
  initials:      '?',
  avatar_url:    null,
};

const DEFAULT_SETTINGS: WorkspaceSettings = {
  auto_follow_ups:    true,
  escalate_difficult: true,
  payment_reminders:  true,
  plan_name:          'Free',
  plan_status:        'active',
};

export function useWorkspace() {
  const [profile,  setProfile]  = useState<UserProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<WorkspaceSettings>(DEFAULT_SETTINGS);
  const [loading,  setLoading]  = useState(true);
  const [userId,   setUserId]   = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        setLoading(false);
        return;
      }
      const uid = session.user.id;
      setUserId(uid);

      const [profRes, settRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('full_name, company_name, email, business_type, use_cases, initials, avatar_url')
          .eq('id', uid)
          .maybeSingle(),
        supabase
          .from('workspace_settings')
          .select('auto_follow_ups, escalate_difficult, payment_reminders, plan_name, plan_status')
          .eq('id', uid)
          .maybeSingle(),
      ]);

      if (profRes.data) {
        // If a stored avatar_url exists, refresh it as a short-lived signed URL
        // so it works on private buckets without exposing a permanent link.
        let signedAvatarUrl: string | null = null;
        if (profRes.data.avatar_url) {
          // The stored value is the storage path (e.g. "{uid}/avatar"), not a URL.
          const { data: signData } = await supabase.storage
            .from('avatars')
            .createSignedUrl(profRes.data.avatar_url, 3600); // 1 hour
          signedAvatarUrl = signData?.signedUrl ?? null;
        }
        setProfile({
          full_name:     profRes.data.full_name     ?? '',
          company_name:  profRes.data.company_name  || 'My Workspace',
          email:         profRes.data.email         ?? '',
          business_type: profRes.data.business_type ?? '',
          use_cases:     profRes.data.use_cases     ?? [],
          initials:      profRes.data.initials      || makeInitials(profRes.data.full_name, profRes.data.company_name),
          avatar_url:    signedAvatarUrl,
        });
      }

      if (settRes.data) {
        setSettings({
          auto_follow_ups:    settRes.data.auto_follow_ups    ?? true,
          escalate_difficult: settRes.data.escalate_difficult ?? true,
          payment_reminders:  settRes.data.payment_reminders  ?? true,
          plan_name:          settRes.data.plan_name          ?? 'Free',
          plan_status:        settRes.data.plan_status        ?? 'active',
        });
      }
    } catch (e) {
      console.warn('[useWorkspace] fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
    // Re-fetch when auth state changes (sign-in / sign-out / token refresh).
    // On SIGNED_OUT we immediately reset to defaults so a previous user's
    // data is never visible to the next user on the same device.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setProfile(DEFAULT_PROFILE);
        setSettings(DEFAULT_SETTINGS);
        setUserId(null);
      } else {
        fetchAll();
      }
    });
    return () => subscription.unsubscribe();
  }, [fetchAll]);

  /**
   * Optimistically toggle a boolean workspace setting and persist to Supabase.
   * Falls back to upsert so a missing row is created automatically.
   */
  const updateSettings = useCallback(async (key: keyof WorkspaceSettings, value: boolean | string) => {
    if (!userId) return;
    setSettings((prev) => ({ ...prev, [key]: value }));
    const { error } = await supabase
      .from('workspace_settings')
      .upsert({ id: userId, [key]: value, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) {
      console.warn('[useWorkspace] updateSettings error:', error);
      // Roll back optimistic update on failure
      setSettings((prev) => ({ ...prev, [key]: !value }));
    }
  }, [userId]);

  return { profile, settings, loading, refresh: fetchAll, updateSettings, userId };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function makeInitials(fullName: string, companyName?: string): string {
  const name = fullName?.trim() || companyName?.trim() || '';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Save an onboarding profile for the current authenticated user.
 * Uses upsert so re-running onboarding simply updates the existing row.
 */
export async function saveUserProfile(profile: {
  full_name:     string;
  company_name:  string;
  email:         string;
  business_type: string;
  use_cases:     string[];
}): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'No authenticated session' };

  const uid      = session.user.id;
  const initials = makeInitials(profile.full_name, profile.company_name);

  const [profResult, settResult] = await Promise.all([
    supabase
      .from('user_profiles')
      .upsert({
        id:            uid,
        full_name:     profile.full_name.trim(),
        company_name:  profile.company_name.trim(),
        email:         profile.email.trim(),
        business_type: profile.business_type.trim(),
        use_cases:     profile.use_cases,
        initials,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'id' }),
    supabase
      .from('workspace_settings')
      .upsert({
        id:         uid,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }),
  ]);

  if (profResult.error) {
    console.error('[saveUserProfile] profile error:', profResult.error);
    return { error: profResult.error.message };
  }
  return { error: null };
}

/**
 * Upload a new avatar image for the current user and persist the storage path
 * in user_profiles.avatar_url.
 *
 * @param localUri  – local file URI from expo-image-picker (e.g. file:///...)
 * @param mimeType  – e.g. "image/jpeg"
 * @returns signed URL of the newly uploaded avatar, or an error string.
 */
export async function saveAvatar(
  localUri: string,
  mimeType: string = 'image/jpeg'
): Promise<{ signedUrl: string | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { signedUrl: null, error: 'No authenticated session' };

  const uid      = session.user.id;
  const path     = `${uid}/avatar`;          // deterministic — one file per user
  const ext      = mimeType.split('/')[1] ?? 'jpg';
  const fileName = `avatar.${ext}`;

  // Fetch the local file as a Blob (works on web + native via expo-file-system polyfill)
  let blob: Blob;
  try {
    const response = await fetch(localUri);
    blob = await response.blob();
  } catch (e) {
    return { signedUrl: null, error: 'Could not read image file.' };
  }

  // Upload to storage — upsert so a second upload replaces the first
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, blob, {
      contentType: mimeType,
      upsert: true,
      cacheControl: '3600',
    });

  if (uploadError) {
    console.error('[saveAvatar] upload error:', uploadError);
    return { signedUrl: null, error: uploadError.message };
  }

  // Persist the storage path (not a signed URL) so it survives signed-URL expiry
  const { error: dbError } = await supabase
    .from('user_profiles')
    .upsert({ id: uid, avatar_url: path, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (dbError) {
    console.error('[saveAvatar] db error:', dbError);
    return { signedUrl: null, error: dbError.message };
  }

  // Return a fresh signed URL for immediate display
  const { data: signData } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 3600);

  return { signedUrl: signData?.signedUrl ?? null, error: null };
}

/**
 * Remove the workspace avatar: delete from storage and clear avatar_url in DB.
 */
export async function removeAvatar(): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'No authenticated session' };

  const uid  = session.user.id;
  const path = `${uid}/avatar`;

  // Remove from storage (ignore "not found" — may have never been uploaded)
  await supabase.storage.from('avatars').remove([path]);

  // Clear in DB
  const { error: dbError } = await supabase
    .from('user_profiles')
    .upsert({ id: uid, avatar_url: null, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  if (dbError) {
    console.error('[removeAvatar] db error:', dbError);
    return { error: dbError.message };
  }
  return { error: null };
}
