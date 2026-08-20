import crypto from 'node:crypto';
import express from 'express';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler } from '@modelcontextprotocol/server';
import type { RuntimeConfig } from '../config/types.js';
import { ConfirmationService } from '../confirmation/service.js';
import { buildMcpServer } from '../mcp/server.js';
import type { GitPlatformProvider } from '../provider/types.js';

function bearerOk(actual: string | undefined, expected: string | undefined): boolean {
  if (!actual?.startsWith('Bearer ') || !expected) return false;
  const a = Buffer.from(actual.slice(7)); const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createApp(config: RuntimeConfig, provider: GitPlatformProvider) {
  const app = createMcpExpressApp({ host: config.host, allowedHosts: config.allowedHosts, allowedOrigins: config.allowedOrigins });
  app.use(express.json({ limit: '2mb' }));
  app.use((req, res, next) => {
    if (config.authMode === 'bearer' && !bearerOk(req.header('authorization'), config.bearerToken)) { res.status(401).json({ error: 'unauthorized' }); return; }
    next();
  });
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
  app.get('/readyz', async (_req, res) => {
    try { if (Object.keys(config.policy.repositories).length === 0) throw new Error('empty policy'); await provider.getMe(); res.json({ status: 'ready' }); }
    catch { res.status(503).json({ status: 'not_ready' }); }
  });
  const confirmation = new ConfirmationService(config.confirmationSecret);
  const handler = createMcpHandler(() => buildMcpServer(config, provider, confirmation), { legacy: 'reject' });
  const node = toNodeHandler(handler);
  app.post('/mcp', (req, res) => void node(req, res, req.body));
  return app;
}
