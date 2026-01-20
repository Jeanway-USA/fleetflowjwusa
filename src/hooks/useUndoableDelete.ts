import { useRef, useCallback } from 'react';
import { toast } from 'sonner';

interface UndoableDeleteOptions<T> {
  onDelete: (id: string) => Promise<void>;
  onRestore: (item: T) => Promise<void>;
  getItemName: (item: T) => string;
  entityName: string;
  undoTimeout?: number;
}

interface PendingDeletion<T> {
  item: T;
  id: string;
  timeoutId: NodeJS.Timeout;
  toastId: string | number;
}

export function useUndoableDelete<T extends { id: string }>({
  onDelete,
  onRestore,
  getItemName,
  entityName,
  undoTimeout = 5000,
}: UndoableDeleteOptions<T>) {
  const pendingDeletions = useRef<Map<string, PendingDeletion<T>>>(new Map());

  const executeDelete = useCallback(async (id: string) => {
    const pending = pendingDeletions.current.get(id);
    if (!pending) return;

    try {
      await onDelete(id);
      pendingDeletions.current.delete(id);
    } catch (error) {
      // If delete fails, show error
      toast.error(`Failed to delete ${entityName}`);
      pendingDeletions.current.delete(id);
    }
  }, [onDelete, entityName]);

  const undoDelete = useCallback(async (id: string) => {
    const pending = pendingDeletions.current.get(id);
    if (!pending) return;

    // Clear the timeout
    clearTimeout(pending.timeoutId);
    
    // Dismiss the toast
    toast.dismiss(pending.toastId);

    try {
      // Restore the item
      await onRestore(pending.item);
      toast.success(`${entityName} restored`);
    } catch (error) {
      toast.error(`Failed to restore ${entityName}`);
    } finally {
      pendingDeletions.current.delete(id);
    }
  }, [onRestore, entityName]);

  const deleteWithUndo = useCallback(async (item: T) => {
    const id = item.id;
    const itemName = getItemName(item);

    // First, perform the actual deletion immediately
    try {
      await onDelete(id);
    } catch (error: any) {
      toast.error(error.message || `Failed to delete ${entityName}`);
      return;
    }

    // Create a unique toast ID
    const toastId = `delete-${id}-${Date.now()}`;

    // Set up the timeout for permanent deletion confirmation
    const timeoutId = setTimeout(() => {
      const pending = pendingDeletions.current.get(id);
      if (pending) {
        toast.dismiss(pending.toastId);
        pendingDeletions.current.delete(id);
      }
    }, undoTimeout);

    // Store the pending deletion
    pendingDeletions.current.set(id, {
      item,
      id,
      timeoutId,
      toastId,
    });

    // Show toast with undo action
    toast.success(`${entityName} "${itemName}" deleted`, {
      id: toastId,
      duration: undoTimeout,
      action: {
        label: 'Undo',
        onClick: () => undoDelete(id),
      },
    });
  }, [getItemName, entityName, undoTimeout, onDelete, undoDelete]);

  const cancelPendingDeletions = useCallback(() => {
    pendingDeletions.current.forEach((pending) => {
      clearTimeout(pending.timeoutId);
      toast.dismiss(pending.toastId);
    });
    pendingDeletions.current.clear();
  }, []);

  return {
    deleteWithUndo,
    cancelPendingDeletions,
  };
}
