/**
 * Conflict resolver — pure logic module with no I/O.
 * Imported by both the sync worker (receive handler) and the sync route
 * (manual-resolve endpoint).  Zero side effects; all functions are synchronous.
 *
 * Strategies:
 *   lww   — last-write-wins by updated_at timestamp (safe default; identical to
 *            previous behaviour so existing deployments are not disrupted)
 *   merge — field-level non-destructive merge: most-advanced status, union of
 *            reference arrays, later timestamps, deduped attachment list
 *   flag  — do not auto-apply; save both versions to sync_conflicts so a human
 *            can choose via the Sync Conflicts UI
 */

import { computeChecksum } from '../utils/aimailFormat.js';
import type { AimailDocument } from '../utils/aimailFormat.js';

export type ConflictStrategy = 'lww' | 'merge' | 'flag';

export interface ConflictInfo {
  isConflict: boolean;
  localIsNewer: boolean;
  reason: string;
}

// Processing advancement order (higher = more processed)
const STATUS_RANK: Record<AimailDocument['status'], number> = {
  unprocessed: 0,
  processing: 1,
  failed: 1,
  processed: 2,
};

/** Compare two versions of the same entity and decide whether a conflict exists. */
export function detectConflict(
  existing: AimailDocument,
  incoming: AimailDocument
): ConflictInfo {
  if (existing.checksum === incoming.checksum) {
    return { isConflict: false, localIsNewer: false, reason: 'identical' };
  }

  const existingMs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
  const incomingMs = incoming.updated_at ? new Date(incoming.updated_at).getTime() : 0;
  const localIsNewer = existingMs > incomingMs;

  // Incoming is simply a later version in the linear chain — not a fork
  if (incoming.transfer_version > existing.transfer_version) {
    return {
      isConflict: false,
      localIsNewer: false,
      reason: `Incoming v${incoming.transfer_version} supersedes local v${existing.transfer_version}`,
    };
  }

  // Same or older transfer_version but different checksum → concurrent edit (fork)
  return {
    isConflict: true,
    localIsNewer,
    reason:
      incoming.transfer_version === existing.transfer_version
        ? `Concurrent edit at v${existing.transfer_version} from different devices`
        : `Local v${existing.transfer_version} ahead of incoming v${incoming.transfer_version} with divergent content`,
  };
}

/**
 * Field-level merge of two AimailDocuments.
 * - Status: whichever is more advanced (processed > processing/failed > unprocessed)
 * - Reference arrays (order_numbers, invoice_numbers, purchase_numbers): union
 * - Attachment list: union by filename
 * - Free-form text (distributor, subject, body): from the more recently updated side
 * - transfer_version: max + 1
 * Returns a fully checksummed document.
 */
export function mergeDocuments(
  local: AimailDocument,
  remote: AimailDocument
): AimailDocument {
  const localMs  = local.updated_at  ? new Date(local.updated_at).getTime()  : 0;
  const remoteMs = remote.updated_at ? new Date(remote.updated_at).getTime() : 0;

  // Base = whichever was touched more recently (for free-form text fields)
  const base  = localMs >= remoteMs ? local  : remote;
  const other = base === local       ? remote : local;

  const mergedStatus =
    (STATUS_RANK[local.status] ?? 0) >= (STATUS_RANK[remote.status] ?? 0)
      ? local.status
      : remote.status;

  const unionStr = (a: string[], b: string[]) => [...new Set([...a, ...b])];

  const mergedAttachments = [
    ...local.attachment_list,
    ...remote.attachment_list.filter(
      ra => !local.attachment_list.some(la => la.filename === ra.filename)
    ),
  ];

  const merged: AimailDocument = {
    ...base,
    status:           mergedStatus,
    order_numbers:    unionStr(local.order_numbers,    remote.order_numbers),
    invoice_numbers:  unionStr(local.invoice_numbers,  remote.invoice_numbers),
    purchase_numbers: unionStr(local.purchase_numbers, remote.purchase_numbers),
    attachment_list:  mergedAttachments,
    transfer_version: Math.max(local.transfer_version, remote.transfer_version) + 1,
    updated_at:       new Date().toISOString(),
    checksum:         '',
  };

  merged.checksum = computeChecksum(merged);
  return merged;
}

/**
 * Auto-resolve a conflict.  Returns { winner, loser } for the caller to persist.
 * For 'flag' strategy, the caller is responsible for saving to sync_conflicts;
 * this function still returns existing as winner so the DB is not mutated.
 */
export function resolveAutomatic(
  existing: AimailDocument,
  incoming: AimailDocument,
  strategy: ConflictStrategy,
  info: ConflictInfo
): { winner: AimailDocument; loser: AimailDocument; resolution: string } {
  if (strategy === 'lww') {
    const winner = info.localIsNewer ? existing : incoming;
    const loser  = info.localIsNewer ? incoming : existing;
    return { winner, loser, resolution: `lww:${info.localIsNewer ? 'kept_local' : 'took_remote'}` };
  }

  if (strategy === 'merge') {
    const merged = mergeDocuments(existing, incoming);
    return { winner: merged, loser: incoming, resolution: 'merge' };
  }

  // 'flag' — keep existing, let human resolve
  return { winner: existing, loser: incoming, resolution: 'flagged' };
}
