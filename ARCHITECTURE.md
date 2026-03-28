# Architecture: Context-Condenser (LVM)

> This document is for contributors and curious engineers who want to understand *why* the code is structured this way.

---

## Core Philosophy

Traditional RAG (Retrieval-Augmented Generation) treats code as **text chunks**. It splits files by line count or character limit and throws chunks at a vector database.

LVM treats code as a **Directed Acyclic Graph (DAG) of typed Symbols**. Every function, class, and interface is a node. Every call-site or type reference is a directed edge. The LLM navigates this graph on demand — it never receives more than it needs.

This distinction matters for three reasons:

1. **Correctness** — Semantic boundaries (function start/end) are always respected. No half-functions, no split type definitions.
2. **Determinism** — Every symbol has a stable `@LVM-ID`. The AI can say "replace the body of `fn_loginUser_42`" instead of "find the function on line 47."
3. **Efficiency** — Compressed skeletons are 10–20x smaller than raw source, and the compression ratio improves as the codebase grows.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Request Path                                 │
│                                                                      │
│  File System ──► IgnoreManager ──► tree-sitter Parser               │
│                                          │                           │
│                                    ScanResult                        │
│                                    (symbols + imports)               │
│                                          │                           │
│                               ┌──────────┴───────────┐              │
│                          SymbolGraph            SymbolResolver        │
│                          (DAG of IDs)           (name → CodeSymbol)  │
│                               └──────────┬───────────┘              │
│                                          │                           │
│                                   CondenserEngine                    │
│                                          │                           │
│                     ┌────────────────────┼─────────────────┐        │
│                 CLI Scan            MCP Server        VS Code Ext    │
│               (efficiency         (hydrate_context,   (Ghost Mode,  │
│                report)             get_skeleton)       status bar)   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown

### 1. `IgnoreManager` (`core/src/utils/ignore-manager.ts`)

**Responsibility:** Prune the file tree before any parsing happens.

Loads rules from (in priority order):
1. Hard-coded defaults (`node_modules`, `dist`, `*.min.js`, etc.)
2. `.gitignore` in the project root
3. `.lvmignore` in the project root

Uses the `ignore` npm package — the same engine as `git` — so behavior is byte-for-byte identical to what developers expect.

**Why this is first:** Without pruning, scanning a React project takes ~30 seconds (node_modules has 50k+ JS files). With pruning, it takes < 500ms.

---

### 2. `extractSymbols` (`core/src/parser/tree-sitter-logic.ts`)

**Responsibility:** Convert raw source code into a structured `ScanResult`.

Uses tree-sitter's C-native parser via Node bindings. The traversal is a single depth-first walk — **O(n) where n = AST node count**.

In one pass it captures:

| Capture | Node Types |
|---|---|
| Import map | `import_declaration` |
| Definitions | `function_declaration`, `method_definition`, `arrow_function`, `class_declaration`, `interface_declaration`, `type_alias_declaration` |
| Call dependencies | `call_expression` (base identifier extracted) |
| Type dependencies | `type_identifier` |

**The context stack pattern:**

```typescript
const contextStack: CodeSymbol[] = [];

// When we ENTER a definition → push onto stack
contextStack.push(currentSymbol);

// When we see a call_expression → attribute to stack top
activeParent.dependencies.push(calleeName);

// When we EXIT a definition → pop from stack
contextStack.pop();
```

This gives us **lexical scoping for free** without any complex scope resolution logic.

---

### 3. `SymbolGraph` (`core/src/indexer/graph.ts`)

**Responsibility:** Maintain the DAG of all indexed symbols.

```
┌──────────────┐    calls     ┌──────────────────┐
│  loginUser   │ ──────────► │   hashPassword    │
└──────────────┘              └──────────────────┘
       │ uses type                    │ uses type
       ▼                              ▼
┌──────────────┐              ┌──────────────────┐
│  Credentials │              │      string       │
└──────────────┘              └──────────────────┘
```

**Key method: `getRequiredContext(id, depth)`**

BFS traversal up to `depth` hops. At depth 0 you get the target. At depth 1 you get the target + all direct dependencies. At depth 2 you get the full subgraph.

This powers the "smart hydration" feature — the LLM can request a function and automatically receive its type definitions without a second round-trip.

---

### 4. `SymbolResolver` (`core/src/indexer/resolver.ts`)

**Responsibility:** Map a raw identifier string to its `CodeSymbol` definition, possibly across files.

**Resolution priority:**

```
1. Local definition (same file)         → unambiguous
2. Named import match                   → follow the import path
3. Single global match                  → safe assumption for SaaS monorepos
4. null                                 → ambiguous, skip dependency link
```

The resolver is what makes multi-file dependency linking work. Without it, `userService` found in `controller.ts` would never be connected to the class definition in `services/user.ts`.

---

### 5. `CondenserEngine` (`core/src/condenser.ts`)

**Responsibility:** The public API. Orchestrates all other components.

Key design decisions:

- **`indexSource` is async and parallel** — uses `Promise.all` over directory entries for fast bulk indexing
- **Incremental re-indexing** — `indexFile(path)` can be called on a single file (used by VS Code's on-save hook) without re-scanning the whole project
- **Stats accumulation** — `rawTokenTotal` and `condensedTokenTotal` grow across all indexed files, powering the efficiency report without storing raw source in memory

---

### 6. MCP Server (`mcp-server/src/index.ts`)

**Responsibility:** Translate between the MCP JSON-RPC protocol and the CondenserEngine.

The server exposes three tools and one prompt:

- **`hydrate_context`** — core hydration with optional depth
- **`get_skeleton`** — file-level skeleton view
- **`efficiency_report`** — session stats
- **`lvm-system` prompt** — auto-injects operating instructions so the LLM knows how to use the tools

The system prompt is delivered via MCP's `prompts` endpoint, which means Claude Desktop injects it automatically — the user doesn't need to copy-paste anything.

---

## Data Structures

### `CodeSymbol`

```typescript
interface CodeSymbol {
  id: string;          // "src/auth.ts:loginUser:42"   (stable, deterministic)
  name: string;        // "loginUser"
  type: SymbolType;    // 'function' | 'class' | 'interface' | ...
  filePath: string;    // "/abs/path/src/auth.ts"
  startLine: number;   // 0-indexed
  endLine: number;
  signature: string;   // Everything before the opening brace
  fullBody: string;    // The complete node text (stored locally, never sent unless hydrated)
  dependencies: string[]; // Raw identifier names found inside this symbol
  tokenCount: number;  // Estimated token cost of fullBody
}
```

### `@LVM-ID` format

```
<absolute-file-path>:<symbol-name>:<start-char-offset>
```

The offset (not line number) is used because it's stable even if comments are added above a function. Line numbers shift; character positions within a symbol do not.

---

## Performance Characteristics

| Operation | Complexity | Typical time (10k file repo) |
|---|---|---|
| `indexSource` (full scan) | O(n·k) where k = avg file size | ~2–4s |
| `indexFile` (single file) | O(k) | < 50ms |
| `generateSkeleton` | O(s) where s = symbols in file | < 1ms |
| `hydrateSymbol` | O(1) (hashmap lookup) | < 0.1ms |
| `getRequiredContext` | O(V + E) BFS | < 5ms |

---

## Known Limitations

1. **Anonymous functions** — Arrow functions without a named assignment get an `anon_<offset>` ID. These work correctly but produce less readable IDs.
2. **Dynamic imports** — `require()` and `import()` calls are not traced (only static `import` declarations are mapped).
3. **Metaprogramming** — Decorators and `Proxy`-based code cannot be statically resolved.
4. **Language coverage** — Currently TypeScript/JavaScript only. The parser module is designed for extension via tree-sitter grammar swapping.

---

## Adding a New Language

1. Install the tree-sitter grammar: `npm install tree-sitter-python`
2. Create `packages/core/src/parser/python.ts` mirroring `tree-sitter-logic.ts`
3. Map Python-specific node types (`def`, `class`, `import_from`) to `SymbolType`
4. Register the new extension in `IgnoreManager.PARSEABLE_EXTENSIONS`
5. Add a dispatch in `CondenserEngine.indexFile` based on file extension

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.
