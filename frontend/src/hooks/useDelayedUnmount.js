import { useEffect, useRef, useState } from 'react';

// Keeps a component mounted for `duration` ms after `active` flips false, so
// a CSS exit animation can play instead of the element vanishing instantly.
// Consumers render null while this returns false, and otherwise toggle an
// "entering" vs "leaving" class based on the `active` flag itself.
export function useDelayedUnmount(active, duration = 220) {
  const [mounted, setMounted] = useState(active);
  const timeoutRef = useRef(null);

  useEffect(() => {
    clearTimeout(timeoutRef.current);
    if (active) {
      setMounted(true);
    } else {
      timeoutRef.current = setTimeout(() => setMounted(false), duration);
    }
    return () => clearTimeout(timeoutRef.current);
  }, [active, duration]);

  return mounted;
}
