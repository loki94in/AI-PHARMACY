import { createHash } from 'crypto';

export const AIMAIL_SCHEMA_VERSION = 1 as const;

export interface AimailAttachment {
  filename: string;
  mimetype: string;
  size_bytes: number;
  checksum: string; // SHA-256 of attachment bytes
}

export interface AimailDocument {
  schema_version: typeof AIMAIL_SCHEMA_VERSION;
  id: string;               // UUID — stable across devices
  source_device_id: string; // UUID of the originating device

  // Email envelope
  distributor: string | null;
  subject: string;
  body: string;

  // Extracted reference numbers
  order_numbers: string[];
  invoice_numbers: string[];
  purchase_numbers: string[];

  // Processing state on the originating device
  status: 'unprocessed' | 'processing' | 'processed' | 'failed';

  // Attachments — metadata only; binary transfer deferred to later phase
  attachment_list: AimailAttachment[];

  // Sync metadata
  sync_status: 'pending' | 'synced';
  transfer_version: number;

  // Integrity — SHA-256 of canonical JSON with checksum field set to ""
  checksum: string;

  // Timestamps (ISO 8601)
  email_received_at: string | null;
  created_at: string;
  updated_at: string;
  synced_at: string | null;
}

/**
 * Compute SHA-256 checksum over a canonical representation of the document.
 * The checksum field itself is excluded (set to "" before hashing) so the
 * value is deterministic regardless of the field's current value.
 */
export function computeChecksum(doc: AimailDocument): string {
  const copy: AimailDocument = { ...doc, checksum: '' };
  // Canonical JSON: sorted top-level keys, no trailing whitespace
  const keys = Object.keys(copy).sort() as (keyof AimailDocument)[];
  const canonical: Record<string, unknown> = {};
  for (const k of keys) {
    canonical[k] = copy[k];
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

/** Return true if doc.checksum matches a freshly computed checksum */
export function verifyChecksum(doc: AimailDocument): boolean {
  return doc.checksum === computeChecksum(doc);
}

/** Serialise to a JSON string (the on-wire / on-disk format) */
export function serializeAimail(doc: AimailDocument): string {
  return JSON.stringify(doc);
}

/** Parse and basic-validate a JSON string into an AimailDocument */
export function deserializeAimail(json: string): AimailDocument {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    throw new Error('Invalid .aimail payload: not valid JSON');
  }
  if (typeof obj !== 'object' || obj === null) {
    throw new Error('Invalid .aimail payload: expected object');
  }
  const doc = obj as AimailDocument;
  if (doc.schema_version !== AIMAIL_SCHEMA_VERSION) {
    throw new Error(`Unsupported .aimail schema version: ${doc.schema_version}`);
  }
  if (!doc.id || !doc.source_device_id) {
    throw new Error('Invalid .aimail payload: missing required fields (id, source_device_id)');
  }
  return doc;
}

/** Build a new AimailDocument with a computed checksum */
export function buildAimail(
  fields: Omit<AimailDocument, 'schema_version' | 'checksum'>
): AimailDocument {
  const doc: AimailDocument = {
    schema_version: AIMAIL_SCHEMA_VERSION,
    checksum: '',
    ...fields,
  };
  doc.checksum = computeChecksum(doc);
  return doc;
}
