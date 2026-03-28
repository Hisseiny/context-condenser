/**
 * packages/core/src/parser/__tests__/tree-sitter-logic.test.ts
 */

import { describe, it, expect } from 'vitest';
import { extractSymbols } from '../tree-sitter-logic';

const SAMPLE_TS = `
import { db } from './database';
import type { UserDTO } from './types';

export async function getUser(id: string): Promise<UserDTO> {
  const row = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return row as UserDTO;
}

export class UserService {
  private async hashPassword(plain: string): Promise<string> {
    return plain.split('').reverse().join('');
  }

  async login(email: string, password: string): Promise<UserDTO | null> {
    const user = await getUser(email);
    const hashed = await this.hashPassword(password);
    return user;
  }
}
`;

describe('extractSymbols', () => {
  it('extracts function declarations', () => {
    const { symbols } = extractSymbols(SAMPLE_TS, '/test/user.ts');
    const names = symbols.map((s) => s.name);
    expect(names).toContain('getUser');
  });

  it('extracts class and method definitions', () => {
    const { symbols } = extractSymbols(SAMPLE_TS, '/test/user.ts');
    const names = symbols.map((s) => s.name);
    expect(names).toContain('UserService');
    expect(names).toContain('login');
    expect(names).toContain('hashPassword');
  });

  it('captures import mappings', () => {
    const { imports } = extractSymbols(SAMPLE_TS, '/test/user.ts');
    expect(imports.get('db')).toBe('./database');
    expect(imports.get('UserDTO')).toBe('./types');
  });

  it('records call-site dependencies', () => {
    const { symbols } = extractSymbols(SAMPLE_TS, '/test/user.ts');
    const loginFn = symbols.find((s) => s.name === 'login');
    expect(loginFn).toBeDefined();
    expect(loginFn!.dependencies).toContain('getUser');
  });

  it('assigns unique IDs', () => {
    const { symbols } = extractSymbols(SAMPLE_TS, '/test/user.ts');
    const ids = symbols.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('generates accurate token counts', () => {
    const { symbols } = extractSymbols(SAMPLE_TS, '/test/user.ts');
    symbols.forEach((s) => {
      expect(s.tokenCount).toBeGreaterThan(0);
    });
  });
});
