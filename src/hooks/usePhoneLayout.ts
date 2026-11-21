import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

const read = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false);

/**
 * True on a phone-width screen (below the md breakpoint). Unlike `useIsMobile` it reads the screen on the first
 * render, so a page that lays itself out differently on a phone never paints the desktop version first.
 */
export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState<boolean>(read);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = () => setPhone(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return phone;
}
