/**
 * packages/core/src/indexer/resolver.ts
 *
 * Resolves a symbol NAME (e.g., "userService") found inside one file
 * to the actual CodeSymbol definition — potentially in another file.
 *
 * Priority:
 *   1. Local definition in same file
 *   2. Named import that matches an indexed file
 *   3. Single unambiguous global match
 */

import path from 'path';
import { CodeSymbol } from '../types';

export class SymbolResolver {
  /** name → all known definitions across the workspace */
  private globalIndex = new Map<string, CodeSymbol[]>();

  public addToIndex(symbols: CodeSymbol[]): void {
    for (const symbol of symbols) {
      const existing = this.globalIndex.get(symbol.name) ?? [];
      this.globalIndex.set(symbol.name, [...existing, symbol]);
    }
  }

  /**
   * @param symbolName   The raw identifier string (e.g., "userService")
   * @param sourceFile   Absolute path of the file containing the reference
   * @param imports      Map of localName → import specifier for sourceFile
   */
  public resolve(
    symbolName: string,
    sourceFile: string,
    imports: Map<string, string>
  ): CodeSymbol | null {
    const candidates = this.globalIndex.get(symbolName);
    if (!candidates?.length) return null;

    // 1. Local — defined in the same file
    const local = candidates.find((c) => c.filePath === sourceFile);
    if (local) return local;

    // 2. Import-guided — follow the import statement
    const importSpec = imports.get(symbolName);
    if (importSpec) {
      const absImport = path.resolve(path.dirname(sourceFile), importSpec);
      const match = candidates.find((c) =>
        c.filePath.startsWith(absImport)
      );
      if (match) return match;
    }

    // 3. Global singleton — unambiguous
    if (candidates.length === 1) return candidates[0] ?? null;

    return null; // Ambiguous
  }

  public stats(): { totalSymbols: number; uniqueNames: number } {
    let totalSymbols = 0;
    this.globalIndex.forEach((arr) => (totalSymbols += arr.length));
    return { totalSymbols, uniqueNames: this.globalIndex.size };
  }
}
