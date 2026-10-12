export interface MailConfig {
  enabled: boolean; host: string; port: number; secure: boolean; requireTls: boolean; ignoreTls: boolean;
  rejectUnauthorized: boolean; user: string; pass: string; from: string; rateLimitMs: number;
}
export interface MailMessage { to: string; subject: string; html?: string; text?: string }
export interface QueuedMail extends MailMessage { id: string; attempts: number; createdAt: string }
export interface MailStats { sentCount: number; failedCount: number; lastSentAt: string | null; lastError: string | null }
