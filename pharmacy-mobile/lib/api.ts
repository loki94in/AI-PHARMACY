import * as SecureStore from './secureStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SERVER_KEY = 'pharmacy_server_url';
const INVENTORY_CACHE_KEY = 'cached_inventory_master';
const OFFLINE_QUEUE_KEY = 'offline_sales_queue';
const PURCHASES_QUEUE_KEY = 'offline_purchases_queue';

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

// ─── Local Cache & Queue Helpers ──────────────────────────────────────────

export async function cacheInventory(items: SearchMedicineResult[]): Promise<void> {
  try {
    await AsyncStorage.setItem(INVENTORY_CACHE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to cache inventory locally:', e);
  }
}

export async function getCachedInventory(): Promise<SearchMedicineResult[]> {
  try {
    const data = await AsyncStorage.getItem(INVENTORY_CACHE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to get cached inventory:', e);
    return [];
  }
}

export async function queueOfflineSale(payload: SalePayload): Promise<void> {
  try {
    const currentQueue = await getOfflineSalesQueue();
    currentQueue.push(payload);
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(currentQueue));
  } catch (e) {
    console.error('Failed to queue offline sale:', e);
  }
}

export async function getOfflineSalesQueue(): Promise<SalePayload[]> {
  try {
    const data = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to get offline sales queue:', e);
    return [];
  }
}

export async function clearOfflineSalesQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(OFFLINE_QUEUE_KEY);
  } catch (e) {
    console.error('Failed to clear offline sales queue:', e);
  }
}

export async function queueOfflinePurchase(payload: any): Promise<void> {
  try {
    const currentQueue = await getOfflinePurchasesQueue();
    currentQueue.push(payload);
    await AsyncStorage.setItem(PURCHASES_QUEUE_KEY, JSON.stringify(currentQueue));
  } catch (e) {
    console.error('Failed to queue offline purchase:', e);
  }
}

export async function getOfflinePurchasesQueue(): Promise<any[]> {
  try {
    const data = await AsyncStorage.getItem(PURCHASES_QUEUE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Failed to get offline purchases queue:', e);
    return [];
  }
}

export async function clearOfflinePurchasesQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PURCHASES_QUEUE_KEY);
  } catch (e) {
    console.error('Failed to clear offline purchases queue:', e);
  }
}

// ─── Google OAuth Token Sync & Gmail REST Direct Fetching ──────────────────

export interface GoogleAuthSettings {
  gmail_user: string;
  gmail_oauth_access_token: string;
  gmail_oauth_refresh_token: string;
  google_client_id: string;
  google_client_secret: string;
  gmail_oauth_token_expiry: string;
}

export async function syncGoogleAuthFromPc(): Promise<GoogleAuthSettings | null> {
  try {
    const settings = await request<Record<string, string>>('/settings');
    const auth = {
      gmail_user: settings['gmail_user'] || '',
      gmail_oauth_access_token: settings['gmail_oauth_access_token'] || '',
      gmail_oauth_refresh_token: settings['gmail_oauth_refresh_token'] || '',
      google_client_id: settings['google_client_id'] || '',
      google_client_secret: settings['google_client_secret'] || '',
      gmail_oauth_token_expiry: settings['gmail_oauth_token_expiry'] || '',
    };
    await SecureStore.setItemAsync('gmail_user', auth.gmail_user);
    await SecureStore.setItemAsync('gmail_oauth_access_token', auth.gmail_oauth_access_token);
    await SecureStore.setItemAsync('gmail_oauth_refresh_token', auth.gmail_oauth_refresh_token);
    await SecureStore.setItemAsync('google_client_id', auth.google_client_id);
    await SecureStore.setItemAsync('google_client_secret', auth.google_client_secret);
    await SecureStore.setItemAsync('gmail_oauth_token_expiry', auth.gmail_oauth_token_expiry);
    return auth;
  } catch (e) {
    console.warn('Failed to sync Google OAuth tokens from PC:', e);
    return {
      gmail_user: (await SecureStore.getItemAsync('gmail_user')) || '',
      gmail_oauth_access_token: (await SecureStore.getItemAsync('gmail_oauth_access_token')) || '',
      gmail_oauth_refresh_token: (await SecureStore.getItemAsync('gmail_oauth_refresh_token')) || '',
      google_client_id: (await SecureStore.getItemAsync('google_client_id')) || '',
      google_client_secret: (await SecureStore.getItemAsync('google_client_secret')) || '',
      gmail_oauth_token_expiry: (await SecureStore.getItemAsync('gmail_oauth_token_expiry')) || '',
    };
  }
}

export async function getValidGmailAccessToken(auth: GoogleAuthSettings): Promise<string | null> {
  const expiry = auth.gmail_oauth_token_expiry ? parseInt(auth.gmail_oauth_token_expiry, 10) : 0;
  if (Date.now() + 60000 >= expiry && auth.gmail_oauth_refresh_token && auth.google_client_id && auth.google_client_secret) {
    try {
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: auth.google_client_id,
          client_secret: auth.google_client_secret,
          refresh_token: auth.gmail_oauth_refresh_token,
          grant_type: 'refresh_token',
        }).toString(),
      });
      const data = await response.json() as any;
      if (data.access_token) {
        const newExpiry = Date.now() + (data.expires_in * 1000);
        await SecureStore.setItemAsync('gmail_oauth_access_token', data.access_token);
        await SecureStore.setItemAsync('gmail_oauth_token_expiry', newExpiry.toString());
        return data.access_token;
      }
    } catch (err) {
      console.warn('Failed to refresh Google token on mobile:', err);
    }
  }
  return auth.gmail_oauth_access_token;
}

export interface GmailMessagePreview {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export async function fetchGmailEmailsDirect(): Promise<GmailMessagePreview[]> {
  const auth = await syncGoogleAuthFromPc();
  if (!auth || !auth.gmail_oauth_access_token) {
    throw new Error('Google Gmail OAuth credentials not synced from PC settings');
  }

  const token = await getValidGmailAccessToken(auth);
  if (!token) throw new Error('Failed to acquire valid Google access token');

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=has:attachment`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!listRes.ok) {
    throw new Error(`Gmail API List failed: ${listRes.statusText}`);
  }

  const listData = await listRes.json() as any;
  const messages = listData.messages || [];
  
  const previews: GmailMessagePreview[] = [];

  for (const msg of messages) {
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      if (!detailRes.ok) continue;
      const detail = await detailRes.json() as any;
      
      const subjectHeader = detail.payload.headers.find((h: any) => h.name.toLowerCase() === 'subject');
      const fromHeader = detail.payload.headers.find((h: any) => h.name.toLowerCase() === 'from');
      const dateHeader = detail.payload.headers.find((h: any) => h.name.toLowerCase() === 'date');

      previews.push({
        id: detail.id,
        threadId: detail.threadId,
        subject: subjectHeader ? subjectHeader.value : '(No Subject)',
        from: fromHeader ? fromHeader.value : 'Unknown',
        date: dateHeader ? dateHeader.value : new Date().toISOString(),
        snippet: detail.snippet || ''
      });
    } catch (e) {
      console.warn(`Failed to fetch email detail for ${msg.id}:`, e);
    }
  }

  await AsyncStorage.setItem('cached_mobile_emails', JSON.stringify(previews));
  return previews;
}

export async function getCachedEmails(): Promise<GmailMessagePreview[]> {
  try {
    const data = await AsyncStorage.getItem('cached_mobile_emails');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function fetchGmailMessageDetail(messageId: string): Promise<any> {
  const auth = await syncGoogleAuthFromPc();
  if (!auth || !auth.gmail_oauth_access_token) {
    throw new Error('Google Gmail OAuth credentials not synced from PC settings');
  }

  const token = await getValidGmailAccessToken(auth);
  if (!token) throw new Error('Failed to acquire valid Google access token');

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!res.ok) {
    throw new Error(`Gmail API message fetch failed: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchGmailAttachment(messageId: string, attachmentId: string): Promise<string> {
  const auth = await syncGoogleAuthFromPc();
  if (!auth || !auth.gmail_oauth_access_token) {
    throw new Error('Google Gmail OAuth credentials not synced from PC settings');
  }

  const token = await getValidGmailAccessToken(auth);
  if (!token) throw new Error('Failed to acquire valid Google access token');

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  if (!res.ok) {
    throw new Error(`Gmail API attachment fetch failed: ${res.statusText}`);
  }
  const data = await res.json() as any;
  return data.data; // Base64 encoded attachment content
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

export async function getInventory(): Promise<InventoryItem[]> {
  try {
    const items = await request<InventoryItem[]>('/inventory');
    // Save to cache mapped to SearchMedicineResult format
    const mapped: SearchMedicineResult[] = items.map(item => ({
      inventory_id: item.id,
      medicine_id: item.medicine_id,
      medicine_name: item.medicine_name,
      batch_no: item.batch_no || '',
      expiry_date: item.expiry_date || '',
      quantity: item.quantity,
      mrp: 0,
      unit_price: 0,
      cost_price: 0
    }));
    await cacheInventory(mapped);
    return items;
  } catch (err) {
    console.log('Online getInventory failed, fallback to local cache:', err);
    const cached = await getCachedInventory();
    return cached.map(c => ({
      id: c.inventory_id,
      medicine_id: c.medicine_id,
      medicine_name: c.medicine_name,
      quantity: c.quantity,
      batch_no: c.batch_no,
      expiry_date: c.expiry_date
    }));
  }
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

export async function searchMedicine(q: string): Promise<SearchMedicineResult[]> {
  try {
    return await request<SearchMedicineResult[]>('/sales/search-medicine?q=' + encodeURIComponent(q));
  } catch (err) {
    console.log('Online search failed, fallback to local cache:', err);
    const cache = await getCachedInventory();
    const cleanQ = q.toLowerCase();
    return cache.filter(item => 
      item.medicine_name.toLowerCase().includes(cleanQ) || 
      (item.batch_no && item.batch_no.toLowerCase().includes(cleanQ))
    );
  }
}

export interface SalePayload {
  items: { inventory_id: number; quantity: number; unit_price: number }[];
  patient_name?: string;
  patient_phone?: string;
  discount?: number;
  payment_medium?: string;
  payment_status?: string;
  sale_date?: string;
}

export async function createSale(payload: SalePayload): Promise<{ success: boolean; invoice_no: string; total: number; tax: number }> {
  try {
    return await request<{ success: boolean; invoice_no: string; total: number; tax: number }>('/sales', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log('Online checkout failed, queueing offline:', err);
    const offlinePayload = {
      ...payload,
      sale_date: new Date().toISOString(),
    };
    await queueOfflineSale(offlinePayload);

    // Subtract stock quantity locally immediately to prevent double selling
    const cache = await getCachedInventory();
    for (const item of payload.items) {
      const cachedItem = cache.find(c => c.inventory_id === item.inventory_id);
      if (cachedItem) {
        cachedItem.quantity = Math.max(0, cachedItem.quantity - item.quantity);
      }
    }
    await cacheInventory(cache);

    // Compute local invoice totals
    const subtotal = payload.items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const tax = Number((subtotal * 0.05).toFixed(2));
    const total = Math.round(subtotal + tax - (payload.discount || 0));
    const tempInvoiceNo = `TEMP-MOB-${Date.now()}`;

    return {
      success: true,
      invoice_no: tempInvoiceNo,
      total,
      tax
    };
  }
}

// Synchronize all pending sales/purchases in the queue and update inventory
export async function syncOfflineSalesAndRefresh(): Promise<{ syncedCount: number; warnings: string[] }> {
  const salesQueue = await getOfflineSalesQueue();
  const purchasesQueue = await getOfflinePurchasesQueue();
  const warnings: string[] = [];
  let syncedCount = 0;

  // 1. Sync Sales
  if (salesQueue.length > 0) {
    try {
      const result = await request<{ success: boolean; count: number; warnings?: string[] }>('/sales/sync', {
        method: 'POST',
        body: JSON.stringify({ sales: salesQueue }),
      });
      if (result.success) {
        await clearOfflineSalesQueue();
        syncedCount += result.count;
        if (result.warnings) warnings.push(...result.warnings);
      }
    } catch (e: any) {
      console.error('Failed to sync offline sales:', e);
      warnings.push(`Sales Sync failed: ${e.message}`);
    }
  }

  // 2. Sync Purchases
  if (purchasesQueue.length > 0) {
    try {
      const result = await request<{ success: boolean; count: number; warnings?: string[] }>('/purchases/sync', {
        method: 'POST',
        body: JSON.stringify({ purchases: purchasesQueue }),
      });
      if (result.success) {
        await clearOfflinePurchasesQueue();
        syncedCount += result.count;
        if (result.warnings) warnings.push(...result.warnings);
      }
    } catch (e: any) {
      console.error('Failed to sync offline purchases:', e);
      warnings.push(`Purchases Sync failed: ${e.message}`);
    }
  }

  // Update inventories
  try {
    await getInventory();
  } catch {}

  // Sync Google Credentials
  try {
    await syncGoogleAuthFromPc();
  } catch {}

  return { syncedCount, warnings };
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

// ─── Push Notifications Token Registration ──────────────────────────────────

export async function registerPushToken(token: string, deviceName: string, os: string): Promise<any> {
  return request('/notifications/register-token', {
    method: 'POST',
    body: JSON.stringify({ token, deviceName, os }),
  });
}

// ─── Notification Storage & Management Helpers ──────────────────────────────

export interface SavedNotification {
  id: string;
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

export async function getSavedNotifications(): Promise<SavedNotification[]> {
  try {
    const data = await AsyncStorage.getItem('saved_notifications');
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export async function saveNotification(title: string, body: string): Promise<SavedNotification[]> {
  try {
    const list = await getSavedNotifications();
    const newNotif: SavedNotification = {
      id: Date.now().toString(),
      title,
      body,
      timestamp: new Date().toISOString(),
      read: false,
    };
    list.unshift(newNotif); // latest first
    const trimmed = list.slice(0, 50); // limit to 50 alerts
    await AsyncStorage.setItem('saved_notifications', JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return [];
  }
}

export async function markAllNotificationsAsRead(): Promise<void> {
  try {
    const list = await getSavedNotifications();
    const updated = list.map(item => ({ ...item, read: true }));
    await AsyncStorage.setItem('saved_notifications', JSON.stringify(updated));
  } catch {}
}

export async function clearAllNotifications(): Promise<void> {
  try {
    await AsyncStorage.removeItem('saved_notifications');
  } catch {}
}
