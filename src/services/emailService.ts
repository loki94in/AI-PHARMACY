import imap from 'imap-simple';
import { simpleParser } from 'mailparser';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { createTransport, Transporter, SendMailOptions } from 'nodemailer';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureSchema } from '../database.js';

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
          const all = item.parts.find((p) => p.which === '' ).body;
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
  private async processEmail(email: ProcessedEmail): Promise<void> {
    try {
      // Example: Check if email contains medicine order keywords
      const lowerSubject = email.subject.toLowerCase();
      const lowerBody = email.body.toLowerCase();

      // Check for order-related keywords
      const orderKeywords = ['order', 'purchase', 'buy', 'medicine', 'drug', 'prescription'];
      const isOrderRelated = orderKeywords.some(keyword =>
        lowerSubject.includes(keyword) || lowerBody.includes(keyword)
      );

      if (isOrderRelated) {
        // Log as potential order for follow-up
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_ORDER_DETECTED', `Potential order detected: ${email.subject}`]
        );
        await db.close();

        // TODO: Implement actual order processing logic here
        // This could involve creating purchase orders, notifying inventory managers, etc.
        console.log('Potential medicine order detected in email:', email.subject);
      }

      // Check for inquiry keywords
      const inquiryKeywords = ['inquiry', 'question', 'info', 'available', 'stock', 'price'];
      const isInquiryRelated = inquiryKeywords.some(keyword =>
        lowerSubject.includes(keyword) || lowerBody.includes(keyword)
      );

      if (isInquiryRelated) {
        // Log as potential inquiry
        const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
        await db.run(
          'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
          ['EMAIL_INQUIRY_DETECTED', `Potential inquiry detected: ${email.subject}`]
        );
        await db.close();

        // TODO: Implement auto-response or routing logic
        console.log('Potential inquiry detected in email:', email.subject);
      }
    } catch (error) {
      console.error('Error processing email content:', error);
    }
  }

  /**
   * Processes email attachments
   */
  private async processAttachments(attachments: Array<{
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

          // TODO: Implement actual attachment processing (parse CSV/XLS for medicine orders)
          console.log('Medicine list attachment detected:', attachment.filename);
        }

        // Save attachment to disk for manual review if needed
        // const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
        // if (!fs.existsSync(uploadsDir)) {
        //   fs.mkdirSync(uploadsDir, { recursive: true });
        // }
        // const filePath = path.join(uploadsDir, attachment.filename);
        // fs.writeFileSync(filePath, attachment.content);
      }
    } catch (error) {
      console.error('Error processing email attachments:', error);
    }
  }
}

// Export singleton instance
export const emailService = new EmailService();
export default emailService;