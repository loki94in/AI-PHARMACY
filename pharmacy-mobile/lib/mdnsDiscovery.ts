/**
 * mDNS / Bonjour service discovery for mobile.
 * Requires react-native-zeroconf (custom dev client only — not available in Expo Go).
 *
 * Discovers '_aipharmacy._tcp' services broadcast by the desktop sync worker
 * so the user doesn't have to type an IP address manually.
 */
import { NativeModules, NativeEventEmitter } from 'react-native';

export interface DiscoveredServer {
  name: string;
  host: string;
  port: number;
  addresses: string[];
}

type DiscoveryCallback = (servers: DiscoveredServer[]) => void;

let zeroconf: any = null;
let emitter: NativeEventEmitter | null = null;
const discovered = new Map<string, DiscoveredServer>();

function getZeroconf(): any {
  if (zeroconf) return zeroconf;
  try {
    // react-native-zeroconf provides a default export
    const mod = require('react-native-zeroconf');
    const Zeroconf = mod.default ?? mod.Zeroconf ?? mod;
    zeroconf = typeof Zeroconf === 'function' ? new Zeroconf() : Zeroconf;
    return zeroconf;
  } catch {
    return null;
  }
}

export function discoverPharmacyServers(
  onUpdate: DiscoveryCallback,
  timeoutMs = 8000
): () => void {
  const zc = getZeroconf();
  if (!zc) {
    console.warn('[mDNS] react-native-zeroconf not available — requires custom dev client');
    return () => {};
  }

  discovered.clear();

  const notify = () => onUpdate([...discovered.values()]);

  zc.on('resolved', (service: any) => {
    const host = service.addresses?.[0] ?? service.host;
    if (!host) return;
    discovered.set(service.name, {
      name: service.name,
      host,
      port: service.port,
      addresses: service.addresses ?? [host],
    });
    notify();
  });

  zc.on('removed', (service: any) => {
    discovered.delete(service.name);
    notify();
  });

  zc.on('error', (err: any) => {
    console.warn('[mDNS] Zeroconf error:', err);
  });

  zc.scan('_aipharmacy', 'tcp');

  const stopTimer = setTimeout(() => zc.stop(), timeoutMs);

  return () => {
    clearTimeout(stopTimer);
    try { zc.stop(); } catch {}
    zc.removeAllListeners?.('resolved');
    zc.removeAllListeners?.('removed');
    zc.removeAllListeners?.('error');
  };
}
