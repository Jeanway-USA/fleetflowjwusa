import { useAuth } from '@/contexts/AuthContext';
import { ARCHIVE_ROLE_MAP, type ArchivableTable, ARCHIVABLE_TABLES } from '@/lib/soft-delete';

/**
 * Client-side role check for archive/restore/purge access. The server-side
 * `has_archive_access` RPC is authoritative — this is only used to gate UI.
 */
export function useArchiveAccess() {
  const { roles } = useAuth();
  const roleSet = new Set(roles ?? []);

  const canAccess = (table: ArchivableTable): boolean => {
    const allowed = ARCHIVE_ROLE_MAP[table] ?? [];
    return allowed.some((r) => roleSet.has(r as any));
  };

  const accessibleTables = ARCHIVABLE_TABLES.filter(canAccess);

  return {
    canAccess,
    accessibleTables,
    hasAnyAccess: accessibleTables.length > 0,
  };
}
