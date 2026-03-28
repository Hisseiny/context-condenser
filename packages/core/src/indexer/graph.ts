/**
 * packages/core/src/indexer/graph.ts
 *
 * Directed Acyclic Graph of all code symbols across the workspace.
 * Powers the "recursive hydration" feature: pulling a function
 * automatically surfaces its required types and utilities.
 */

import { CodeSymbol } from '../types';

export class SymbolGraph {
  /** SymbolID → Symbol metadata */
  private nodes = new Map<string, CodeSymbol>();
  /** SymbolID → Set of SymbolIDs it depends on */
  private edges = new Map<string, Set<string>>();
  /** Symbol name (non-unique) → all SymbolIDs with that name */
  private byName = new Map<string, string[]>();

  // -------------------------------------------------------------------------
  // Mutations
  // -------------------------------------------------------------------------

  public addNode(symbol: CodeSymbol): void {
    this.nodes.set(symbol.id, symbol);
    const existing = this.byName.get(symbol.name) ?? [];
    this.byName.set(symbol.name, [...existing, symbol.id]);
  }

  public addDependency(fromId: string, toId: string): void {
    if (!this.edges.has(fromId)) this.edges.set(fromId, new Set());
    this.edges.get(fromId)!.add(toId);
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  public getNode(id: string): CodeSymbol | undefined {
    return this.nodes.get(id);
  }

  public getByName(name: string): CodeSymbol[] {
    return (this.byName.get(name) ?? [])
      .map((id) => this.nodes.get(id)!)
      .filter(Boolean);
  }

  /**
   * BFS hydration: returns the target symbol plus all transitive
   * dependencies up to `maxDepth` hops.
   *
   * This is what makes the "smart context" so powerful — you ask for
   * `loginUser` and automatically get the `UserDTO` interface and
   * `hashPassword` utility without any manual work.
   */
  public getRequiredContext(
    symbolId: string,
    maxDepth = 1
  ): CodeSymbol[] {
    const visited = new Set<string>();
    const result: CodeSymbol[] = [];
    const queue: Array<{ id: string; depth: number }> = [
      { id: symbolId, depth: 0 },
    ];

    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) continue;

      result.push(node);

      if (depth < maxDepth) {
        const deps = this.edges.get(id) ?? new Set<string>();
        deps.forEach((depId) => queue.push({ id: depId, depth: depth + 1 }));
      }
    }

    return result;
  }

  /** Total number of indexed symbols */
  public size(): number {
    return this.nodes.size;
  }

  /** All symbols for a given file */
  public getFileSymbols(filePath: string): CodeSymbol[] {
    return Array.from(this.nodes.values()).filter(
      (s) => s.filePath === filePath
    );
  }
}
