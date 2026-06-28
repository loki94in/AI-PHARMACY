/**
 * BLE central sync — mobile scans for the AI-Pharmacy GATT peripheral running on
 * the desktop and pushes an AIMAIL payload over Bluetooth when Wi-Fi is unavailable.
 *
 * Requires react-native-ble-plx (custom dev client only — not available in Expo Go).
 *
 * Protocol (phone → desktop, mirrors src/transport/bleTransport.ts):
 *   Write 1 — header [0x00][4-byte totalLength BE][2-byte chunkCount BE]
 *   Write N  — chunk  [0x01][2-byte chunkIndex BE][chunk bytes...]
 *
 * Values are base64-encoded as required by the react-native-ble-plx API.
 */

import { Platform, PermissionsAndroid } from 'react-native';

export const BLE_SERVICE_UUID = 'e7a00001-4c68-4c77-9d5e-c95d11ab9f31';
export const BLE_RX_CHAR_UUID = 'e7a00002-4c68-4c77-9d5e-c95d11ab9f31';

const CHUNK_SIZE = 182; // bytes — conservative for standard 20-byte MTU + 3 protocol bytes = 185

// ─── Utility ─────────────────────────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function encodeUint32BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);
}

function encodeUint16BE(n: number): Uint8Array {
  return new Uint8Array([(n >>> 8) & 0xff, n & 0xff]);
}

function concatUint8Arrays(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) { out.set(a, offset); offset += a.length; }
  return out;
}

function textToUtf8(str: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  // Minimal fallback for environments without TextEncoder
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
    else bytes.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
  }
  return new Uint8Array(bytes);
}

// ─── Permissions ─────────────────────────────────────────────────────────────

export async function requestBlePermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true; // iOS: handled via Info.plist in app.json

  if ((Platform.Version as number) >= 31) {
    const results = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ]);
    return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

// ─── BLE Manager (lazy init) ─────────────────────────────────────────────────

let manager: any = null;

function getBleManager(): any {
  if (manager) return manager;
  try {
    const mod = require('react-native-ble-plx');
    const BleManager = mod.BleManager ?? mod.default?.BleManager ?? mod.default;
    manager = new BleManager();
    return manager;
  } catch {
    return null;
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function syncViaBle(
  aimailJson: string,
  onProgress: (msg: string) => void,
  scanTimeoutMs = 12000
): Promise<boolean> {
  const mgr = getBleManager();
  if (!mgr) {
    onProgress('BLE unavailable — requires custom dev client (not Expo Go)');
    return false;
  }

  const hasPerms = await requestBlePermissions();
  if (!hasPerms) { onProgress('BLE permission denied'); return false; }

  return new Promise((resolve) => {
    onProgress('Scanning for AI-Pharmacy via Bluetooth…');

    const scanStop = setTimeout(() => {
      mgr.stopDeviceScan();
      onProgress('No AI-Pharmacy device found nearby via BLE');
      resolve(false);
    }, scanTimeoutMs);

    mgr.startDeviceScan(
      [BLE_SERVICE_UUID],
      { allowDuplicates: false },
      async (error: any, device: any) => {
        if (error) {
          clearTimeout(scanStop);
          onProgress(`BLE scan error: ${error.message}`);
          resolve(false);
          return;
        }
        if (!device) return;

        mgr.stopDeviceScan();
        clearTimeout(scanStop);

        try {
          onProgress(`Found ${device.name ?? 'device'}, connecting…`);
          const connected = await device.connect({ autoConnect: false });
          await connected.discoverAllServicesAndCharacteristics();

          const payload = textToUtf8(aimailJson);
          const totalChunks = Math.ceil(payload.length / CHUNK_SIZE);

          // Send header packet
          const header = concatUint8Arrays(
            new Uint8Array([0x00]),
            encodeUint32BE(payload.length),
            encodeUint16BE(totalChunks)
          );
          await connected.writeCharacteristicWithResponseForService(
            BLE_SERVICE_UUID,
            BLE_RX_CHAR_UUID,
            bytesToBase64(header)
          );

          // Send data chunks
          for (let i = 0; i < totalChunks; i++) {
            const chunk = payload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const packet = concatUint8Arrays(
              new Uint8Array([0x01]),
              encodeUint16BE(i),
              chunk
            );
            await connected.writeCharacteristicWithResponseForService(
              BLE_SERVICE_UUID,
              BLE_RX_CHAR_UUID,
              bytesToBase64(packet)
            );
            onProgress(`BLE: ${Math.round(((i + 1) / totalChunks) * 100)}% sent`);
          }

          await connected.cancelConnection();
          onProgress('BLE sync complete');
          resolve(true);
        } catch (err: any) {
          onProgress(`BLE sync failed: ${err.message}`);
          resolve(false);
        }
      }
    );
  });
}

export function destroyBleManager(): void {
  try { manager?.destroy?.(); } catch {}
  manager = null;
}
