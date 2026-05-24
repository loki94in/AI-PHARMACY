# UI Buttons Status Report

| Button Text | ID | Is Wired Up? | Action | Status |
|---|---|---|---|---|
| + | (No ID) | Yes | `openModal('patient-modal')` | 🟢 Functional |
| + | (No ID) | Yes | `openModal('doctor-modal')` | 🟢 Functional |
| 👁️ Margin | (No ID) | Yes | `toggleMargin(this)` | 🟢 Functional |
| ✖ | (No ID) | No | `None` | 🔴 Placeholder |
| ✖ | (No ID) | Yes | `this.closest('tr').remove()` | 🟢 Functional |
| ❌ | (No ID) | Yes | `this.closest('tr').remove()` | 🟢 Functional |
| ❌ | (No ID) | Yes | `this.closest('tr').remove()` | 🟢 Functional |
| Save [F10] | btn-save | Yes | `processSale(false)` | 🟢 Functional |
| Save & Print [F11] | btn-save-print | Yes | `processSale(true)` | 🟢 Functional |
| Send Refill Reminder | btn-reminder | Yes | `sendRefillReminder()` | 🟢 Functional |
| 🔄 Backup Now | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Save | (No ID) | Yes | `saveEdit()` | 🟢 Functional |
| Cancel | (No ID) | Yes | `closeModal()` | 🟢 Functional |
| 📤 Upload PDF / CSV | (No ID) | Yes | `document.getElementById('file-upload-input').click()` | 🟢 Functional |
| + Add Item | (No ID) | Yes | `openAddItemModal()` | 🟢 Functional |
| Discard All | (No ID) | No | `None` | 🔴 Placeholder |
| Commit Selected to Stock | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Setup Item | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |
| Save | (No ID) | Yes | `savePurchaseEdit()` | 🟢 Functional |
| Cancel | (No ID) | Yes | `closePurchaseModal()` | 🟢 Functional |
| + | (No ID) | Yes | `openModal('add-distributor-modal')` | 🟢 Functional |
| ⬆ Upload [F2] | btn-submit-purchase | Yes | `submitPurchase()` | 🟢 Functional |
| + Add Purchase | (No ID) | Yes | `openAddPurchaseModal()` | 🟢 Functional |
| + | (No ID) | No | `None` | 🔴 Placeholder |
| + | (No ID) | Yes | `openModal('add-medicine-modal')` | 🟢 Functional |
| ✖ | (No ID) | No | `None` | 🔴 Placeholder |
| ✖ | (No ID) | No | `None` | 🔴 Placeholder |
| Generate Barcode[F10] | (No ID) | No | `None` | 🔴 Placeholder |
| 👤 Customer Returns | (No ID) | Yes | `handleCustomerReturn()` | 🟢 Functional |
| 🏪 Distributor Returns | (No ID) | Yes | `handleDistributorReturn()` | 🟢 Functional |
| 📄 Generate Credit Note | (No ID) | No | `None` | 🔴 Placeholder |
| 📄 Generate Debit Note | (No ID) | No | `None` | 🔴 Placeholder |
| ✅ Process Return | (No ID) | Yes | `processReturn()` | 🟢 Functional |
| 📝 Log Request | (No ID) | No | `None` | 🔴 Placeholder |
| 💬 Send WhatsApp Summary | (No ID) | No | `None` | 🔴 Placeholder |
| 📄 Export Report | export-btn | Yes | `window.open('/api/reports/export-pdf?type=expiry', '_blank')` | 🟢 Functional |
| 📊 Generate Report | (No ID) | No | `None` | 🔴 Placeholder |
| 📄 Export PDF | (No ID) | Yes | `window.open('/api/reports/export-pdf?type=sales', '_blank')` | 🟢 Functional |
| res.json())
            .then(data => alert(data.message))
            .catch(err => alert('Cloud push error'));
          ">☁️ Push to Cloud Storage | (No ID) | No | `None` | 🔴 Placeholder |
| Send Email | sendEmailBtn | Yes | `Event Listener` | 🟢 Functional |
| res.json()).then(data => alert(data.message)).catch(err => alert('Telegram Error'));
        ">☁️ Upload to Telegram | (No ID) | No | `None` | 🔴 Placeholder |
| Run Migration | run-migration-btn | Yes | `Event Listener` | 🟢 Functional |
| 📄 Export PDF | (No ID) | Yes | `window.open('/api/reports/export-pdf?type=purchases', '_blank')` | 🟢 Functional |
| 🖨️ Print Labels | (No ID) | No | `None` | 🔴 Placeholder |
| Generate Barcodes PDF | generateBarcodeBtn | Yes | `Event Listener` | 🟢 Functional |
| 💾 Backup Now | backupNowBtn | Yes | `Event Listener` | 🟢 Functional |
| ☁️ Upload to Telegram | uploadTelegramBtn | No | `None` | 🔴 Placeholder |
| 🔄 Restore from Backup… | (No ID) | No | `None` | 🔴 Placeholder |
| 🔄 Rotate Encryption Key | rotateKeyBtn | No | `None` | 🔴 Placeholder |
| 🔗 Test Connection | (No ID) | No | `None` | 🔴 Placeholder |
| 💾 Save | (No ID) | No | `None` | 🔴 Placeholder |
| 🔗 Test Connection | (No ID) | No | `None` | 🔴 Placeholder |
| 💾 Save | (No ID) | No | `None` | 🔴 Placeholder |
| 🔗 Test Connection | (No ID) | No | `None` | 🔴 Placeholder |
| 💾 Save | (No ID) | No | `None` | 🔴 Placeholder |
| Resend | (No ID) | No | `None` | 🔴 Placeholder |
| Resend | (No ID) | No | `None` | 🔴 Placeholder |
| Send | (No ID) | No | `None` | 🔴 Placeholder |
| 📄 Export Logs | (No ID) | Yes | `window.open('/api/reports/export-pdf?type=logs', '_blank')` | 🟢 Functional |
| 💬 Dispatch Wizard | (No ID) | Yes | `openDispatchWizard()` | 🟢 Functional |
| 📊 Preview Records to Archive | (No ID) | Yes | `previewArchive()` | 🟢 Functional |
| 🗄️ Run Archive | (No ID) | Yes | `runArchive()` | 🟢 Functional |
| ➕ Add Entry | (No ID) | No | `None` | 🔴 Placeholder |
| 📄 Export Register PDF | (No ID) | Yes | `window.open('/api/reports/export-pdf?type=compliance', '_blank')` | 🟢 Functional |
| 🔄 Refresh Model | (No ID) | No | `None` | 🔴 Placeholder |
| 💬 Send Test Message | sendTestMsgBtn | No | `None` | 🔴 Placeholder |
| 📤 Send | (No ID) | No | `None` | 🔴 Placeholder |
| ❌ | (No ID) | Yes | `this.closest('tr').remove()` | 🟢 Functional |
| ✖ | (No ID) | Yes | `closeModal('patient-modal')` | 🟢 Functional |
| Add Patient [CTRL+S] | (No ID) | Yes | `savePatient()` | 🟢 Functional |
| TB Details | (No ID) | No | `None` | 🔴 Placeholder |
| Cancel [ESC] | (No ID) | Yes | `closeModal('patient-modal')` | 🟢 Functional |
| ✖ | (No ID) | Yes | `closeModal('doctor-modal')` | 🟢 Functional |
| Add Doctor [CTRL+S] | (No ID) | Yes | `saveDoctor()` | 🟢 Functional |
| Cancel [ESC] | (No ID) | Yes | `closeModal('doctor-modal')` | 🟢 Functional |
| ✖ | (No ID) | Yes | `closeModal('add-medicine-modal')` | 🟢 Functional |
| Add Medicine | (No ID) | Yes | `closeModal('add-medicine-modal')` | 🟢 Functional |
| ❌ | (No ID) | Yes | `this.closest('tr').remove()` | 🟢 Functional |
| ✖ | (No ID) | Yes | `closeModal('patient-modal')` | 🟢 Functional |
| Add Patient [CTRL+S] | (No ID) | Yes | `savePatient()` | 🟢 Functional |
| TB Details | (No ID) | No | `None` | 🔴 Placeholder |
| Cancel [ESC] | (No ID) | Yes | `closeModal('patient-modal')` | 🟢 Functional |
| ✖ | (No ID) | Yes | `closeModal('doctor-modal')` | 🟢 Functional |
| Add Doctor [CTRL+S] | (No ID) | Yes | `saveDoctor()` | 🟢 Functional |
| Cancel [ESC] | (No ID) | Yes | `closeModal('doctor-modal')` | 🟢 Functional |
| ✖ | (No ID) | Yes | `closeModal('add-medicine-modal')` | 🟢 Functional |
| Add Medicine | (No ID) | Yes | `closeModal('add-medicine-modal')` | 🟢 Functional |
| Edit | (No ID) | No | `None` | 🔴 Placeholder |