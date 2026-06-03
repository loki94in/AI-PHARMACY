import axios from 'axios';

// Vite handles the proxy in dev mode to http://localhost:3000
const API_URL = '/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach the session token if available
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('session_token') || localStorage.getItem('api_key');
  if (token) {
    config.headers['x-session-token'] = token;
  }
  return config;
});

// Interceptor to handle errors centrally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Basic global error handling
    if (error.response?.status === 401) {
      console.warn('Unauthorized request. Token might be missing or invalid.');
    }
    return Promise.reject(error);
  }
);

// Define API interface types here as needed
export interface DashboardStats {
  todaySales: number;
  lowStock: number;
  pendingTasks: number;
}

export interface Medicine {
  id: number;
  name: string;
  api_reference?: string;
  strength?: string;
  packaging?: string;
  item_type?: string;
  manufacturer?: string;
  marketed_by?: string;
  manufactured_by?: string;
  mrp?: number;
  purchase_price?: number;
  gst?: string;
  hsn?: string;
  pack_size?: string;
  schedule_type?: string;
}

export interface InventoryItem extends Medicine {
  batch_number: string;
  expiry_date: string;
  stock_quantity: number;
  loose_quantity: number;
  rack_location?: string;
}

export interface SpecialOrder {
  id: number;
  product: string;
  requester: string;
  phone: string;
  qty: number;
  priority: string;
  status: string;
  date: string;
  notified: number;
}

// API methods mapping
export const api = {
  getDashboard: () => apiClient.get<DashboardStats>('/dashboard').then(res => res.data),
  
  // Inventory
  getInventory: () => apiClient.get<InventoryItem[]>('/inventory').then(res => res.data),
  addMedicine: (data: Partial<InventoryItem>) => apiClient.post('/inventory', data).then(res => res.data),
  updateMedicine: (id: number, data: Partial<InventoryItem>) => apiClient.put(`/inventory/${id}`, data).then(res => res.data),
  getEnrichedMedicine: (id: number) => apiClient.get(`/inventory/medicines/${id}/enriched`).then(res => res.data),
  
  // Sales / POS
  getSalesHistory: () => apiClient.get('/sales/history').then(res => res.data),
  createSale: (data: any) => apiClient.post('/sales', data).then(res => res.data),
  holdBill: (data: any) => apiClient.post('/sales/hold', data).then(res => res.data),
  getHeldBills: () => apiClient.get('/sales/hold').then(res => res.data),
  restoreHeldBill: (id: number) => apiClient.post(`/sales/hold/${id}/restore`).then(res => res.data),
  searchMedicine: (q: string) => apiClient.get('/sales/search-medicine', { params: { q } }).then(res => res.data),
  
  // Purchases
  getPurchases: () => apiClient.get('/purchases').then(res => res.data),
  createPurchase: (data: any) => apiClient.post('/purchases', data).then(res => res.data),
  createManualPurchase: (data: any) => apiClient.post('/purchases/manual', data).then(res => res.data),
  getDistributors: () => apiClient.get('/distributors').then(res => res.data),
  getLastPurchase: (name: string, distributorId?: number) => {
    const params: any = { name };
    if (distributorId) params.distributor_id = distributorId;
    return apiClient.get('/purchases/last-purchase', { params }).then(res => res.data);
  },
  batchLastPurchase: (medicines: Array<{name: string}>, distributorId?: number) =>
    apiClient.post('/purchases/batch-last-purchase', { medicines, distributor_id: distributorId }).then(res => res.data),
  catalogSearch: (q: string) => apiClient.get('/inventory/catalog-search', { params: { q } }).then(res => res.data),
  
  // CRM
  getPatients: () => apiClient.get('/crm/patients').then(r => r.data),
  
  // Migration Endpoints
  uploadMigrationFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/migration/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }).then(r => r.data);
  },
  analyzeMigrationFile: (fileName: string, skipLines: number = 0) => 
    apiClient.post('/migration/analyze', { fileName, skipLines }).then(r => r.data),
  runMigration: (fileName: string, mapping: any, skipLines: number = 0) => 
    apiClient.post('/migration/run', { fileName, mapping, skipLines }).then(r => r.data),
  getMigrationStatus: () => apiClient.get('/migration/status').then(r => r.data),
  getStagingInventory: () => apiClient.get('/migration/staging/inventory').then(r => r.data),
  getStagingSales: () => apiClient.get('/migration/staging/sales').then(r => r.data),
  getStagingPurchases: () => apiClient.get('/migration/staging/purchases').then(r => r.data),
  finalizeMigration: (regenerateInvoices: boolean = false) => 
    apiClient.post('/migration/staging/finalize', { regenerateInvoices }).then(r => r.data),
  
  addPatient: (data: any) => apiClient.post('/crm/patients', data).then(res => res.data),
  getDoctors: () => apiClient.get('/crm/doctors').then(res => res.data),
  addDoctor: (data: any) => apiClient.post('/crm/doctors', data).then(res => res.data),
  
  // Email / Mail Parser
  getEmailInbox: () => apiClient.get('/email/inbox').then(res => res.data),
  getEmailAttachments: () => apiClient.get('/email/attachments').then(res => res.data),
  parseAttachment: (filename: string) => apiClient.post('/email/attachments/parse', { filename }).then(res => res.data),
  importManualEmail: (data: any) => apiClient.post('/email/import-manual', data).then(res => res.data),
  
  // License
  getLicenseStatus: () => apiClient.get('/license/status').then(res => res.data),
  activateLicense: (key: string) => apiClient.post('/license/activate', { key }).then(res => res.data),
  
  // Returns
  getReturns: () => apiClient.get('/returns').then(res => res.data),
  createReturn: (data: any) => apiClient.post('/returns', data).then(res => res.data),
  getNearExpiry: (months: number = 6) => apiClient.get('/returns/near-expiry', { params: { months } }).then(res => res.data),
  lookupPurchases: (name: string, batch?: string) => {
    const params: any = { name };
    if (batch) params.batch = batch;
    return apiClient.get('/returns/lookup-purchases', { params }).then(res => res.data);
  },
  processReturns: (items: any[]) => apiClient.post('/returns/process-returns', { items }).then(res => res.data),
  exportReturnsPDF: (items: any[]) => apiClient.post('/returns/export-pdf-report', { items }, { responseType: 'blob' }).then(res => res.data),
  
  // Purchase PDF
  getPurchasePDF: (id: number) => apiClient.get(`/purchases/${id}/pdf`, { responseType: 'blob' }).then(res => res.data),

  // Orders & Special Requests
  getOrders: () => apiClient.get<SpecialOrder[]>('/orders').then(res => res.data),
  createOrder: (data: Partial<SpecialOrder>) => apiClient.post('/orders', data).then(res => res.data),
  updateOrder: (id: number, data: Partial<SpecialOrder>) => apiClient.put(`/orders/${id}`, data).then(res => res.data),
  deleteOrder: (id: number) => apiClient.delete(`/orders/${id}`).then(res => res.data),
  getUncollectedAlerts: () => apiClient.get<SpecialOrder[]>('/orders/uncollected-alerts').then(res => res.data),
};
