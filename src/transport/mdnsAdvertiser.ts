/**
 * mDNS service advertiser — announces the sync HTTP server so mobile devices can
 * discover it without manual IP entry.  Uses bonjour-hap (pure-JS, no native bindings).
 * Falls back silently if the package is missing or multicast is blocked.
 */

const SYNC_PORT = parseInt(process.env.SYNC_PORT ?? '3030', 10);

let bonjourHandle: any = null;
let serviceHandle: any = null;

export async function startMdnsAdvertiser(): Promise<void> {
  try {
    const mod = await import('bonjour-hap');
    const BonjourCtor: any = mod.Bonjour ?? (mod as any).default ?? mod;
    bonjourHandle = typeof BonjourCtor === 'function' ? BonjourCtor() : new BonjourCtor();
    serviceHandle = bonjourHandle.publish({
      name: 'AI-Pharmacy',
      type: '_aipharmacy',
      protocol: 'tcp',
      port: SYNC_PORT,
    });
    console.log(`[mDNS] Advertising AI-Pharmacy sync service (_aipharmacy._tcp) on port ${SYNC_PORT}`);
  } catch (err: any) {
    console.warn('[mDNS] mDNS advertiser unavailable (install bonjour-hap to enable):', err.message);
  }
}

export function stopMdnsAdvertiser(): void {
  try { serviceHandle?.stop?.(); } catch {}
  try { bonjourHandle?.destroy?.(); } catch {}
  serviceHandle = null;
  bonjourHandle = null;
}
