import { useCallback, useState } from 'react';

export function useMultiSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const select = useCallback((id: string) => {
    setSelectedIds((current) => {
      if (current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.add(id);
      return next;
    });
  }, []);

  const toggle = useCallback((id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    selectionMode: selectedIds.size > 0,
    isSelected: (id: string) => selectedIds.has(id),
    select,
    toggle,
    clear,
  };
}
