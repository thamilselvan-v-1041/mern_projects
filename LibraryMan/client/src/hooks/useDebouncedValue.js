import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` that updates only after `delay` ms of inactivity.
 * Useful for search inputs over large lists.
 */
export default function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
