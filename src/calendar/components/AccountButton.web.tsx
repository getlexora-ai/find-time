import { useClerk, useUser } from '@clerk/clerk-expo';
import { UserButton } from '@clerk/clerk-expo/web';
import { StyleSheet, View } from 'react-native';

import { apiFetch } from '@/lib/api';

import { Icon } from '../Icon';
import { N, SANS } from '../tokens';
import { Txt } from '../ui';
import { CalendarSettings } from './CalendarSettings';

/**
 * Web account control: Clerk's `<UserButton />`. Its "Manage account" opens
 * Clerk's `<UserProfile />` as a modal overlay on top of the app; "Sign out"
 * clears the session. We add a "Calendars" page to that profile (connect,
 * reconnect, sync, disconnect Google — CalendarSettings), a menu item that
 * opens it directly, and "Delete account", which also wipes the Neon data (FK
 * cascade) before signing out.
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
        <UserButton.UserProfilePage
          label="Calendars"
          url="calendars"
          labelIcon={<Icon name="calendar" size={14} color={N.ink2} />}>
          <CalendarSettings />
        </UserButton.UserProfilePage>
        <UserButton.MenuItems>
          {/* Straight to the Calendars page in Manage account. */}
          <UserButton.Action
            label="Calendars"
            labelIcon={<Icon name="calendar" size={14} color={N.ink2} />}
            open="calendars"
          />
          {/* Back into setup (hours, best hours, deep work) — also the way back after "Finish later". */}
          <UserButton.Action
            label="Set up my week"
            labelIcon={<Icon name="target" size={14} color={N.ink2} />}
            onClick={() => window.location.assign('/welcome?redo=1')}
          />
          <UserButton.Action
            label="Delete account"
            labelIcon={<Icon name="trash" size={14} color={N.ink2} />}
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
  name: { flex: 1, color: N.ink2, fontFamily: SANS, fontSize: 13, minWidth: 0 },
});
