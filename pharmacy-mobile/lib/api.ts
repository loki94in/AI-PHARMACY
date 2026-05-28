import * as SecureStore from 'expo-secure-store';

const SERVER_KEY = 'pharmacy_server_url';

let cachedBaseUrl: string | null = null;

// ─── Server URL Management ──────────────────────────────────────────────────

export async function getServerUrl(): Promise<string | null> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const url = await SecureStore.getItemAsync(SERVER_KEY);
  if (url) cachedBaseUrl = url;
  return url;
}

export async function setServerUrl(url: string): Promise<void> {
  // Normalize: remove trailing slash
  const clean = url.replace(/\/+$/, '');
  await SecureStore.setItemAsync(SERVER_KEY, clean);
  cachedBaseUrl = clean;
}

export async function clearServerUrl(): Promise<void> {
  await SecureStore.deleteItemAsync(SERVER_KEY);
  cachedBaseUrl = null;
}

// ─── Generic Fetch Wrapper ──────────────────────────────────────────────────

async function request<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const base = await getServerUrl();
  if (!base) throw new Error('Server URL not configured');

  const url = `${base}/api${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function getDashboard() {
  return request<{ todaySales: number; lowStock: number; pendingTasks: number }>('/dashboard');
}

// ─── Inventory ──────────────────────────────────────────────────────────────

export interface InventoryItem {
  id: number;
  medicine_id: number;
  medicine_name: string;
  quantity: number;
  rack_location?: string;
  batch_no?: string;
  expiry_date?: string;
}

export function getInventory() {
  return request<InventoryItem[]>('/inventory');
}

export function getInventoryPeek(medicineId: number) {
  return request('/inventory/peek/' + medicineId);
}

// ─── Sales / Billing ────────────────────────────────────────────────────────

export interface SearchMedicineResult {
  inventory_id: number;
  medicine_id: number;
  medicine_name: string;
  batch_no: string;
  expiry_date: string;
  quantity: number;
  mrp: number;
  unit_price: number;
  cost_price: number;
}

export function searchMedicine(q: string) {
  return request<SearchMedicineResult[]>('/sales/search-medicine?q=' + encodeURIComponent(q));
}

export interface SalePayload {
  items: { inventory_id: number; quantity: number; unit_price: number }[];
  patient_name?: string;
  patient_phone?: string;
  discount?: number;
  payment_medium?: string;
}

export function createSale(payload: SalePayload) {
  return request<{ success: boolean; invoice_no: string; total: number; tax: number }>('/sales', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Purchases ──────────────────────────────────────────────────────────────

export interface Purchase {
  id: number;
  invoice_no: string;
  date: string;
  total_amount: number;
  distributor_name: string;
}

export function getPurchases() {
  return request<Purchase[]>('/purchases');
}

// ─── Product Trace ──────────────────────────────────────────────────────────

export function getProductTrace(q: string) {
  return request<{ purchases: any[]; sales: any[] }>('/reports/product-trace?q=' + encodeURIComponent(q));
}

// ─── AI Camera ──────────────────────────────────────────────────────────────

export function getAuditQueue() {
  return request('/aicamera/audit/queue');
}

// ─── Backup ─────────────────────────────────────────────────────────────────

export function triggerBackup() {
  return request<{ success: boolean; message: string; backupFilename: string }>('/utilities/backup', {
    method: 'POST',
  });
}

// ─── Reports ────────────────────────────────────────────────────────────────

export function getReportsSummary() {
  return request<{ totalSales: number; totalPurchases: number }>('/reports');
}

// ─── Connection Test ────────────────────────────────────────────────────────

export async function testConnection(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/dashboard`, {
      headers: { 'Content-Type': 'application/json' },
    });
    return res.ok;
  } catch {
    return false;
  }
}
