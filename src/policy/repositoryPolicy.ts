import { AppError } from '../errors.js';
import type { RepositoryPolicy, RepositoryRule } from '../config/types.js';

function match(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

export class PolicyService {
  constructor(private readonly policy: RepositoryPolicy) {}
  rule(owner: string, repo: string): RepositoryRule {
    const rule = this.policy.repositories[`${owner}/${repo}`];
    if (!rule) throw new AppError('forbidden', 'Repository is not allowlisted', 403);
    return rule;
  }
  assertRead(owner: string, repo: string): RepositoryRule { return this.rule(owner, repo); }
  assertWrite(owner: string, repo: string): RepositoryRule {
    const rule = this.rule(owner, repo); if (rule.access !== 'write') throw new AppError('forbidden', 'Repository is read-only', 403); return rule;
  }
  assertWorkBranch(rule: RepositoryRule, branch: string): void {
    if (!rule.allowed_work_branch_patterns.some(p => match(p, branch))) throw new AppError('forbidden', 'Branch is outside allowed work branch patterns', 403);
  }
  isProtected(rule: RepositoryRule, branch: string): boolean { return rule.protected_branches.some(p => match(p, branch)); }
}

const SENSITIVE = [/(^|\/)\.env$/i, /(^|\/)\.git(\/|$)/i, /(^|\/)\.npmrc$/i, /(^|\/)\.pypirc$/i, /id_(rsa|ed25519|ecdsa)$/i, /credentials/i, /docker\/config\.json$/i];
export function assertSafeRepoPath(path: string): void {
  if (!path || path.includes('\0') || /[\x00-\x1f]/.test(path) || path.startsWith('/') || path.split('/').includes('..') || path.startsWith('-')) throw new AppError('invalid_input', 'Unsafe repository path', 400);
  if (SENSITIVE.some(r => r.test(path)) && !/(^|\/)\.env\.example$/i.test(path)) throw new AppError('forbidden', 'Sensitive repository path is blocked', 403);
}
