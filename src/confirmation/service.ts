import crypto from 'node:crypto';
import { AppError } from '../errors.js';

type Payload = { principal: string; operation: string; summary: Record<string, unknown>; exp: number; nonce: string };
export class ConfirmationService {
  private readonly used = new Map<string, number>();
  constructor(private readonly secret: string) {}
  prepare(principal: string, operation: string, summary: Record<string, unknown>, ttlMs = 300_000): string {
    const payload: Payload = { principal, operation, summary, exp: Date.now() + ttlMs, nonce: crypto.randomUUID() };
    const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', this.secret).update(raw).digest('base64url');
    return `${raw}.${sig}`;
  }
  consume(token: string, principal: string, operation: string, expected: Record<string, unknown>): void {
    const [raw, sig] = token.split('.'); if (!raw || !sig) throw new AppError('invalid_input', 'Invalid confirmation token', 400);
    const actual = crypto.createHmac('sha256', this.secret).update(raw).digest();
    const supplied = Buffer.from(sig, 'base64url'); if (actual.length !== supplied.length || !crypto.timingSafeEqual(actual, supplied)) throw new AppError('forbidden', 'Invalid confirmation token', 403);
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Payload;
    if (payload.exp < Date.now() || payload.principal !== principal || payload.operation !== operation) throw new AppError('forbidden', 'Confirmation token is expired or mismatched', 403);
    if (this.used.has(payload.nonce)) throw new AppError('conflict', 'Confirmation token was already used', 409);
    if (JSON.stringify(payload.summary) !== JSON.stringify(expected)) throw new AppError('conflict', 'Operation state changed since confirmation was prepared', 409);
    this.used.set(payload.nonce, payload.exp); this.gc();
  }
  private gc(): void { const now = Date.now(); for (const [n, exp] of this.used) if (exp < now) this.used.delete(n); }
}
