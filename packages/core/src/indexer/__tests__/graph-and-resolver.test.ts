/**
 * packages/core/src/indexer/__tests__/graph-and-resolver.test.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SymbolGraph } from '../graph';
import { SymbolResolver } from '../resolver';
import { CodeSymbol } from '../../types';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSymbol(overrides: Partial<CodeSymbol> = {}): CodeSymbol {
  return {
    id: `test.ts:mockFn:0`,
    name: 'mockFn',
    type: 'function',
    filePath: '/project/test.ts',
    startLine: 0,
    endLine: 10,
    signature: 'function mockFn(): void',
    fullBody: 'function mockFn(): void { console.log("hello"); }',
    dependencies: [],
    tokenCount: 15,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SymbolGraph
// ─────────────────────────────────────────────────────────────────────────────

describe('SymbolGraph', () => {
  let graph: SymbolGraph;

  beforeEach(() => {
    graph = new SymbolGraph();
  });

  it('stores and retrieves a node by ID', () => {
    const sym = makeSymbol({ id: 'a.ts:foo:0', name: 'foo' });
    graph.addNode(sym);
    expect(graph.getNode('a.ts:foo:0')).toEqual(sym);
  });

  it('returns undefined for unknown ID', () => {
    expect(graph.getNode('nonexistent')).toBeUndefined();
  });

  it('getByName returns all symbols with matching name', () => {
    const sym1 = makeSymbol({ id: 'a.ts:Button:0', name: 'Button', filePath: '/a.ts' });
    const sym2 = makeSymbol({ id: 'b.ts:Button:0', name: 'Button', filePath: '/b.ts' });
    graph.addNode(sym1);
    graph.addNode(sym2);

    const results = graph.getByName('Button');
    expect(results).toHaveLength(2);
  });

  it('size() tracks node count correctly', () => {
    expect(graph.size()).toBe(0);
    graph.addNode(makeSymbol({ id: 'a.ts:x:0', name: 'x' }));
    graph.addNode(makeSymbol({ id: 'a.ts:y:0', name: 'y' }));
    expect(graph.size()).toBe(2);
  });

  it('getRequiredContext depth=0 returns only target', () => {
    const root = makeSymbol({ id: 'root:fn:0', name: 'root' });
    const dep = makeSymbol({ id: 'dep:fn:0', name: 'dep' });
    graph.addNode(root);
    graph.addNode(dep);
    graph.addDependency('root:fn:0', 'dep:fn:0');

    const ctx = graph.getRequiredContext('root:fn:0', 0);
    expect(ctx.map((s) => s.id)).toEqual(['root:fn:0']);
  });

  it('getRequiredContext depth=1 includes direct dependencies', () => {
    const root = makeSymbol({ id: 'root:fn:0', name: 'root' });
    const dep1 = makeSymbol({ id: 'dep1:fn:0', name: 'dep1' });
    const dep2 = makeSymbol({ id: 'dep2:fn:0', name: 'dep2' });
    graph.addNode(root);
    graph.addNode(dep1);
    graph.addNode(dep2);
    graph.addDependency('root:fn:0', 'dep1:fn:0');
    graph.addDependency('root:fn:0', 'dep2:fn:0');

    const ctx = graph.getRequiredContext('root:fn:0', 1);
    const ids = ctx.map((s) => s.id);
    expect(ids).toContain('root:fn:0');
    expect(ids).toContain('dep1:fn:0');
    expect(ids).toContain('dep2:fn:0');
  });

  it('getRequiredContext depth=2 follows transitive deps', () => {
    const a = makeSymbol({ id: 'a:0', name: 'a' });
    const b = makeSymbol({ id: 'b:0', name: 'b' });
    const c = makeSymbol({ id: 'c:0', name: 'c' });
    [a, b, c].forEach((s) => graph.addNode(s));
    graph.addDependency('a:0', 'b:0');
    graph.addDependency('b:0', 'c:0');

    const ctx = graph.getRequiredContext('a:0', 2);
    const ids = ctx.map((s) => s.id);
    expect(ids).toContain('a:0');
    expect(ids).toContain('b:0');
    expect(ids).toContain('c:0');
  });

  it('does not follow cycles infinitely', () => {
    const a = makeSymbol({ id: 'a:0', name: 'a' });
    const b = makeSymbol({ id: 'b:0', name: 'b' });
    graph.addNode(a);
    graph.addNode(b);
    graph.addDependency('a:0', 'b:0');
    graph.addDependency('b:0', 'a:0'); // cycle

    // Should not hang or stack overflow
    const ctx = graph.getRequiredContext('a:0', 5);
    expect(ctx.length).toBeLessThanOrEqual(2);
  });

  it('getFileSymbols returns only symbols for that file', () => {
    const s1 = makeSymbol({ id: 'a.ts:fn1:0', filePath: '/a.ts', name: 'fn1' });
    const s2 = makeSymbol({ id: 'a.ts:fn2:0', filePath: '/a.ts', name: 'fn2' });
    const s3 = makeSymbol({ id: 'b.ts:fn3:0', filePath: '/b.ts', name: 'fn3' });
    [s1, s2, s3].forEach((s) => graph.addNode(s));

    const aSymbols = graph.getFileSymbols('/a.ts');
    expect(aSymbols).toHaveLength(2);
    expect(aSymbols.map((s) => s.name)).not.toContain('fn3');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SymbolResolver
// ─────────────────────────────────────────────────────────────────────────────

describe('SymbolResolver', () => {
  let resolver: SymbolResolver;

  const localSymbol = makeSymbol({
    id: '/project/src/auth.ts:loginUser:0',
    name: 'loginUser',
    filePath: '/project/src/auth.ts',
  });

  const remoteSymbol = makeSymbol({
    id: '/project/src/utils.ts:hashPassword:0',
    name: 'hashPassword',
    filePath: '/project/src/utils.ts',
  });

  const ambigSymbol1 = makeSymbol({
    id: '/a/Button:0',
    name: 'Button',
    filePath: '/project/src/a/Button.tsx',
  });

  const ambigSymbol2 = makeSymbol({
    id: '/b/Button:0',
    name: 'Button',
    filePath: '/project/src/b/Button.tsx',
  });

  beforeEach(() => {
    resolver = new SymbolResolver();
    resolver.addToIndex([localSymbol, remoteSymbol, ambigSymbol1, ambigSymbol2]);
  });

  it('resolves local symbol (same file)', () => {
    const result = resolver.resolve('loginUser', '/project/src/auth.ts', new Map());
    expect(result?.id).toBe(localSymbol.id);
  });

  it('resolves cross-file symbol via import map', () => {
    const imports = new Map([['hashPassword', './utils']]);
    const result = resolver.resolve('hashPassword', '/project/src/auth.ts', imports);
    expect(result?.filePath).toBe('/project/src/utils.ts');
  });

  it('resolves singleton global without imports', () => {
    const result = resolver.resolve('hashPassword', '/project/src/other.ts', new Map());
    // Only one hashPassword in index → resolved
    expect(result?.name).toBe('hashPassword');
  });

  it('returns null for ambiguous symbol without import hint', () => {
    const result = resolver.resolve('Button', '/project/src/page.tsx', new Map());
    // Two Buttons exist — ambiguous → null
    expect(result).toBeNull();
  });

  it('returns null for completely unknown symbol', () => {
    const result = resolver.resolve('DoesNotExist', '/project/src/auth.ts', new Map());
    expect(result).toBeNull();
  });

  it('reports correct stats after adding symbols', () => {
    const stats = resolver.stats();
    expect(stats.totalSymbols).toBe(4);
    expect(stats.uniqueNames).toBe(3); // loginUser, hashPassword, Button
  });

  it('accumulates symbols across multiple addToIndex calls', () => {
    const extra = makeSymbol({ id: 'extra:fn:0', name: 'extraFn', filePath: '/extra.ts' });
    resolver.addToIndex([extra]);
    const stats = resolver.stats();
    expect(stats.totalSymbols).toBe(5);
  });
});
