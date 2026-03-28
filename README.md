# 🧊 Context-Condenser

### The LVM (Low-Value Management) layer for LLM-powered development.

**Stop paying to send the same boilerplate to Claude 100 times a day.**

[![npm version](https://img.shields.io/npm/v/@context-condenser/cli?color=00d4aa&label=lvm%20cli)](https://npmjs.com/package/@context-condenser/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Discord](https://img.shields.io/discord/placeholder?label=discord&color=5865F2)](https://discord.gg/placeholder)

---

```
🧊 Context-Condenser: Scanning Project...

alien@Element115:~/context-condenser$ lvm scan .

 ┌──────────────────────────────────────────────────────────┐
 │  🧊 CONTEXT-CONDENSER  v0.1.0                            │
 ├──────────────────────────────────────────────────────────┤
 │  Symbols indexed: 220         Project: context-condens   │
 ├──────────────────────────────────────────────────────────┤
 │  Raw:  ██████████████████████████████    18,308 tokens   │
 │  LVM:  ██████████████░░░░░░░░░░░░░░░░     8,794 tokens   │
 ├──────────────────────────────────────────────────────────┤
 │  Efficiency gain:  52.0% 💚   Cost: $0.0549 → $0.0264    │
 └──────────────────────────────────────────────────────────┘

  Run lvm serve to connect this to Claude Desktop via MCP.

```

*Post your own savings screenshot — tag us [@ContextCondenser](https://twitter.com/ContextConderser)*


---

## The Problem

Every time you ask Claude or GPT-4 to help with your codebase, you send **the entire file** — boilerplate, imports, comments, and all the logic the AI already "knows." On a 50-file project, that's **$1–3 per prompt**. Multiply by 100 prompts/day and you're burning **$100/day** on tokens the AI doesn't need.

## The Solution

Context-Condenser sits between your files and your LLM. It uses a **tree-sitter AST parser** to understand your code as *structure*, not text. It compresses every file into a **Skeleton** — function signatures only — and only **hydrates** (expands) the exact functions the AI needs, exactly when it needs them. 

```typescript
// What the LLM sees (Skeleton — 12 tokens):
/* @LVM-ID: src/auth.ts:loginUser:42 */
export async function loginUser(creds: Credentials): Promise<User> { /* [Body Condensed] */ }

// What the LLM gets when it asks (Hydration — 280 tokens, on demand):
export async function loginUser(creds: Credentials): Promise<User> {
  const user = await db.users.findOne({ email: creds.email });
  if (!user) throw new AuthError('USER_NOT_FOUND');
  const valid = await bcrypt.compare(creds.password, user.passwordHash);
  if (!valid) throw new AuthError('INVALID_PASSWORD');
  return generateSession(user);
}
```

The AI goes from passive reader to **active context manager** — it requests exactly what it needs, nothing more.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🌳 **AST-Aware** | Uses tree-sitter — understands nested scopes, not just text patterns |
| 🔗 **Dependency Graph** | Hydrating `loginUser` auto-includes `AuthError`, `generateSession` types |
| 🔌 **MCP Native** | Plug-and-play with Claude Desktop, zero config |
| 👻 **Ghost Mode** | VS Code extension fades out condensed code so you see what the AI sees |
| 🚫 **Smart Ignores** | Respects `.lvmignore` and `.gitignore` automatically |
| 📊 **Live Savings** | Real-time token counter and dollar-cost dashboard |
| 🌐 **Multi-Language** | TypeScript, JavaScript (Python/Go/Rust via community adapters) |
| ⚡ **Zero Config** | Run `npx lvm scan` — no setup, no database, no Docker |

---

## 🏗️ Project Architecture (Monorepo)

    Managed via pnpm workspaces for high-performance development:

    @context-condenser/core: The engine. Handles Tree-Sitter parsing, Symbol Graphs, and dependency resolution.

    @context-condenser/cli: The terminal interface (lvm command).

    @context-condenser/mcp-server: The Stdio bridge for Claude Desktop.

    context-condenser-vscode: (WIP) "Ghost Mode" extension to visualize what the LLM sees.

## 🚀 Installation & Setup

1. Prerequisites

Ensure you have pnpm installed.

2. Build the Workspace

From the root directory:

```
pnpm install
pnpm build
```

3. Link the CLI

To use the lvm command from any directory:

```
pnpm setup
# RESTART YOUR TERMINAL
cd packages/cli
pnpm link --global

```

4. Verify Setup

Run a scan on your own project:

```
lvm scan .

```

🔌 Connecting to Claude Desktop (MCP)
1. Build the MCP Server

```
cd packages/mcp-server
pnpm build

```

2. Configure Claude

    Add the following to your claude_desktop_config.json:

    Linux: ~/.config/Claude/claude_desktop_config.json

    macOS: ~/Library/Application Support/Claude/claude_desktop_config.json

```
{
  "mcpServers": {
    "context-condenser": {
      "command": "node",
      "args": ["/home/YOUR_USER/context-condenser/packages/mcp-server/dist/index.js"],
      "env": {
        "LVM_ROOT": "/home/YOUR_USER/your-target-project"
      }
    }
  }
}

```
3. Usage in Claude

Once restarted, Claude will have access to:

    get_skeleton: Explore file structures without burning tokens.

    hydrate_context: Automatically expand specific @LVM-ID tags into full code.

    efficiency_report: See your real-time savings.

## 🛠️ Developer FAQ
Why did my build fail with SyntaxError?

Ensure you are not manually adding #!/usr/bin/env node to src/index.ts. The build process uses tsup.config.ts to inject this shebang safely into the dist folder to avoid ESM parsing errors.
How do I ignore files?

LVM respects your .gitignore by default. You can create a .lvmignore in your project root for LVM-specific exclusions (like large test fixtures or documentation).
Adding a new language?

Language support is driven by Tree-Sitter grammars in packages/core/src/parser/tree-sitter-logic.ts. We currently support TypeScript and JavaScript (ESM/CJS).


### 3. Install the VS Code Extension

```
ext install context-condenser.lvm
```

Your editor will start **fading out** function bodies that are currently condensed in the LLM's view — "Ghost Mode."

---

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Your Files          LVM Engine              Claude / Gemini   │
│                                                                 │
│  auth.ts ──────►  AST Parser ──────►  Skeleton ──────────────► │
│  db.ts   ──────►  (tree-sitter)       fn:loginUser [condensed]  │
│  types.ts ─────►  Dep. Graph          fn:getUser   [condensed]  │
│                                                                 │
│                        ▲                    │                   │
│                        │    hydrate_context │                   │
│                        │    (fn_loginUser)  │                   │
│                        └────────────────────┘                   │
│                                                                 │
│              Only the relevant code flows to the LLM.           │
└─────────────────────────────────────────────────────────────────┘
```

### The Data Flow

1. **Index** — On project load, LVM parses every file with tree-sitter and builds a Symbol Graph
2. **Condense** — Your files are represented as Skeletons: signatures + `@LVM-ID` tags
3. **Intercept** — You paste a Skeleton into Claude, or the MCP server delivers it automatically
4. **Lazy Hydrate** — The AI calls `hydrate_context(["fn_loginUser_42"])` for what it needs
5. **Re-index** — Every file save triggers an incremental index update (< 50ms)

### The Dependency Graph

When you hydrate `loginUser`, LVM doesn't just give you that function. It traces the dependency graph and surfaces the required types and utilities automatically:

```
loginUser
  ├── Credentials (interface) ← auto-hydrated
  ├── AuthError (class)       ← auto-hydrated
  └── generateSession (fn)    ← signature included
```

No more "I can't find the type definition" hallucinations.

---

## 📁 Project Structure

```
context-condenser/
├── packages/
│   ├── core/              # AST engine, symbol graph, resolver
│   │   ├── src/
│   │   │   ├── parser/    # tree-sitter bindings (single-pass O(n))
│   │   │   ├── indexer/   # SymbolGraph + SymbolResolver
│   │   │   ├── utils/     # IgnoreManager, token counter
│   │   │   └── condenser.ts  # The main engine class
│   ├── cli/               # `lvm scan` | `lvm serve` | `lvm init`
│   ├── mcp-server/        # MCP bridge for Claude/Gemini
│   └── vscode-ext/        # Ghost Mode VS Code extension
├── .lvmignore             # What to skip (gitignore syntax)
└── lvm.config.json        # Optional global config
```

---

## 🛠️ Configuration

### `.lvmignore`

```gitignore
# Documentation
docs/
*.md

# Build artifacts
dist/
coverage/

# Large data files
*.json
*.csv
```

### `lvm.config.json`

```json
{
  "depth": 1,
  "maxTokenBudget": 32000,
  "preserveComments": false,
  "model": "claude"
}
```

### VS Code Settings

```json
{
  "lvm.ghostMode": true,
  "lvm.autoIndex": true
}
```

---

## 📡 MCP Tool Reference

Once connected to Claude Desktop, the AI has access to three tools:

### `hydrate_context`
Expand skeleton(s) into full source code.
```json
{
  "symbolIds": ["src/auth.ts:loginUser:42"],
  "depth": 1
}
```
`depth: 1` automatically includes direct dependencies.

### `get_skeleton`
Get the compressed view of any file.
```json
{ "filePath": "src/auth.ts" }
```

### `efficiency_report`
See current session token savings.
```json
{}
```

---

## 🧪 Running Tests

```bash
pnpm install
pnpm test
```

Tests cover: symbol extraction, import mapping, dependency resolution, skeleton generation, and hydration correctness.

---

## 🗺️ Roadmap

- [x] TypeScript / JavaScript parser
- [x] MCP server (Claude Desktop)
- [x] VS Code Ghost Mode extension
- [x] CLI efficiency report
- [ ] **Python adapter** (help wanted!)
- [ ] **Go adapter** (help wanted!)
- [ ] **Rust adapter** (help wanted!)
- [ ] SQLite persistence for repos > 10k files
- [ ] GitHub Action: block PRs that exceed token budget
- [ ] Neovim plugin
- [ ] JetBrains plugin

---

## 🤝 Contributing

Contributions are welcome! Please run pnpm test before submitting a PR to ensure the dependency graph and symbol resolution logic remains intact. We want Context-Condenser to become the standard context layer for AI-assisted development. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started.

**High-value contributions:**
- Language adapters (Python, Go, Rust, Java) via tree-sitter grammars
- Performance: parallel indexing with worker threads for monorepos > 10k files
- VS Code webview "Hot Map" — heatmap of hydration frequency per file

---

## 📜 License

MIT © Context-Condenser Contributors

---

**If this saved you money, give it a ⭐ — it helps more developers find it.**

[Report a Bug](https://github.com/david-spies/context-condenser/issues) · [Request a Feature](https://github.com/david-spies/context-condenser/issues) · [Join Discord](https://discord.gg/placeholder)


