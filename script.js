// script.js – minimal data‑fetching & flag handling for the UI demo

// Mock Backend Data Store
const mockDb = {
  page2: {
    sales: "₹48,230", salesDelta: "▲ 12.4% vs yesterday",
    profit: "₹9,640", profitDelta: "▲ 8.1% vs yesterday",
    lowStock: 17, lowStockDelta: "▲ 3 new alerts",
    tasks: 5, tasksDelta: "2 urgent"
  },
  page3: {
    inventory: [
      { name: "Paracetamol 500mg", comp: "Paracetamol 500mg", qty: 320, rack: "A-12", batch: "B-2024-11", exp: "Jun 2026", expClass: "expiry-green", reorder: 50, status: "OK", statusClass: "badge-green" },
      { name: "Metformin 500mg", comp: "Metformin HCl", qty: 12, rack: "B-03", batch: "B-2024-08", exp: "Aug 2025", expClass: "expiry-orange", reorder: 100, status: "Low Stock", statusClass: "badge-danger", isLow: true },
      { name: "Amoxicillin 250mg", comp: "Amoxicillin Trihydrate", qty: 88, rack: "C-07", batch: "B-2025-02", exp: "Feb 2027", expClass: "expiry-green", reorder: 40, status: "OK", statusClass: "badge-green" },
      { name: "Losartan 50mg", comp: "Losartan Potassium", qty: 6, rack: "A-05", batch: "B-2023-12", exp: "Dec 2024 ⚠", expClass: "expiry-red", reorder: 80, status: "Near Expiry", statusClass: "badge-danger", isLow: true }
    ]
  }
};

function apiGet(endpoint) {
  return new Promise(resolve => {
    setTimeout(() => {
      const pageId = endpoint.split('/').pop();
      resolve(mockDb[pageId] || null);
    }, 150); // Simulate network latency
  });
}

async function uploadFile(input) {
  if (!input.files || input.files.length === 0) return;
  const file = input.files[0];
  const formData = new FormData();
  formData.append('file', file);
  
  const btn = input.nextElementSibling;
  const originalBtnText = btn.innerHTML;
  btn.innerHTML = '⏳ Uploading...';
  btn.style.pointerEvents = 'none';

  try {
    const res = await fetch('http://localhost:3000/api/upload', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    if (result.success) {
      btn.innerHTML = '✅ Queued!';
      setTimeout(() => {
        btn.innerHTML = originalBtnText;
        btn.style.pointerEvents = 'auto';
        loadPageData('page3'); // Refresh data
      }, 2000);
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Upload failed', err);
    btn.innerHTML = '❌ Failed';
    setTimeout(() => {
      btn.innerHTML = originalBtnText;
      btn.style.pointerEvents = 'auto';
    }, 2000);
  }
}

async function submitPurchase() {
  const distInput = document.getElementById('distributor-input');
  const invInput = document.getElementById('invoice-input');
  const btn = document.getElementById('btn-submit-purchase');
  
  if (!distInput.value || !invInput.value) {
    alert('Please enter Distributor and Invoice No.');
    return;
  }

  const payload = {
    distributor: distInput.value.trim(),
    invoice_no: invInput.value.trim(),
    total_amount: 153.33 // Mock total from table
  };

  const originalBtnText = btn.innerHTML;
  btn.innerHTML = '⏳ Saving...';
  btn.style.pointerEvents = 'none';

  try {
    const res = await fetch('http://localhost:3000/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      btn.innerHTML = '✅ Saved!';
      distInput.value = '';
      invInput.value = '';
    } else {
      throw new Error(result.error);
    }
  } catch (err) {
    console.error('Save failed', err);
    btn.innerHTML = '❌ Failed';
  }

  setTimeout(() => {
    btn.innerHTML = originalBtnText;
    btn.style.pointerEvents = 'auto';
  }, 2000);
}

function loadPageData(pageId) {
  if (pageId === 'page3') {
    fetch('http://localhost:3000/api/medicines')
      .then(res => res.json())
      .then(data => {
        const tbody = document.getElementById('pending-imports-body');
        if (!tbody) return;
        tbody.innerHTML = ''; // Clear hardcoded data
        
        document.getElementById('pending-imports-count').textContent = data.length + ' items extracted';

        data.forEach(med => {
          const tr = document.createElement('tr');
          tr.style.borderBottom = '1px solid var(--border)';
          tr.innerHTML = `
            <td style="padding: 8px 12px;"><input type="checkbox" checked style="accent-color: var(--sky);" /></td>
            <td style="padding: 8px 12px; font-weight: 600; color: var(--white); font-size: 13px;">${med.name || 'Unknown'}</td>
            <td style="padding: 8px 12px;"><span style="background: rgba(16, 185, 129, 0.15); color: var(--green); padding: 4px 8px; border-radius: 4px; font-size: 11px; border: 1px solid rgba(16, 185, 129, 0.3);">Extracted</span></td>
            <td style="padding: 8px 12px; color: var(--white); font-size: 12px;" class="mono">${med.batch || 'N/A'}</td>
            <td style="padding: 8px 12px; color: var(--white); font-size: 12px;" class="mono">${med.expiry || 'N/A'}</td>
            <td style="padding: 8px 12px; text-align: right; color: var(--white); font-size: 13px;">${med.quantity || 0}</td>
            <td style="padding: 8px 12px; text-align: right; color: var(--white); font-size: 13px;">0</td>
            <td style="padding: 8px 12px; text-align: right; color: var(--white); font-size: 13px;">₹${med.mrp || '0.00'}</td>
            <td style="padding: 8px 12px; text-align: center;"><button class="btn btn-ghost" style="font-size: 11px; color: var(--sky); padding: 4px 8px;">Edit</button></td>
          `;
          tbody.appendChild(tr);
        });
      })
      .catch(err => console.error('Failed to load medicines from API:', err));
  }

  // Fallback to mock logic for other pages
  const endpoint = `/api/${pageId}`;
  apiGet(endpoint).then(data => {
    if (data) {
      console.log('Loaded mock data for', pageId, data);
      
      // Bind text and values
      document.querySelectorAll(`[data-key="${pageId}"]`).forEach(el => {
        if (!el.dataset.field) return;
        const val = data[el.dataset.field];
        if (val !== undefined) {
          if (el.tagName === 'INPUT' || el.tagName === 'SELECT') el.value = val;
          else el.textContent = val;
        }
      });

      // Bind lists (arrays)
      document.querySelectorAll(`[data-list-key="${pageId}"]`).forEach(listEl => {
        const listField = listEl.dataset.list;
        const items = data[listField] || [];
        const template = listEl.querySelector('template');
        if (template) {
          const tbody = listEl.querySelector('tbody') || listEl;
          // Clear old items except the template
          Array.from(tbody.children).forEach(c => { if (c.tagName !== 'TEMPLATE') c.remove(); });
          
          items.forEach(item => {
            const clone = template.content.cloneNode(true);
            const tr = clone.querySelector('tr');
            if (tr && item.isLow) tr.style.background = 'rgba(248,113,113,0.04)';

            clone.querySelectorAll('[data-field]').forEach(el => {
               const val = item[el.dataset.field];
               if (val !== undefined) {
                 el.textContent = val;
                 if (el.dataset.classBind) el.className = item[el.dataset.classBind] || '';
               }
            });
            tbody.appendChild(clone);
          });
        }
      });
    }
  });
}

// Hook into page navigation – after show() runs, call loadPageData for that page
function show(n) {
  // existing logic (copied from HTML) – toggle visibility
  for (let i = 1; i <= 19; i++) {
    const pg = document.getElementById('page' + i);
    const nav = document.getElementById('nav' + i);
    if (pg) pg.classList.toggle('active', i === n);
    if (nav) nav.classList.toggle('active', i === n);
  }
  document.querySelector('main').scrollTop = 0;
  // load data for the newly visible page
  loadPageData('page' + n);
}

// Preserve the original `updateFlags` function – we just call it on init and on toggle change.
function initDemo() {
  // ensure flag handling is active
  if (typeof updateFlags === 'function') updateFlags();
  // load data for the default page (page1)
  loadPageData('page1');
}

// Form Submission Simulator
document.addEventListener('click', e => {
  const btn = e.target.closest('.btn');
  if (!btn) return;
  
  const text = btn.textContent.toLowerCase();
  if (text.includes('save') || text.includes('log') || text.includes('process') || text.includes('send')) {
    const pageId = document.querySelector('.page.active')?.id || 'unknown';
    
    // Simulate a POST/PUT
    const oldHtml = btn.innerHTML;
    btn.innerHTML = '⏳ Processing...';
    btn.style.pointerEvents = 'none';
    
    setTimeout(() => {
      btn.innerHTML = '✅ Success!';
      console.log(`Mock POST/PUT to /api/${pageId} submitted successfully.`);
      
      setTimeout(() => {
        btn.innerHTML = oldHtml;
        btn.style.pointerEvents = 'auto';
      }, 2000);
    }, 600);
  }
});

// Run after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDemo);
} else {
  initDemo();
}
