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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

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
      await ensureSchema(DB_PATH);

      if (!this.imapConfig.user || !this.imapConfig.password || !this.imapConfig.host) {
        console.warn('IMAP configuration incomplete, skipping email poll');
        return;
      }

      const config = {
        imap: this.imapConfig,
      };

      connection = await imap.connect(config);
      await connection.openBox('INBOX');
      const searchCriteria = ['UNSEEN'];
      const fetchOptions = { bodies: [''], struct: true };
      const results = await connection.search(searchCriteria, fetchOptions);

      console.log(`Found ${results.length} unseen emails`);

      for (const item of results) {
        try {
          const all = item.parts.find((p: any) => p.which === '' ).body;
          const parsed = await simpleParser(all);
          const processedEmail: ProcessedEmail = {
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            body: parsed.text || '',
            attachments: parsed.attachments || []
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
    } catch (err) {
      console.error('Email poller error:', err);
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
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
      db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      const activeBoys = await db.all('SELECT * FROM delivery_boys WHERE is_active = 1');
      await db.close();

      if (activeBoys.length === 0) {
        console.log('No active delivery boys found to notify.');
        return;
      }

      // Format notification to the requested simple format
      const message = `${orderInfo.distributorName} - ${orderInfo.invoiceNumber} (invoice number) ${orderInfo.timeStr}`;

      for (const boy of activeBoys) {
        // Send WhatsApp
        if (boy.whatsapp_number) {
          try {
            // Remove non-digit characters to format number correctly
            const cleanPhone = boy.whatsapp_number.replace(/\D/g, '');
            // Append country code if not present, e.g. +91 for India if length is 10 digits
            const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
            await sendMessage(formattedPhone, undefined, message);
            console.log(`WhatsApp notification sent to delivery boy: ${boy.name}`);
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
    } catch (err) {
      console.error('Error sending delivery boy notifications:', err);
    }
  }

  public async processEmail(email: ProcessedEmail): Promise<void> {
    try {
      const isOrderRelated = this.isOrderRelatedEmail(email);

      if (isOrderRelated) {
        // Extract order info
        const orderInfo = this.extractOrderInfo(email);
        const logMsg = `${orderInfo.distributorName} - ${orderInfo.invoiceNumber} (invoice number) ${orderInfo.timeStr}`;

        // Log as potential order for follow-up
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
          const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
        const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        const filePath = path.join(uploadsDir, attachment.filename);
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
      // Log that we're processing an order
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ORDER_PROCESSING', `Processing medicine order: ${email.subject}`]
      );
      await db.close();

      // For now, we'll create a basic order entry in action_logs
      // In a real implementation, this would create purchase orders, update inventory, etc.
      const db2 = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db2.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ORDER_COMPLETED', `Medicine order processed: ${email.subject} from ${email.from}`]
      );
      await db2.close();

      // TODO: Implement actual order processing logic here
      // This could involve:
      // - Creating purchase orders in the system
      // - Notifying inventory managers
      // - Updating stock levels
      // - Sending confirmation emails
      console.log('Medicine order processed:', email.subject);
    } catch (error) {
      console.error('Error processing medicine order:', error);

      // Log the error
      try {
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
        const db2 = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db2.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_AUTO_RESPONSE_SENT', `Auto-response sent to: ${email.from}`]
        );
        await db2.close();
        console.log('Auto-response sent successfully to:', email.from);
      } else {
        // Log failed auto-response
        const db2 = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
      const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
      await db.run(
        'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
        ['EMAIL_ATTACHMENT_PROCESSING', `Processing medicine list attachment: ${attachment.filename}`]
      );
      await db.close();

      // For now, we'll just log that we processed it
      // In a real implementation, this would parse the CSV/XLS and update inventory or create orders
      const db2 = await open({ filename: DB_PATH, driver: sqlite3.Database });
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
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
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

  /**
   * Fetches recent emails (both seen and unseen) from Gmail IMAP
   */
  public async fetchInbox(limit: number = 20): Promise<Array<any>> {
    if (!this.imapConfig.user || !this.imapConfig.password || !this.imapConfig.host) {
      throw new Error('IMAP configuration incomplete');
    }

    let connection = null;
    const emails: Array<any> = [];

    try {
      const config = { imap: this.imapConfig, authTimeout: 5000 };
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
          const all = item.parts.find((p: any) => p.which === '').body;
          const parsed = await simpleParser(all);
          const isSeen = item.attributes.flags.includes('\\Seen');
          
          const processedEmail: ProcessedEmail = {
            from: parsed.from?.text || '',
            subject: parsed.subject || '',
            body: parsed.text || '',
            attachments: parsed.attachments || []
          };

          const orderInfo = this.extractOrderInfo(processedEmail);

          emails.push({
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
    } catch (err) {
      console.error('fetchInbox error:', err);
      throw err;
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
