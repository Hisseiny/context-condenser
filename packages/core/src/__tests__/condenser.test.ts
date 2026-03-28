/**
 * packages/core/src/__tests__/condenser.test.ts
 *
 * Integration tests for the CondenserEngine.
 * Uses in-memory fixtures — no file system writes needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CondenserEngine } from '../condenser';
import { extractSymbols } from '../parser/tree-sitter-logic';
import { SymbolGraph } from '../indexer/graph';
import { SymbolResolver } from '../indexer/resolver';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures (Prefixed with vi_ to allow Vitest hoisting)
// ─────────────────────────────────────────────────────────────────────────────

const vi_AUTH_TS = `
import { db } from './database';
import { hashPassword } from './utils';
import type { Credentials, User } from './types';

export async function loginUser(creds: Credentials): Promise<User> {
  const user = await db.users.findOne({ email: creds.email });
  if (!user) throw new Error('NOT_FOUND');
  const ok = await hashPassword(creds.password) === user.hash;
  if (!ok) throw new Error('INVALID');
  return user;
}

export async function logoutUser(userId: string): Promise<void> {
  await db.sessions.deleteOne({ userId });
}
`;

const vi_UTILS_TS = `
import crypto from 'crypto';

export async function hashPassword(plain: string): Promise<string> {
  return crypto.createHash('sha256').update(plain).digest('hex');
}

export function generateId(): string {
  return crypto.randomUUID();
}
`;

const vi_TYPES_TS = `
export interface Credentials {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
  hash: string;
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// Parser tests
// ─────────────────────────────────────────────────────────────────────────────

describe('extractSymbols — auth.ts', () => {
  const result = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts');

  it('extracts all top-level functions', () => {
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('loginUser');
    expect(names).toContain('logoutUser');
  });

  it('captures import mappings', () => {
    expect(result.imports.get('db')).toBe('./database');
    expect(result.imports.get('hashPassword')).toBe('./utils');
  });

  it('records call-site dependencies for loginUser', () => {
    const login = result.symbols.find((s) => s.name === 'loginUser');
    expect(login).toBeDefined();
    expect(login!.dependencies.some((d) => d === 'db' || d === 'hashPassword')).toBe(true);
  });

  it('generates unique, stable IDs', () => {
    const ids = result.symbols.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toContain('/project/src/auth.ts'));
  });

  it('includes function signature without body', () => {
    const login = result.symbols.find((s) => s.name === 'loginUser');
    expect(login!.signature).toContain('loginUser');
    expect(login!.signature).not.toContain('findOne');
  });

  it('stores full body', () => {
    const login = result.symbols.find((s) => s.name === 'loginUser');
    expect(login!.fullBody).toContain('findOne');
    expect(login!.fullBody).toContain('NOT_FOUND');
  });

  it('estimates positive token count', () => {
    result.symbols.forEach((s) => {
      expect(s.tokenCount).toBeGreaterThan(0);
    });
  });
});

describe('extractSymbols — types.ts (interfaces)', () => {
  const result = extractSymbols(vi_TYPES_TS, '/project/src/types.ts');

  it('extracts interface declarations', () => {
    const names = result.symbols.map((s) => s.name);
    expect(names).toContain('Credentials');
    expect(names).toContain('User');
  });

  it('types have correct symbol type', () => {
    const creds = result.symbols.find((s) => s.name === 'Credentials');
    expect(creds!.type).toBe('interface');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SymbolGraph tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SymbolGraph', () => {
  let graph: SymbolGraph;

  beforeEach(() => {
    graph = new SymbolGraph();
    const { symbols: authSymbols } = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts');
    const { symbols: utilSymbols } = extractSymbols(vi_UTILS_TS, '/project/src/utils.ts');
    [...authSymbols, ...utilSymbols].forEach((s) => graph.addNode(s));
  });

  it('stores and retrieves nodes by ID', () => {
    const allIds = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts').symbols.map((s) => s.id);
    allIds.forEach((id) => {
      expect(graph.getNode(id)).toBeDefined();
    });
  });

  it('looks up nodes by name', () => {
    const results = graph.getByName('hashPassword');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toBe('hashPassword');
  });

  it('getRequiredContext at depth 0 returns only target', () => {
    const authSymbols = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts').symbols;
    const loginId = authSymbols.find((s) => s.name === 'loginUser')!.id;

    const context = graph.getRequiredContext(loginId, 0);
    expect(context).toHaveLength(1);
    expect(context[0].name).toBe('loginUser');
  });

  it('getRequiredContext at depth 1 includes linked deps', () => {
    const authSymbols = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts').symbols;
    const loginId = authSymbols.find((s) => s.name === 'loginUser')!.id;
    const hashId = extractSymbols(vi_UTILS_TS, '/project/src/utils.ts').symbols.find(
      (s) => s.name === 'hashPassword'
    )!.id;

    graph.addDependency(loginId, hashId);

    const context = graph.getRequiredContext(loginId, 1);
    const names = context.map((s) => s.name);
    expect(names).toContain('loginUser');
    expect(names).toContain('hashPassword');
  });

  it('returns file symbols correctly', () => {
    const authSymbols = graph.getFileSymbols('/project/src/auth.ts');
    const names = authSymbols.map((s) => s.name);
    expect(names).toContain('loginUser');
    expect(names).toContain('logoutUser');
    expect(names).not.toContain('hashPassword');
  });

  it('size() reflects total indexed symbols', () => {
    const authCount = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts').symbols.length;
    const utilCount = extractSymbols(vi_UTILS_TS, '/project/src/utils.ts').symbols.length;
    expect(graph.size()).toBe(authCount + utilCount);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SymbolResolver tests
// ─────────────────────────────────────────────────────────────────────────────

describe('SymbolResolver', () => {
  let resolver: SymbolResolver;

  beforeEach(() => {
    resolver = new SymbolResolver();
    resolver.addToIndex(extractSymbols(vi_AUTH_TS, '/project/src/auth.ts').symbols);
    resolver.addToIndex(extractSymbols(vi_UTILS_TS, '/project/src/utils.ts').symbols);
    resolver.addToIndex(extractSymbols(vi_TYPES_TS, '/project/src/types.ts').symbols);
  });

  it('resolves local symbol (same file)', () => {
    const imports = new Map([['db', './database']]);
    const result = resolver.resolve('logoutUser', '/project/src/auth.ts', imports);
    expect(result).not.toBeNull();
    expect(result!.name).toBe('logoutUser');
    expect(result!.filePath).toBe('/project/src/auth.ts');
  });

  it('resolves cross-file symbol via import map', () => {
    const imports = new Map([['hashPassword', './utils']]);
    const result = resolver.resolve('hashPassword', '/project/src/auth.ts', imports);
    expect(result).not.toBeNull();
    expect(result!.filePath).toBe('/project/src/utils.ts');
  });

  it('returns null for unknown symbol', () => {
    const result = resolver.resolve('nonExistentFn', '/project/src/auth.ts', new Map());
    expect(result).toBeNull();
  });

  it('reports accurate stats', () => {
    const stats = resolver.stats();
    expect(stats.totalSymbols).toBeGreaterThan(0);
    expect(stats.uniqueNames).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CondenserEngine — skeleton generation
// ─────────────────────────────────────────────────────────────────────────────

describe('CondenserEngine.generateSkeleton', () => {
  let engine: CondenserEngine;

  beforeEach(async () => {
    // We mock fs inside the test setup using the vi_ prefixed variables
    vi.mock('fs/promises', () => ({
      readFile: vi.fn().mockResolvedValue(vi_AUTH_TS),
      readdir: vi.fn().mockResolvedValue([]),
      stat: vi.fn().mockResolvedValue({ isFile: () => true, isDirectory: () => false }),
    }));
    
    engine = new CondenserEngine();
    await engine.indexFile('/project/src/auth.ts');
  });

  it('skeleton contains @LVM-ID tags', () => {
    const skeleton = engine.generateSkeleton('/project/src/auth.ts');
    expect(skeleton).toContain('@LVM-ID');
  });

  it('skeleton contains Body Condensed placeholder', () => {
    const skeleton = engine.generateSkeleton('/project/src/auth.ts');
    expect(skeleton).toContain('[Body Condensed]');
  });

  it('skeleton does NOT contain function body logic', () => {
    const skeleton = engine.generateSkeleton('/project/src/auth.ts');
    expect(skeleton).not.toContain('findOne');
    expect(skeleton).not.toContain('NOT_FOUND');
  });

  it('skeleton is smaller than the original source', () => {
    const skeleton = engine.generateSkeleton('/project/src/auth.ts');
    expect(skeleton.length).toBeLessThan(vi_AUTH_TS.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CondenserEngine — hydration
// ─────────────────────────────────────────────────────────────────────────────

describe('CondenserEngine.hydrateSymbol', () => {
  let engine: CondenserEngine;
  let loginId: string;

  beforeEach(() => {
    engine = new CondenserEngine();
    const { symbols } = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts');
    symbols.forEach((s) => {
      (engine as any).symbolById.set(s.id, s);
      (engine as any).graph.addNode(s);
    });
    loginId = symbols.find((s) => s.name === 'loginUser')!.id;
  });

  it('returns full body for known symbol', () => {
    const body = engine.hydrateSymbol(loginId);
    expect(body).toContain('findOne');
    expect(body).toContain('NOT_FOUND');
  });

  it('returns error message for unknown symbol', () => {
    const body = engine.hydrateSymbol('nonexistent:fn:0');
    expect(body).toContain('⚠️');
    expect(body).toContain('not found');
  });

  it('hydrateMany returns array of bodies', () => {
    const { symbols } = extractSymbols(vi_AUTH_TS, '/project/src/auth.ts');
    const allIds = symbols.map((s) => s.id);
    const bodies = engine.hydrateMany({ symbolIds: allIds });
    expect(bodies).toHaveLength(allIds.length);
    bodies.forEach((b) => expect(typeof b).toBe('string'));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Efficiency report
// ─────────────────────────────────────────────────────────────────────────────

describe('CondenserEngine.getEfficiencyReport', () => {
  it('returns zero values before any indexing', () => {
    const engine = new CondenserEngine();
    const report = engine.getEfficiencyReport();
    expect(report.rawTokens).toBe(0);
    expect(report.condensedTokens).toBe(0);
  });

  it('returns valid savings percentage format', () => {
    const engine = new CondenserEngine();
    (engine as any).rawTokenTotal = 10000;
    (engine as any).condensedTokenTotal = 500;
    const report = engine.getEfficiencyReport();
    expect(report.savingsPercent).toMatch(/\d+\.\d+%/);
    expect(parseFloat(report.savingsPercent)).toBeCloseTo(95, 0);
  });

  it('cost strings start with $', () => {
    const engine = new CondenserEngine();
    (engine as any).rawTokenTotal = 100000;
    (engine as any).condensedTokenTotal = 5000;
    const report = engine.getEfficiencyReport();
    expect(report.estimatedCostRaw).toMatch(/^\$/);
    expect(report.estimatedCostLVM).toMatch(/^\$/);
  });
});
