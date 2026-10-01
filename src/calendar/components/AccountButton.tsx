import { useClerk, useUser } from '@clerk/clerk-expo';
import { Alert, StyleSheet, View } from 'react-native';

import { apiFetch } from '@/lib/api';

import { N, R, SANS } from '../tokens';
import { Press, Txt } from '../ui';

/**
 * Native account control. Clerk has no `<UserButton />` / `<UserProfile />` on
 * native, so this is a small avatar that opens a native action sheet: manage
 * profile (web only), sign out, or delete the account (wipes Neon + Clerk).
 */
export function AccountButton({ showName = false }: { showName?: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Account';

  function confirmDelete() {
    Alert.alert('Delete account?', 'This permanently removes your account and all calendar data.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await apiFetch('/api/me', { method: 'DELETE' });
            if (!res.ok) throw new Error(String(res.status));
            await signOut();
          } catch {
            Alert.alert('Could not delete the account. Try again.');
          }
        },
      },
    ]);
  }

  function open() {
    Alert.alert(name, 'Manage your profile in the Find Time web app.', [
      { text: 'Sign out', onPress: () => void signOut() },
      { text: 'Delete account', style: 'destructive', onPress: confirmDelete },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Press onPress={open} hoverBg={N.hover} style={styles.row} accessibilityRole="button" aria-label="Account">
      <View style={styles.avatar}>
        <Txt style={styles.avatarTxt}>{initials(name)}</Txt>
      </View>
      {showName ? (
        <Txt style={styles.name} numberOfLines={1}>
          {name}
        </Txt>
      ) : null}
    </Press>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.lg, minWidth: 0 },
  avatar: {
    height: 32,
    width: 32,
    borderRadius: R.full,
    backgroundColor: N.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarTxt: { color: N.onInk, fontSize: 12, fontWeight: '500' },
  name: { flex: 1, color: N.ink2, fontFamily: SANS, fontSize: 13, minWidth: 0 },
});
