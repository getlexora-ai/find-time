import { useClerk, useUser } from '@clerk/clerk-expo';
import { UserButton } from '@clerk/clerk-expo/web';
import { StyleSheet, View } from 'react-native';

import { apiFetch } from '@/lib/api';

import { T } from '../tokens';
import { Txt } from '../ui';

/**
 * Web account control: Clerk's `<UserButton />`. Its "Manage account" opens
 * Clerk's `<UserProfile />` as a modal overlay on top of the app; "Sign out"
 * clears the session. We add one custom item, "Delete account", which also wipes
 * the Neon data (FK cascade) before signing out.
 */
export function AccountButton({ showName = false }: { showName?: boolean }) {
  const { user } = useUser();
  const { signOut } = useClerk();

  async function handleDelete() {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Delete your account and all calendar data? This cannot be undone.')
    ) {
      return;
    }
    try {
      const res = await apiFetch('/api/me', { method: 'DELETE' });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      if (typeof window !== 'undefined') window.alert('Could not delete the account. Try again.');
      return;
    }
    await signOut({ redirectUrl: '/login' });
  }

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || '';

  return (
    <View style={styles.row}>
      <UserButton afterSignOutUrl="/login">
        <UserButton.MenuItems>
          <UserButton.Action
            label="Delete account"
            labelIcon={<Txt style={styles.trash}>🗑️</Txt>}
            onClick={handleDelete}
          />
        </UserButton.MenuItems>
      </UserButton>
      {showName && name ? (
        <Txt style={styles.name} numberOfLines={1}>
          {name}
        </Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  name: { flex: 1, color: '#fff', fontSize: T.sm.fontSize, minWidth: 0 },
  trash: { fontSize: 14 },
});
