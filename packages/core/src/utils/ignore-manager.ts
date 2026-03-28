/**
 * packages/core/src/utils/ignore-manager.ts
 * * Handles file filtering logic for the Condenser.
 * Integrates .gitignore, .lvmignore, and hardcoded rules.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import ignore, { Ignore } from 'ignore';

export class IgnoreManager {
  private ig: Ignore;
  private readonly PARSEABLE_EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx'];
  private readonly ALWAYS_IGNORE = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '.turbo',
    'out',
    '.next',
    'coverage',
  ];

  constructor(workspaceRoot: string) {
    this.ig = ignore();
    
    // 1. Add default hardcoded ignores
    this.ig.add(this.ALWAYS_IGNORE);

    // 2. Load .gitignore if it exists
    const gitignorePath = join(workspaceRoot, '.gitignore');
    if (existsSync(gitignorePath)) {
      this.ig.add(readFileSync(gitignorePath).toString());
    }

    // 3. Load .lvmignore (Context-Condenser specific) if it exists
    const lvmignorePath = join(workspaceRoot, '.lvmignore');
    if (existsSync(lvmignorePath)) {
      this.ig.add(readFileSync(lvmignorePath).toString());
    }
  }

  /**
   * Determines if a file should be skipped based on ignore rules.
   */
  isIgnored(relPath: string): boolean {
    return this.ig.ignores(relPath);
  }

  /**
   * Determines if a file is a candidate for LVM symbol extraction.
   * Explicitly rejects .d.ts files to avoid bloating context with type defs.
   */
  isParseable(filename: string): boolean {
    // Hard block TypeScript declaration files
    if (filename.endsWith('.d.ts')) {
      return false;
    }

    // Check against allowed extensions
    return this.PARSEABLE_EXTENSIONS.some(ext => filename.endsWith(ext));
  }

  /**
   * For non-parseable files (images, binary, etc.), we might still want to
   * show their existence in the tree but not attempt to "condense" them.
   */
  isTextFile(filename: string): boolean {
    const textExtensions = ['.md', '.txt', '.json', '.yaml', '.yml', '.toml'];
    return this.isParseable(filename) || textExtensions.some(ext => filename.endsWith(ext));
  }
}
