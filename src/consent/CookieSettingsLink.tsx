import { COOKIES } from '@/landing/copy';

import { openCookieSettings } from './store';

/** "Cookie settings" for footers (web, DOM): reopens the consent dialog any time. */
export function CookieSettingsLink({ className = 'link' }: { className?: string }) {
  return (
    <button type="button" className={`${className} cc-reopen`} onClick={openCookieSettings}>
      {COOKIES.settings}
    </button>
  );
}
