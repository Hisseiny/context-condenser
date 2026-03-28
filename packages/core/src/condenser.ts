/**
 * packages/core/src/condenser.ts
 *
 * The CondenserEngine ties together:
 * - Multi-file indexing via tree-sitter
 * - Dependency graph construction
 * - Symbol resolution across files
 * - Skeleton generation (what the LLM sees)
 * - Hydration (what the LLM gets on demand)
 * - Efficiency reporting (the "Proof of Savings")
 */

import fs from 'fs/promises';
import path from 'path';
import { extractSymbols } from './parser/tree-sitter-logic';
import { SymbolGraph } from './indexer/graph';
import { SymbolResolver } from './indexer/resolver';
import { IgnoreManager } from './utils/ignore-manager';
import { estimateTokens, estimateCost, savingsPercent } from './utils/tokens';
import {
  CodeSymbol,
  CondensationOptions,
  EfficiencyReport,
  HydrationRequest,
  ICondenserEngine,
} from './types';

const SKELETON_PLACEHOLDER = '/* [Body Condensed] */';

export class CondenserEngine implements ICondenserEngine {
  private graph = new SymbolGraph();
  private resolver = new SymbolResolver();
  /** filePath → Map<localName, importSource> */
  private fileImports = new Map<string, Map<string, string>>();
  /** symbolId → CodeSymbol (fast hydration lookup) */
  private symbolById = new Map<string, CodeSymbol>();

  private rawTokenTotal = 0;
  private condensedTokenTotal = 0;

  // -------------------------------------------------------------------------
  // Indexing
  // -------------------------------------------------------------------------

  /**
   * Index a single file — called on save in the VS Code extension,
   * or during the initial `lvm scan` pass.
   */
  public async indexFile(filePath: string): Promise<void> {
    let source: string;
    try {
      source = await fs.readFile(filePath, 'utf8');
    } catch {
      return; // File removed between directory listing and read — harmless
    }

    const { symbols, imports } = extractSymbols(source, filePath);

    // Update import map (needed by resolver)
    this.fileImports.set(filePath, imports);

    // Register each symbol
    for (const symbol of symbols) {
      this.graph.addNode(symbol);
      this.symbolById.set(symbol.id, symbol);
      this.resolver.addToIndex([symbol]);
    }

    // Wire up dependencies in the graph
    for (const symbol of symbols) {
      for (const depName of symbol.dependencies) {
        const resolved = this.resolver.resolve(depName, filePath, imports);
        if (resolved) this.graph.addDependency(symbol.id, resolved.id);
      }
    }

    // Accumulate stats
    this.rawTokenTotal += estimateTokens(source);
    const skeleton = this.generateSkeleton(filePath);
    this.condensedTokenTotal += estimateTokens(skeleton);
  }

  /**
   * Recursively index a directory, respecting .lvmignore and .gitignore.
   */
  public async indexSource(dirOrFile: string): Promise<void> {
    const absolutePath = path.resolve(dirOrFile);
    const stat = await fs.stat(absolutePath);

    if (stat.isFile()) {
      await this.indexFile(absolutePath);
      return;
    }

    // Initialize IgnoreManager at the root of the scan
    const ignoreManager = new IgnoreManager(absolutePath);

    const walk = async (current: string): Promise<void> => {
      let entries: string[];
      try {
        entries = await fs.readdir(current);
      } catch {
        return;
      }

      await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(current, entry);
          const relPath = path.relative(absolutePath, fullPath);

          // 1. Check if the path is ignored by .gitignore/.lvmignore
          if (ignoreManager.isIgnored(relPath)) return;

          const entryStat = await fs.stat(fullPath).catch(() => null);
          if (!entryStat) return;

          if (entryStat.isDirectory()) {
            await walk(fullPath);
          } else if (ignoreManager.isParseable(entry)) {
            // 2. Only index if it's a parseable code file (replaces isAllowed)
            await this.indexFile(fullPath);
          }
        })
      );
    };

    await walk(absolutePath);
  }

  // -------------------------------------------------------------------------
  // Skeleton generation
  // -------------------------------------------------------------------------

  /**
   * Returns the "condensed" view of a file — function bodies are replaced
   * with a placeholder comment that includes the `@LVM-ID` for hydration.
   */
  public generateSkeleton(filePath: string): string {
    const symbols = this.graph.getFileSymbols(filePath);
    if (symbols.length === 0) return '';

    // Sort by start line so we can reconstruct top-to-bottom
    symbols.sort((a, b) => a.startLine - b.startLine);

    return symbols
      .map(
        (s) =>
          `/* @LVM-ID: ${s.id} */\n${s.signature} { ${SKELETON_PLACEHOLDER} }`
      )
      .join('\n\n');
  }

  // -------------------------------------------------------------------------
  // Hydration
  // -------------------------------------------------------------------------

  /**
   * Swap a skeleton placeholder back for the full implementation.
   * This is what the MCP `hydrate_context` tool calls.
   */
  public hydrateSymbol(symbolId: string): string {
    const symbol = this.symbolById.get(symbolId);
    if (!symbol) {
      return `// ⚠️  LVM: Symbol "${symbolId}" not found in index. Try re-running lvm scan.`;
    }
    return symbol.fullBody;
  }

  /**
   * Batch hydration with optional dependency expansion.
   */
  public hydrateMany({ symbolIds, depth = 0 }: HydrationRequest): string[] {
    const allIds = new Set<string>(symbolIds);

    if (depth > 0) {
      symbolIds.forEach((id) => {
        const contextSymbols = this.graph.getRequiredContext(id, depth);
        contextSymbols.forEach((s) => allIds.add(s.id));
      });
    }

    return Array.from(allIds).map((id) => this.hydrateSymbol(id));
  }

  // -------------------------------------------------------------------------
  // Reporting
  // -------------------------------------------------------------------------

  public getEfficiencyReport(): EfficiencyReport {
    return {
      rawTokens: this.rawTokenTotal,
      condensedTokens: this.condensedTokenTotal,
      savingsPercent: savingsPercent(this.rawTokenTotal, this.condensedTokenTotal),
      estimatedCostRaw: estimateCost(this.rawTokenTotal),
      estimatedCostLVM: estimateCost(this.condensedTokenTotal),
    };
  }

  public resolveSymbol(name: string, fromFile: string): CodeSymbol | null {
    const imports = this.fileImports.get(fromFile) ?? new Map();
    return this.resolver.resolve(name, fromFile, imports);
  }

  public totalSymbols(): number {
    return this.symbolById.size;
  }
}
