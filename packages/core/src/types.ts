/**
 * Core Types for the LVM (Low-Value Management) System
 * 
 * Every code symbol gets a unique, deterministic ID.
 * The LLM navigates "Skeletons" and hydrates on demand.
 */

export type SymbolType =
  | 'function'
  | 'class'
  | 'interface'
  | 'variable'
  | 'import'
  | 'type_alias';

export interface CodeSymbol {
  /** Unique, deterministic hash: `<filePath>:<name>:<startOffset>` */
  id: string;
  /** Human-readable name, e.g., "loginUser" */
  name: string;
  /** Structural category */
  type: SymbolType;
  /** Absolute path of the source file */
  filePath: string;
  startLine: number;
  endLine: number;
  /** Signature only — what the LLM sees in Skeleton mode */
  signature: string;
  /** Full implementation — stored locally, sent only on Hydration */
  fullBody: string;
  /** Resolved names of symbols this one depends on */
  dependencies: string[];
  /** Approximate token count of fullBody */
  tokenCount: number;
}

export interface ScanResult {
  symbols: CodeSymbol[];
  /** Maps local import name → source specifier */
  imports: Map<string, string>;
}

export interface CondensationOptions {
  /** Dependency depth to include in context (0 = signatures only) */
  depth: number;
  preserveComments: boolean;
  /** Hard cap on tokens to include in one LLM call */
  maxTokenBudget: number;
}

export interface EfficiencyReport {
  rawTokens: number;
  condensedTokens: number;
  savingsPercent: string;
  estimatedCostRaw: string;
  estimatedCostLVM: string;
}

export interface HydrationRequest {
  symbolIds: string[];
  depth?: number;
}

export interface ICondenserEngine {
  indexSource(pathOrGlob: string): Promise<void>;
  generateSkeleton(filePath: string): string;
  hydrateSymbol(symbolId: string): string;
  hydrateMany(request: HydrationRequest): string[];
  getEfficiencyReport(): EfficiencyReport;
  resolveSymbol(name: string, fromFile: string): CodeSymbol | null;
}
