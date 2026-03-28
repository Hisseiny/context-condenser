/**
 * packages/core/src/utils/__tests__/ignore-manager.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IgnoreManager, PARSEABLE_EXTENSIONS } from '../ignore-manager';
import fs from 'fs';
import os from 'os';
import path from 'path';

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lvm-test-'));
}

describe('IgnoreManager — default ignores', () => {
  let root: string;
  let manager: IgnoreManager;

  beforeEach(() => {
    root = makeTempDir();
    manager = new IgnoreManager(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('blocks node_modules', () => {
    expect(manager.isAllowed(path.join(root, 'node_modules', 'react', 'index.js'))).toBe(false);
  });

  it('blocks dist directory', () => {
    expect(manager.isAllowed(path.join(root, 'dist', 'bundle.js'))).toBe(false);
  });

  it('blocks .min.js files', () => {
    expect(manager.isAllowed(path.join(root, 'src', 'vendor.min.js'))).toBe(false);
  });

  it('allows source TypeScript files', () => {
    expect(manager.isAllowed(path.join(root, 'src', 'auth.ts'))).toBe(true);
  });

  it('allows nested source files', () => {
    expect(manager.isAllowed(path.join(root, 'src', 'services', 'user.ts'))).toBe(true);
  });
});

describe('IgnoreManager — .lvmignore', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    fs.writeFileSync(
      path.join(root, '.lvmignore'),
      'fixtures/\n*.test.ts\ngenerated/'
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('respects custom ignore patterns', () => {
    const manager = new IgnoreManager(root);
    expect(manager.isAllowed(path.join(root, 'fixtures', 'large-fixture.ts'))).toBe(false);
    expect(manager.isAllowed(path.join(root, 'generated', 'schema.ts'))).toBe(false);
  });

  it('still allows non-ignored source files', () => {
    const manager = new IgnoreManager(root);
    expect(manager.isAllowed(path.join(root, 'src', 'main.ts'))).toBe(true);
  });
});

describe('IgnoreManager — .gitignore integration', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir();
    fs.writeFileSync(
      path.join(root, '.gitignore'),
      '.env\nsecrets/\n*.key'
    );
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('respects .gitignore patterns automatically', () => {
    const manager = new IgnoreManager(root);
    expect(manager.isAllowed(path.join(root, '.env'))).toBe(false);
    expect(manager.isAllowed(path.join(root, 'secrets', 'api.ts'))).toBe(false);
  });
});

describe('PARSEABLE_EXTENSIONS', () => {
  const manager = new IgnoreManager(os.tmpdir());

  it('accepts TypeScript files', () => {
    expect(manager.isParseable('auth.ts')).toBe(true);
    expect(manager.isParseable('component.tsx')).toBe(true);
  });

  it('accepts JavaScript files', () => {
    expect(manager.isParseable('index.js')).toBe(true);
    expect(manager.isParseable('app.jsx')).toBe(true);
    expect(manager.isParseable('module.mjs')).toBe(true);
  });

  it('rejects non-parseable files', () => {
    expect(manager.isParseable('style.css')).toBe(false);
    expect(manager.isParseable('data.json')).toBe(false);
    expect(manager.isParseable('image.png')).toBe(false);
    expect(manager.isParseable('types.d.ts')).toBe(false); // blocked by hard ignore
  });
});
