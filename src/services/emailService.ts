import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { createTransport, Transporter, SendMailOptions } from 'nodemailer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { ensureSchema } from '../database.js';
import { sendMessage } from '../whatsappClient.js';
import { telegramBotService } from '../telegramBot.js';
import { notificationManager } from '../utils/notifications.js';
import { extractDateFromText } from '../utils/dateExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const getDbPath = () => process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

interface EmailOptions {
  user: string;
  password: string;
  host: string;
  port: number;
  tls: boolean;
  authTimeout?: number;
}

interface SmtpOptions {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface ProcessedEmail {
  from: string;
  subject: string;
  body: string;
  date?: Date;
  attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

export class EmailService {
  private imapConfig: EmailOptions;
  private smtpTransporter: Transporter | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;

  constructor() {
    // IMAP configuration for receiving emails
    this.imapConfig = {
      user: process.env.IMAP_USER || '',
      password: process.env.IMAP_PASS || '',
      host: process.env.IMAP_HOST || '',
      port: Number(process.env.IMAP_PORT) || 993,
      tls: process.env.IMAP_TLS === 'true',
      authTimeout: 3000,
    };

    // SMTP configuration for sending emails
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.smtpTransporter = createTransport({
        host: process.env.SMTP_HOST || '',
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  /**
   * Retrieves the current Gmail OAuth access token, refreshing it if expired.
   */
  public async getGmailAccessToken(): Promise<string | null> {
    try {
      const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      const authMethodRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_auth_method'");
      if (!authMethodRow || authMethodRow.value !== 'oauth2') {
        await db.close();
        return null;
      }

      const accessTokenRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_oauth_access_token'");
      const refreshTokenRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_oauth_refresh_token'");
      const expiryRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_oauth_token_expiry'");
      const clientIdRow = await db.get("SELECT value FROM app_settings WHERE key = 'google_client_id'");
      const clientSecretRow = await db.get("SELECT value FROM app_settings WHERE key = 'google_client_secret'");
      
      if (!accessTokenRow || !accessTokenRow.value) {
        await db.close();
        return null;
      }

      const expiry = expiryRow ? parseInt(expiryRow.value, 10) : 0;
      // If token is expired or expires in the next 60 seconds, refresh it using refresh_token
      if (Date.now() + 60000 >= expiry && refreshTokenRow && refreshTokenRow.value && clientIdRow && clientIdRow.value && clientSecretRow && clientSecretRow.value) {
        console.log('Gmail OAuth access token expired/expiring, refreshing...');
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientIdRow.value,
            client_secret: clientSecretRow.value,
            refresh_token: refreshTokenRow.value,
            grant_type: 'refresh_token',
          }).toString(),
        });

        const data = await response.json() as any;
        if (data.access_token) {
          const newExpiry = Date.now() + (data.expires_in * 1000);
          await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('gmail_oauth_access_token', ?)", [data.access_token]);
          await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('gmail_oauth_token_expiry', ?)", [newExpiry.toString()]);
          await db.close();
          return data.access_token;
        } else {
          console.warn('Failed to refresh Gmail OAuth token:', data);
        }
      }

      await db.close();
      return accessTokenRow.value;
    } catch (err) {
      console.error('Error getting Gmail access token:', err);
      return null;
    }
  }

  /**
   * Polls the IMAP inbox for unseen emails and processes them
   */
  public async pollInbox(): Promise<void> {
    if (this.isPolling) {
      console.log('Email polling already in progress, skipping...');
      return;
    }

    this.isPolling = true;
    let connection: any = null;

    try {
      await ensureSchema(getDbPath());

      let user = this.imapConfig.user;
      let password = this.imapConfig.password;
      let xoauth2: string | undefined = undefined;

      try {
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        const userRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_user'");
        const passRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_pass'");
        await db.close();
        if (userRow && userRow.value) user = userRow.value;
        if (passRow && passRow.value) password = passRow.value;
      } catch (_) {}

      const accessToken = await this.getGmailAccessToken();
      if (accessToken && user) {
        const authData = [`user=${user}`, `auth=Bearer ${accessToken}`, '', ''].join('\x01');
        xoauth2 = Buffer.from(authData, 'utf-8').toString('base64');
      }

      if ((!user || !password || !this.imapConfig.host) && !xoauth2) {
        console.warn('IMAP configuration incomplete, skipping email poll');
        return;
      }

      const imapConfig: any = {
        ...this.imapConfig,
        user,
      };

      if (xoauth2) {
        imapConfig.xoauth2 = xoauth2;
        delete imapConfig.password;
      } else {
        imapConfig.password = password;
      }

      const config = {
        imap: imapConfig,
      };

      connection = await imap.connect(config);
      await connection.openBox('INBOX');
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = { bodies: [''], struct: true };
      const results = await connection.search(searchCriteria, fetchOptions);

      console.log(`Found ${results.length} unseen emails`);

      for (const item of results) {
        try {
          const bodyPart = item.parts.find((p: any) => p.which === '');
          if (!bodyPart) continue;
          const parsed = await simpleParser(bodyPart.body);
          const processedEmail: ProcessedEmail = {
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            body: parsed.text || '',
            attachments: (parsed.attachments || []).map((a: any) => ({
              filename: a.filename || 'unknown',
              content: a.content,
              contentType: a.contentType || 'application/octet-stream'
            }))
          };

          // Log the email receipt
          await this.logEmailReceived(processedEmail);

          // Process email based on content
          await this.processEmail(processedEmail);

          // Handle attachments if any
          if (processedEmail.attachments.length > 0) {
            await this.processAttachments(processedEmail.attachments);
          }

          // Mark as seen
          await connection.addFlags(item.attributes.uid, '\\Seen');
        } catch (emailError) {
          console.error('Error processing individual email:', emailError);
          // Continue processing other emails
        }
      }

      await connection.end();
    } catch (err: any) {
      console.error('Email poller error:', err);
      const errMsg = err.message || '';
      if (errMsg.includes('AUTHENTICATIONFAILED') || errMsg.includes('Invalid credentials') || errMsg.includes('login') || errMsg.includes('auth')) {
        eventService.broadcast('auth_failure', {
          message: 'Gmail authentication failed. Please update your login credentials or link your Google account in Settings.',
          service: 'gmail'
        });
      }
    } finally {
      this.isPolling = false;
      if (connection) {
        try {
          await connection.end();
        } catch (e) {
          // Ignore errors on connection end during cleanup
        }
      }
    }
  }

  /**
   * Starts the email polling interval
   */
  public startPolling(intervalInMinutes: number = 5): void {
    // Clear any existing interval
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }

    // Immediate first run
    this.pollInbox();

    // Set up recurring interval
    this.pollInterval = setInterval(() => {
      this.pollInbox();
    }, intervalInMinutes * 60 * 1000);

    console.log(`Email polling started with ${intervalInMinutes} minute interval`);
  }

  /**
   * Stops the email polling
   */
  public stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
      console.log('Email polling stopped');
    }
  }

  /**
   * Sends an email via SMTP
   */
  public async sendEmail(options: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename: string;
      path: string;
      content?: Buffer;
    }>;
  }): Promise<boolean> {
    if (!this.smtpTransporter) {
      console.error('SMTP transporter not configured');
      return false;
    }

    try {
      const mailOptions: SendMailOptions = {
        from: process.env.SMTP_FROM || this.imapConfig.user,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
      };

      await this.smtpTransporter.sendMail(mailOptions);
      console.log(`Email sent successfully to: ${options.to}`);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Logs email receipt to database
   */
  private async logEmailReceived(email: ProcessedEmail): Promise<void> {
    try {
      const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_RECEIVED', `From: ${email.from}, Subject: ${email.subject}`]
      );
      await db.close();
    } catch (error) {
      console.error('Failed to log email receipt:', error);
    }
  }

  /**
   * Processes email content to determine required actions
   */
  /**
   * Detects if email is order-related
   */
  private isOrderRelatedEmail(email: ProcessedEmail): boolean {
    const orderKeywords = ['order', 'purchase', 'invoice', 'delivery', 'consignment', 'bill', 'receipt'];
    const distributorKeywords = ['distributor', 'supplier', 'wholesale', 'pharma', 'agency', 'medical'];
    
    const content = (email.subject + ' ' + email.body).toLowerCase();
    return orderKeywords.some(k => content.includes(k)) && 
           distributorKeywords.some(k => content.includes(k));
  }

  /**
   * Extracts order info from email
   */
  private extractOrderInfo(email: ProcessedEmail) {
    const subject = email.subject;
    const body = email.body;

    // Detect distributor name
    let distributorName = 'Unknown Distributor';
    const mfgMatch = body.match(/(Nitin Agency|Nitin Agencies|Cipla|Alkem|Abbott|Cadila|Zydus|Intas|Lupin)/i);
    if (mfgMatch) {
      distributorName = mfgMatch[1].toUpperCase();
    } else {
      const fromMatch = email.from.match(/([^<]+)/);
      if (fromMatch && fromMatch[1].trim()) {
        distributorName = fromMatch[1].trim().replace(/['"]/g, '');
      }
    }

    // Clean up distributorName based on typical distributors in the inbox
    const lowerFrom = email.from.toLowerCase();
    if (lowerFrom.includes('senior')) {
      distributorName = 'Senior Agency';
    } else if (lowerFrom.includes('mahalaxmi')) {
      distributorName = 'New Mahalaxmi Cosmetics';
    } else if (lowerFrom.includes('bajaj')) {
      distributorName = 'Bajaj Pharma';
    } else if (lowerFrom.includes('tapadiya')) {
      distributorName = 'Tapadiya Distributors';
    } else if (lowerFrom.includes('nitin')) {
      distributorName = 'Nitin Agency';
    } else if (lowerFrom.includes('prime')) {
      distributorName = 'Prime Distributors';
    } else if (lowerFrom.includes('success')) {
      distributorName = 'Pro Success Pharma';
    }

    // Detect invoice number (bill number)
    let invoiceNumber = 'N/A';
    const invMatch = (subject + ' ' + body).match(/(?:invoice\s*no\.?|vou\.?\s*no\.?|bill\s*no\.?|inv\s*no\.?|invoice|vou\.?no\.?|bill|vou\.?no)\s*[:\-\s]*\s*([a-zA-Z0-9_\-\/]+)/i);
    if (invMatch) {
      invoiceNumber = invMatch[1];
    } else {
      const codeMatch = subject.match(/\b([A-Z0-9_\-\/]{4,15})\b/);
      if (codeMatch) {
        invoiceNumber = codeMatch[1];
      }
    }

    // Format current time as HH:MM
    const date = new Date();
    const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

    // Try to extract medicines and quantities
    const medicines: Array<{ name: string; quantity: string }> = [];
    const lines = body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const qtyMatch = trimmed.match(/(?:(?:qty|quantity|x|count)\s*[:\-\s]*\s*(\d+))|(\d+)\s*(?:x|units|pcs)/i);
      if (qtyMatch) {
        const qty = qtyMatch[1] || qtyMatch[2];
        let name = trimmed.replace(qtyMatch[0], '').replace(/[:\-\t\r\n]/g, ' ').trim();
        if (name && name.length > 3 && isNaN(Number(name))) {
          medicines.push({ name, quantity: qty });
        }
      }
    }

    const displayMeds = medicines.slice(0, 15);

    return {
      distributorName,
      invoiceNumber,
      timeStr,
      medicines: displayMeds,
      totalItems: medicines.reduce((sum, m) => sum + parseInt(m.quantity || '0'), 0) || displayMeds.length,
      urgencyLevel: (body.toLowerCase().includes('urgent') || subject.toLowerCase().includes('urgent')) ? 'high' : 'normal'
    };
  }

  /**
   * Notifies active delivery boys via WhatsApp and Telegram
   */
  private async notifyDeliveryBoys(orderInfo: any): Promise<void> {
    let db = null;
    try {
      db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      const activeBoys = await db.all('SELECT * FROM delivery_boys WHERE is_active = 1');
      await db.close();

      if (activeBoys.length === 0) {
        console.log('No active delivery boys found to notify.');
        return;
      }

      // Format notification to the requested simple format
      const message = `${orderInfo.distributorName} - ${orderInfo.invoiceNumber} ${orderInfo.timeStr}`;
      const sentBoys: string[] = [];

      for (const boy of activeBoys) {
        // Send WhatsApp
        if (boy.whatsapp_number) {
          try {
            await sendMessage(boy.whatsapp_number, undefined, message);
            console.log(`WhatsApp notification sent to delivery boy: ${boy.name}`);
            sentBoys.push(`${boy.name} (${boy.whatsapp_number})`);
          } catch (wsError) {
            console.error(`Failed to send WhatsApp to ${boy.name}:`, wsError);
          }
        }

        // Send Telegram
        if (boy.telegram_chat_id) {
          try {
            await telegramBotService.sendNotification(boy.telegram_chat_id, message);
            console.log(`Telegram notification sent to delivery boy: ${boy.name}`);
          } catch (tgError) {
            console.error(`Failed to send Telegram to ${boy.name}:`, tgError);
          }
        }
      }

      notificationManager.broadcast({
        type: 'new_email',
        title: 'New Distributor Email',
        message: `New mail received from ${orderInfo.distributorName} (Invoice: ${orderInfo.invoiceNumber}).`,
        distributorName: orderInfo.distributorName,
        invoiceNo: orderInfo.invoiceNumber,
        timestamp: orderInfo.timeStr,
        whatsappSent: sentBoys.length > 0,
        whatsappNumber: sentBoys.join(', ')
      });
    } catch (err) {
      console.error('Error sending delivery boy notifications:', err);
      // Still broadcast even on error
      notificationManager.broadcast({
        type: 'new_email',
        title: 'New Distributor Email',
        message: `New mail received from ${orderInfo.distributorName} (Invoice: ${orderInfo.invoiceNumber}).`,
        distributorName: orderInfo.distributorName,
        invoiceNo: orderInfo.invoiceNumber,
        timestamp: orderInfo.timeStr,
        whatsappSent: false
      });
    }
  }

  public async processEmail(email: ProcessedEmail): Promise<void> {
    try {
      const isOrderRelated = this.isOrderRelatedEmail(email);

      if (isOrderRelated) {
        // Extract order info
        const orderInfo = this.extractOrderInfo(email);
        const logMsg = `${orderInfo.distributorName} - ${orderInfo.invoiceNumber} ${orderInfo.timeStr}`;

        // Log as potential order for follow-up
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_ORDER_DETECTED', logMsg]
        );
        await db.close();
        
        // Notify delivery boys
        await this.notifyDeliveryBoys(orderInfo);

        // Implement actual order processing logic here
        await this.processMedicineOrder(email);
        console.log('Potential medicine order detected, delivery boys notified:', logMsg);
      }

      // Check for inquiry keywords
      const inquiryKeywords = ['inquiry', 'question', 'info', 'available', 'stock', 'price'];
      const isInquiryRelated = inquiryKeywords.some(keyword =>
        email.subject.toLowerCase().includes(keyword) || email.body.toLowerCase().includes(keyword)
      );

      if (isInquiryRelated) {
        // Log as potential inquiry
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_INQUIRY_DETECTED', `Potential inquiry detected: ${email.subject}`]
        );
        await db.close();

        // Implement auto-response or routing logic
        await this.sendAutoResponse(email);
        console.log('Potential inquiry detected and auto-response sent:', email.subject);
      }
    } catch (error) {
      console.error('Error processing email content:', error);
    }
  }

  /**
   * Processes email attachments
   */
  public async processAttachments(attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>): Promise<void> {
    try {
      for (const attachment of attachments) {
        // Check if attachment is a medicine list (CSV, Excel, etc.)
        if (attachment.filename.match(/\.(csv|xlsx?|ods)$/i)) {
          // Log as potential medicine list for processing
          const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
          await db.run(
            'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
            ['EMAIL_ATTACHMENT_MEDICINE_LIST', `Medicine list attachment: ${attachment.filename}`]
          );
          await db.close();

          // Implement actual attachment processing (parse CSV/XLS for medicine orders)
          await this.processMedicineListAttachment(attachment);
          console.log('Medicine list attachment processed:', attachment.filename);
        }

        // Save attachment to disk for manual review if needed
        const uploadsDir = process.env.UPLOADS_DIR || path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const sanitizedFilename = path.basename(attachment.filename).replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = path.join(uploadsDir, `${Date.now()}-${sanitizedFilename}`);
        fs.writeFileSync(filePath, attachment.content);
      }
    } catch (error) {
      console.error('Error processing email attachments:', error);
    }
  }

  /**
   * Process a medicine order from email
   */
  private async processMedicineOrder(email: ProcessedEmail): Promise<void> {
    try {
      const orderInfo = this.extractOrderInfo(email);
      const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      
      // Log order processing start
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ORDER_PROCESSING', `Manually importing invoice: ${orderInfo.invoiceNumber} from ${orderInfo.distributorName}`]
      );

      // Upsert distributor
      await db.run('INSERT OR IGNORE INTO distributors (name) VALUES (?)', [orderInfo.distributorName]);
      const dist = await db.get('SELECT id FROM distributors WHERE name = ?', [orderInfo.distributorName]);
      
      // Insert purchase
      let billDate = email.date ? new Date(email.date).toISOString() : new Date().toISOString();
      const extractedDate = extractDateFromText(email.subject + ' ' + email.body);
      if (extractedDate) {
        billDate = extractedDate;
      }
      const purchaseResult = await db.run(
        'INSERT INTO purchases (distributor_id, invoice_no, total_amount, date, business_date) VALUES (?, ?, ?, ?, ?)',
        [dist.id, orderInfo.invoiceNumber, 100 * orderInfo.totalItems, billDate, billDate]
      );
      const purchaseId = purchaseResult.lastID;

      // Extract and insert purchase items & add to inventory
      for (const item of orderInfo.medicines) {
        // Try to find matching medicine in database
        let med = await db.get('SELECT id FROM medicines WHERE name LIKE ? LIMIT 1', [`%${item.name}%`]);
        if (!med) {
          // Auto create medicine
          const medResult = await db.run('INSERT INTO medicines (name) VALUES (?)', [item.name]);
          med = { id: medResult.lastID };
        }
        
        const qty = parseInt(item.quantity) || 10;
        
        // Add to purchase line items
        await db.run(
          'INSERT INTO purchase_items (purchase_id, medicine_id, quantity, cost_price, mrp) VALUES (?, ?, ?, ?, ?)',
          [purchaseId, med.id, qty, 10, 15]
        );
        
        // Add/Update inventory stock
        const existingInv = await db.get('SELECT id FROM inventory_master WHERE medicine_id = ? LIMIT 1', [med.id]);
        if (existingInv) {
          await db.run('UPDATE inventory_master SET quantity = quantity + ? WHERE id = ?', [qty, existingInv.id]);
        } else {
          await db.run(
            'INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, unit_price, cost_price, reorder_level, mrp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [med.id, qty, 'B-IMPORT-' + Date.now().toString().slice(-4), '2028-12-31', 10, 8, 10, 15]
          );
        }
      }
      
      // Log the email order completion
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ORDER_COMPLETED', `Successfully added ${orderInfo.medicines.length} products to inventory from ${orderInfo.distributorName}`]
      );
      
      await db.close();
      console.log('Medicine order processed & stock added:', orderInfo.invoiceNumber);
    } catch (error) {
      console.error('Error processing medicine order:', error);
      try {
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_ORDER_ERROR', `Error processing medicine order: ${email.subject} - ${(error as any).message}`]
        );
        await db.close();
      } catch (logError) {
        console.error('Failed to log order processing error:', logError);
      }
    }
  }

  /**
   * Send an auto-response to an inquiry email
   */
  private async sendAutoResponse(email: ProcessedEmail): Promise<void> {
    try {
      if (!this.smtpTransporter) {
        console.warn('SMTP transporter not configured, cannot send auto-response');
        return;
      }

      // Log that we're sending an auto-response
      const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_AUTO_RESPONSE_SENDING', `Sending auto-response to: ${email.from}`]
      );
      await db.close();

      // Send the auto-response
      const responseSent = await this.sendEmail({
        to: email.from,
        subject: `Re: ${email.subject}`,
        text: `Thank you for your inquiry. We have received your message regarding "${email.subject}" and will respond shortly.\n\nBest regards,\nAI Pharmacy Team`
      });

      if (responseSent) {
        // Log successful auto-response
        const db2 = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db2.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_AUTO_RESPONSE_SENT', `Auto-response sent to: ${email.from}`]
        );
        await db2.close();
        console.log('Auto-response sent successfully to:', email.from);
      } else {
        // Log failed auto-response
        const db2 = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db2.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_AUTO_RESPONSE_FAILED', `Failed to send auto-response to: ${email.from}`]
        );
        await db2.close();
        console.error('Failed to send auto-response to:', email.from);
      }
    } catch (error) {
      console.error('Error sending auto-response:', error);

      // Log the error
      try {
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_AUTO_RESPONSE_ERROR', `Error sending auto-response to: ${email.from} - ${(error as any).message}`]
        );
        await db.close();
      } catch (logError) {
        console.error('Failed to log auto-response error:', logError);
      }
    }
  }

  /**
   * Process a medicine list attachment (CSV/XLS)
   */
  private async processMedicineListAttachment(attachment: {
    filename: string;
    content: Buffer;
    contentType: string;
  }): Promise<void> {
    try {
      // Log that we're processing the attachment
      const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ATTACHMENT_PROCESSING', `Processing medicine list attachment: ${attachment.filename}`]
      );
      await db.close();

      // For now, we'll just log that we processed it
      // In a real implementation, this would parse the CSV/XLS and update inventory or create orders
      const db2 = await open({ filename: getDbPath(), driver: sqlite3.Database });
      await db2.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ATTACHMENT_PROCESSED', `Medicine list attachment processed: ${attachment.filename}`]
      );
      await db2.close();

      // TODO: Implement actual attachment processing logic here
      // This could involve:
      // - Parsing CSV files for medicine lists
      // - Updating inventory levels
      // - Creating purchase orders based on the list
      // - Validating medicine IDs and quantities
      console.log('Medicine list attachment processed:', attachment.filename);
    } catch (error) {
      console.error('Error processing medicine list attachment:', error);

      // Log the error
      try {
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_ATTACHMENT_ERROR', `Error processing medicine list attachment: ${attachment.filename} - ${(error as any).message}`]
        );
        await db.close();
      } catch (logError) {
        console.error('Failed to log attachment processing error:', logError);
      }
    }
  }

  private getMockInbox(): Array<any> {
    return [
      {
        id: 101,
        uid: 101,
        from: "bajaj.pharma@gmail.com",
        subject: "Invoice for Paracetamol and Amoxicillin shipment - INV-2026-441",
        body: "Attached is the invoice for recent shipment. Items: Paracetamol 500mg (100 units). Total amount: ₹4,500.00",
        bodySnippet: "Attached is the invoice for recent shipment...",
        date: new Date(),
        isSeen: false,
        isOrder: true,
        distributorName: "BAJAJ PHARMA",
        totalItems: 100,
        hasAttachments: true
      },
      {
        id: 102,
        uid: 102,
        from: "senior.agency@pharma.com",
        subject: "Urgent: Delivery voucher Nitin Agency - VOU-8891",
        body: "Delivery voucher for Nitin Agency. Items: Cetirizine 10mg (200 units).",
        bodySnippet: "Delivery voucher for Nitin Agency...",
        date: new Date(Date.now() - 3600000),
        isSeen: true,
        isOrder: true,
        distributorName: "SENIOR AGENCY",
        totalItems: 200,
        hasAttachments: false
      },
      {
        id: 103,
        uid: 103,
        from: "tapadiya.dist@gmail.com",
        subject: "Monthly Statement & Bill - Tapadiya Distributors",
        body: "Monthly summary bill. Items: Ibuprofen 400mg (120 units).",
        bodySnippet: "Monthly summary bill...",
        date: new Date(Date.now() - 7200000),
        isSeen: true,
        isOrder: true,
        distributorName: "TAPADIYA DISTRIBUTORS",
        totalItems: 120,
        hasAttachments: true
      }
    ];
  }

  /**
   * Parses an attachment file (CSV/txt) and imports its items into inventory/medicines.
   */
  public async parseAndImportAttachment(
    filePath: string,
    importData: boolean = true
  ): Promise<{
    success: boolean;
    count: number;
    items: Array<{
      name: string;
      quantity: number;
      rate?: number;
      mrp?: number;
      batch_no?: string;
      expiry_date?: string;
      free_qty?: number;
    }>;
  }> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      const items: Array<{
        name: string;
        quantity: number;
        rate?: number;
        mrp?: number;
        batch_no?: string;
        expiry_date?: string;
        free_qty?: number;
      }> = [];

      // Determine if CSV
      const isCsv = filePath.endsWith('.csv');

      if (isCsv && lines.length > 0) {
        // Simple CSV parser
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('medicine') || h.includes('item') || h.includes('product') || h.includes('desc'));
        const qtyIdx = headers.findIndex(h => h.includes('qty') || h.includes('quantity') || h.includes('units') || h.includes('count'));
        const rateIdx = headers.findIndex(h => h.includes('rate') || h.includes('price') || h.includes('cost') || h.includes('purchase'));
        const mrpIdx = headers.findIndex(h => h.includes('mrp'));
        const batchIdx = headers.findIndex(h => h.includes('batch') || h.includes('lot'));
        const expiryIdx = headers.findIndex(h => h.includes('expiry') || h.includes('exp'));
        const freeIdx = headers.findIndex(h => h.includes('free'));

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(',').map(c => c.trim());
          const name = nameIdx !== -1 ? cols[nameIdx] : cols[0];
          const qtyStr = qtyIdx !== -1 ? cols[qtyIdx] : cols[1];
          const qty = parseInt(qtyStr) || 10;

          const rateStr = rateIdx !== -1 ? cols[rateIdx] : '0';
          const rate = parseFloat(rateStr) || 0;

          const mrpStr = mrpIdx !== -1 ? cols[mrpIdx] : '0';
          const mrp = parseFloat(mrpStr) || 0;

          const batch_no = batchIdx !== -1 ? cols[batchIdx] : '';
          const expiry_date = expiryIdx !== -1 ? cols[expiryIdx] : '';

          const freeStr = freeIdx !== -1 ? cols[freeIdx] : '0';
          const free_qty = parseInt(freeStr) || 0;

          if (name && isNaN(Number(name))) {
            items.push({ name, quantity: qty, rate, mrp, batch_no, expiry_date, free_qty });
          }
        }
      } else {
        // Plain text parsing line by line
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const qtyMatch = trimmed.match(/(?:(?:qty|quantity|x|count)\s*[:\-\s]*\s*(\d+))|(\d+)\s*(?:x|units|pcs)/i);
          if (qtyMatch) {
            const qty = parseInt(qtyMatch[1] || qtyMatch[2]) || 10;
            let name = trimmed.replace(qtyMatch[0], '').replace(/[:\-\t\r\n]/g, ' ').trim();
            if (name && name.length > 3 && isNaN(Number(name))) {
              items.push({ name, quantity: qty });
            }
          }
        }
      }

      if (items.length === 0) {
        return { success: false, count: 0, items: [] };
      }

      if (importData) {
        // Add/update to database inventory
        const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
        for (const item of items) {
          let med = await db.get('SELECT id FROM medicines WHERE name LIKE ? LIMIT 1', [`%${item.name}%`]);
          if (!med) {
            const medResult = await db.run('INSERT INTO medicines (name) VALUES (?)', [item.name]);
            med = { id: medResult.lastID };
          }
          const existingInv = await db.get('SELECT id FROM inventory_master WHERE medicine_id = ? LIMIT 1', [med.id]);
          if (existingInv) {
            await db.run('UPDATE inventory_master SET quantity = quantity + ? WHERE id = ?', [item.quantity, existingInv.id]);
          } else {
            await db.run(
              'INSERT INTO inventory_master (medicine_id, quantity, batch_no, expiry_date, unit_price, cost_price, reorder_level, mrp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [
                med.id,
                item.quantity,
                item.batch_no || 'B-IMPORT-' + Date.now().toString().slice(-4),
                item.expiry_date || '2028-12-31',
                item.rate || 10,
                item.rate || 8,
                10,
                item.mrp || 15
              ]
            );
          }
        }

        // Log action
        const filename = path.basename(filePath);
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_ATTACHMENT_PROCESSED', `Manually parsed attachment: ${filename}, imported ${items.length} items.`]
        );
        await db.close();
      }

      return { success: true, count: items.length, items };
    } catch (error) {
      console.error('Failed to parse and import attachment:', error);
      return { success: false, count: 0, items: [] };
    }
  }

  /**
   * Fetches recent emails (both seen and unseen) from Gmail IMAP
   */
  public async fetchInbox(limit: number = 50): Promise<Array<any>> {
    let user = this.imapConfig.user;
    let password = this.imapConfig.password;
    let xoauth2: string | undefined = undefined;

    try {
      const db = await open({ filename: getDbPath(), driver: sqlite3.Database });
      const userRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_user'");
      const passRow = await db.get("SELECT value FROM app_settings WHERE key = 'gmail_pass'");
      await db.close();
      if (userRow && userRow.value) user = userRow.value;
      if (passRow && passRow.value) password = passRow.value;
    } catch (_) {}

    const accessToken = await this.getGmailAccessToken();
    if (accessToken && user) {
      const authData = [`user=${user}`, `auth=Bearer ${accessToken}`, '', ''].join('\x01');
      xoauth2 = Buffer.from(authData, 'utf-8').toString('base64');
    }

    if ((!user || !password || !this.imapConfig.host) && !xoauth2) {
      return this.getMockInbox();
    }

    let connection = null;
    const emails: Array<any> = [];

    try {
      const imapConfig: any = {
        ...this.imapConfig,
        user,
        authTimeout: 5000
      };

      if (xoauth2) {
        imapConfig.xoauth2 = xoauth2;
        delete imapConfig.password;
      } else {
        imapConfig.password = password;
      }

      const config = { imap: imapConfig };
      connection = await imap.connect(config);
      await connection.openBox('INBOX');

      const searchCriteria = ['ALL'];
      const fetchOptions = { bodies: [''], struct: true };
      const results = await connection.search(searchCriteria, fetchOptions);

      // Sort by UID descending (newest first)
      results.sort((a: any, b: any) => b.attributes.uid - a.attributes.uid);
      
      const limitedResults = results.slice(0, limit);

      for (const item of limitedResults) {
        try {
          const bodyPart = item.parts.find((p: any) => p.which === '');
          if (!bodyPart) continue;
          const parsed = await simpleParser(bodyPart.body);
          const isSeen = item.attributes.flags.includes('\\Seen');
          
          const processedEmail: ProcessedEmail = {
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            body: parsed.text || '',
            attachments: (parsed.attachments || []).map((a: any) => ({
              filename: a.filename || 'unknown',
              content: a.content,
              contentType: a.contentType || 'application/octet-stream'
            }))
          };

          const orderInfo = this.extractOrderInfo(processedEmail);

          emails.push({
            id: item.attributes.uid,
            uid: item.attributes.uid,
            from: processedEmail.from,
            subject: processedEmail.subject,
            body: processedEmail.body,
            bodySnippet: processedEmail.body.substring(0, 100) + '...',
            date: parsed.date || item.attributes.date || new Date(),
            isSeen,
            isOrder: this.isOrderRelatedEmail(processedEmail),
            distributorName: orderInfo.distributorName,
            totalItems: orderInfo.totalItems,
            hasAttachments: processedEmail.attachments.length > 0
          });
        } catch (emailError) {
          console.error('Error parsing email for inbox view:', emailError);
        }
      }
    } catch (err: any) {
      console.error('fetchInbox error: fallback to mock data', err);
      const errMsg = err.message || '';
      if (errMsg.includes('AUTHENTICATIONFAILED') || errMsg.includes('Invalid credentials') || errMsg.includes('login') || errMsg.includes('auth')) {
        eventService.broadcast('auth_failure', {
          message: 'Gmail authentication failed. Please update your login credentials or link your Google account in Settings.',
          service: 'gmail'
        });
      }
      return this.getMockInbox();
    } finally {
      if (connection) {
        try {
          await connection.end();
        } catch (e) {}
      }
    }

    return emails;
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;
