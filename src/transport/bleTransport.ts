/**
 * BLE peripheral transport — desktop acts as GATT peripheral so mobile can push
 * AIMAIL payloads over Bluetooth when Wi-Fi is unavailable.
 *
 * Requires @abandonware/bleno (optional dependency):
 *   npm install @abandonware/bleno --save-optional
 *
 * Windows 10 1703+ (WinRT BT API) and Linux (BlueZ kernel socket) are supported.
 * Falls back silently if bleno is not installed or hardware is absent.
 *
 * Protocol (phone → desktop):
 *   Write 1 — header packet [0x00][4-byte totalLength BE][2-byte chunkCount BE]
 *   Write N  — data packets  [0x01][2-byte chunkIndex BE][raw chunk bytes...]
 * Desktop reassembles chunks and POSTs the completed AIMAIL JSON to localhost sync server.
 */

import http from 'http';

const SYNC_PORT = parseInt(process.env.SYNC_PORT ?? '3030', 10);

export const BLE_SERVICE_UUID  = 'e7a00001-4c68-4c77-9d5e-c95d11ab9f31';
export const BLE_RX_CHAR_UUID  = 'e7a00002-4c68-4c77-9d5e-c95d11ab9f31';

interface ReassemblySession {
  totalLength: number;
  totalChunks: number;
  chunks: Map<number, Buffer>;
  receivedAt: number;
}

// Single-device assumption: only one phone connects at a time
let currentSession: ReassemblySession | null = null;
let blenoRef: any = null;

function relayToSyncServer(payload: Buffer): void {
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: SYNC_PORT,
      path: '/receive',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    },
    (res) => { res.resume(); }
  );
  req.on('error', (err) =>
    console.error('[BLE] Failed to relay payload to sync server:', err.message)
  );
  req.write(payload);
  req.end();
}

function handleWrite(data: Buffer, callback: (code: number) => void): void {
  const RESULT_SUCCESS = 0;

  if (data.length < 1) { callback(RESULT_SUCCESS); return; }

  const pktType = data[0];

  if (pktType === 0x00 && data.length >= 7) {
    const totalLength = data.readUInt32BE(1);
    const totalChunks = data.readUInt16BE(5);
    currentSession = { totalLength, totalChunks, chunks: new Map(), receivedAt: Date.now() };
    console.log(`[BLE] New session: ${totalChunks} chunk(s), expected ${totalLength} byte(s)`);

  } else if (pktType === 0x01 && data.length >= 3 && currentSession) {
    const idx = data.readUInt16BE(1);
    currentSession.chunks.set(idx, data.slice(3));

    if (currentSession.chunks.size === currentSession.totalChunks) {
      const parts: Buffer[] = [];
      for (let i = 0; i < currentSession.totalChunks; i++) {
        const part = currentSession.chunks.get(i);
        if (part) parts.push(part);
      }
      const payload = Buffer.concat(parts);
      console.log(`[BLE] Payload reassembled (${payload.length} bytes), relaying to sync server`);
      relayToSyncServer(payload);
      currentSession = null;
    }

  } else if (pktType === 0x01 && !currentSession) {
    console.warn('[BLE] Received data chunk without an active session — ignoring');
  }

  callback(RESULT_SUCCESS);
}

export async function startBleTransport(): Promise<void> {
  try {
    const mod = await import('@abandonware/bleno');
    const bleno: any = (mod as any).default ?? mod;
    blenoRef = bleno;

    bleno.on('stateChange', (state: string) => {
      console.log(`[BLE] Adapter state: ${state}`);
      if (state === 'poweredOn') {
        bleno.startAdvertising('AI-Pharmacy', [BLE_SERVICE_UUID]);
      } else {
        bleno.stopAdvertising();
      }
    });

    bleno.on('advertisingStart', (err: any) => {
      if (err) { console.error('[BLE] Advertising start error:', err); return; }

      const RxCharacteristic = new bleno.Characteristic({
        uuid: BLE_RX_CHAR_UUID,
        properties: ['write', 'writeWithoutResponse'],
        onWriteRequest(
          data: Buffer,
          _offset: number,
          _withoutResponse: boolean,
          callback: (code: number) => void
        ) {
          handleWrite(data, callback);
        },
      });

      bleno.setServices([
        new bleno.PrimaryService({
          uuid: BLE_SERVICE_UUID,
          characteristics: [RxCharacteristic],
        }),
      ]);

      console.log('[BLE] AI-Pharmacy GATT peripheral running');
    });

    // Stale session cleanup every 60 s
    setInterval(() => {
      if (currentSession && Date.now() - currentSession.receivedAt > 60_000) {
        console.warn('[BLE] Stale session discarded');
        currentSession = null;
      }
    }, 60_000);

  } catch (err: any) {
    console.warn('[BLE] BLE transport unavailable (install @abandonware/bleno to enable):', err.message);
  }
}

export function stopBleTransport(): void {
  try { blenoRef?.stopAdvertising?.(); } catch {}
  blenoRef = null;
  currentSession = null;
}
