# 🧊 Context-Condenser — Quickstart Guide

> Get from zero to a working LVM setup in under 10 minutes.

---

## Table of Contents

- [What You're Building](#what-youre-building)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Step 1 — Run Your First Scan](#step-1--run-your-first-scan)
- [Step 2 — Link the CLI Globally](#step-2--link-the-cli-globally)
- [Step 3 — Initialize Ignore Rules](#step-3--initialize-ignore-rules)
- [Step 4 — Connect to Claude Desktop (MCP)](#step-4--connect-to-claude-desktop-mcp)
- [Step 5 — Install the VS Code Extension](#step-5--install-the-vs-code-extension)
- [How Skeletons and Hydration Work](#how-skeletons-and-hydration-work)
- [MCP Tool Reference](#mcp-tool-reference)
- [Configuration Reference](#configuration-reference)
- [Developer FAQ](#developer-faq)
- [Common Issues](#common-issues)

---

## What You're Building

Context-Condenser is a **monorepo of four packages** that work together:

```
@context-condenser/core        — Tree-Sitter parsing, Symbol Graph, dependency resolution
@context-condenser/cli         — The lvm terminal command
@context-condenser/mcp-server  — Stdio bridge for Claude Desktop
context-condenser-vscode       — (WIP) Ghost Mode VS Code extension
```

All four are managed via **pnpm workspaces**. You build once from the root and every package is ready.

---

## Prerequisites

| Requirement | Version | How to check |
|---|---|---|
| Node.js | >= 18.0.0 | `node --version` |
| pnpm | >= 8.0.0 | `pnpm --version` |
| Git | any | `git --version` |

**Install pnpm if missing:**
```bash
sudo npm install -g pnpm
# Verify
pnpm --version
```

**Install Node.js 20 if below v18:**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

**Native build tools** — required for tree-sitter's C bindings:
```bash
# Ubuntu / Debian
sudo apt install -y build-essential python3

# macOS
xcode-select --install

# Windows (run as Administrator)
npm install -g windows-build-tools
```

> ⚠️ Do **not** activate a Python virtual environment before running `pnpm install`. This is a pure Node.js project — `venv` is not needed and will cause confusion.

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/david-spies/context-condenser.git
cd context-condenser

# 2. Install all workspace dependencies
pnpm install
```

During install you will see a warning about build scripts being ignored:

```
╭ Warning ──────────────────────────────────────────╮
│  Ignored build scripts: esbuild, tree-sitter,     │
│  tree-sitter-typescript.                          │
│  Run "pnpm approve-builds" to pick which          │
│  dependencies should be allowed to run scripts.   │
╰───────────────────────────────────────────────────╯
```

**Approve the native builds** — this is required for tree-sitter to compile its C parser:

```bash
pnpm approve-builds
# Press 'a' to select all, then Enter, then type 'y' and Enter to confirm
```

You should see each package compile successfully:
```
node_modules/.pnpm/esbuild@...:            Running postinstall script, done
node_modules/.pnpm/tree-sitter@...:        Running install script, done
node_modules/.pnpm/tree-sitter-typescript: Running install script, done
```

> If `approve-builds` says "There are no packages awaiting approval", the scripts were already approved in a prior install. Skip this step.

**Build all four packages:**
```bash
pnpm build
```

A successful build looks like this:
```
@context-condenser/core:build:       CJS dist/index.js      16.42 KB  ✓
@context-condenser/core:build:       ESM dist/index.mjs     14.09 KB  ✓
@context-condenser/core:build:       DTS dist/index.d.ts     6.93 KB  ✓
@context-condenser/mcp-server:build: ESM dist/index.js       5.76 KB  ✓
@context-condenser/cli:build:        ESM dist/index.js       5.87 KB  ✓
context-condenser-vscode:build:      CJS dist/extension.js 330.90 KB  ✓

Tasks: 4 successful, 4 total
```

**Make the CLI executable:**
```bash
chmod +x packages/cli/dist/index.js
```

---

## Step 1 — Run Your First Scan

Navigate to any TypeScript or JavaScript project and scan it:

```bash
cd ~/my-project
/path/to/context-condenser/packages/cli/dist/index.js scan .
Example - a project folder you would like to scan in your directory is 1 folder in from your home directory you would simply type in '..' preceding the path to the context-condenser. 
../context-condenser/packages/cli/dist/index.js scan .
```

**Expected output:**
```
 ┌──────────────────────────────────────────────────────────┐
 │  🧊 CONTEXT-CONDENSER  v0.1.0                            │
 ├──────────────────────────────────────────────────────────┤
 │  Symbols indexed: 220         Project: my-project        │
 ├──────────────────────────────────────────────────────────┤
 │  Raw:  ██████████████████████████████    18,308 tokens   │
 │  LVM:  ██████████████░░░░░░░░░░░░░░░░     8,794 tokens   │
 ├──────────────────────────────────────────────────────────┤
 │  Efficiency gain:  52.0%    Cost: $0.0549 → $0.0264      │
 └──────────────────────────────────────────────────────────┘

  Run lvm serve to connect this to Claude Desktop via MCP.
```

> **Tip:** Screenshot your savings report and share it. That's the fastest way to show other developers the value. 📸

**For CI pipelines**, output as JSON:
```bash
./packages/cli/dist/index.js scan . --json
Note - if working from the directory folder you just scanned and resides parallel to your contextd-condenser folder - simply type in '..' preceding the path.
Example -
../context-condenser/packages/cli/dist/index.js scan . --json
# {"rawTokens":18308,"condensedTokens":8794,"savingsPercent":"52.0%",...}
```

---

## Step 2 — Link the CLI Globally

Linking makes the `lvm` command available from any directory on your system.

```bash
# Set up pnpm's global bin directory
pnpm setup

# !! RESTART YOUR TERMINAL before continuing !!

# Link the CLI globally
cd packages/cli
pnpm link --global
cd ../..
```

**Verify it works:**
```bash
lvm --version
# 0.1.0

lvm scan ~/my-project
```

> **If `lvm` is still not found** after restarting the terminal, pnpm's global bin directory may not be on your PATH:
> ```bash
> # Find where pnpm puts global bins
> pnpm bin --global
> # Add that path to ~/.bashrc or ~/.zshrc:
> export PATH="/home/YOUR_USER/.local/share/pnpm:$PATH"
> # Then restart your terminal again
> ```

---

## Step 3 — Initialize Ignore Rules

Create a `.lvmignore` in your target project to control what the engine skips. Without this, large JSON files or test fixtures will inflate your token count and produce a misleading savings report.

```bash
cd ~/my-project
lvm init
```

This creates a `.lvmignore` with sensible defaults:

```gitignore
# Documentation
docs/
*.md
LICENSE

# Large generated / binary files
*.json
*.csv
*.log
*.lock

# Test fixtures
__snapshots__/
fixtures/

# Vendor / third-party
vendor/
```

Edit it to match your project. The syntax is **identical to `.gitignore`**.

> **Always ignored** (hard-coded, no config needed):
> `node_modules/`, `dist/`, `build/`, `.git/`, `*.min.js`, `*.map`, `*.d.ts`
>
> **Also auto-loaded:** LVM reads your existing `.gitignore` — you don't need to duplicate those rules in `.lvmignore`.

---

## Step 4 — Connect to Claude Desktop (MCP)

> **Requires Claude Pro ($20/mo) or Team plan.** MCP server connections are not available on the free plan.
> See [Free Tier Alternatives](#free-tier-alternatives) if you're on the free plan.

### Build the MCP Server

The MCP server is built when you run `pnpm build` from the root. Verify it exists:

```bash
ls packages/mcp-server/dist/index.js
# Should print the path — if missing, run: pnpm build
chmod +x packages/mcp-server/dist/index.js
```

### Configure Claude Desktop

Find your config file:

| OS | Config path |
|---|---|
| Linux | `~/.config/Claude/claude_desktop_config.json` |
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |

Add the `mcpServers` block — replace `YOUR_USER` and `your-target-project` with your real paths:

```json
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

> ⚠️ Paths must be **absolute**. Claude Desktop spawns the process in a clean environment and won't expand `~/` or `$HOME`.

**Fully quit and reopen Claude Desktop** (don't just reload the window).

Confirm the connection by clicking the 🔌 tools icon in the chat bar — you should see `context-condenser` listed with three tools.

**Test it:**
```
Use get_skeleton to show me the structure of src/index.ts
```

Claude will call the tool and return the condensed skeleton view of your file without reading the full body.

---

### Free Tier Alternatives

**Option A — Continue.dev (Free, full MCP in VS Code)**

```bash
code --install-extension Continue.continue
```

Open Continue's config (`Ctrl+Shift+P` → `Continue: Open config.json`) and add:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["/home/YOUR_USER/context-condenser/packages/mcp-server/dist/index.js"],
          "env": { "LVM_ROOT": "/home/YOUR_USER/your-project" }
        }
      }
    ]
  }
}
```

Reload VS Code — all three tools appear in the Continue chat panel automatically.

**Option B — Manual Skeleton Copy (Claude.ai free, ChatGPT, Gemini, any chat AI)**

In VS Code, open any `.ts` or `.js` file, then:
```
Ctrl+Shift+P → "LVM: Copy Skeleton to Clipboard"
```

Paste the skeleton into your AI chat with this preamble:
```
I'm using Context-Condenser LVM. Code marked [Body Condensed] is compressed.
If you need the full body of any function, ask me for its @LVM-ID and I'll paste it.
Never guess the logic inside a condensed block.

[PASTE SKELETON HERE]

My question: ...
```

---

## Step 5 — Install the VS Code Extension

The extension enables **Ghost Mode** — condensed function bodies are faded to 35% opacity in the editor so you always see exactly what the AI can and cannot read.

```bash
cd packages/vscode-ext

# Install vsce packaging tool if needed
npm install -g @vscode/vsce

# Package the extension into a .vsix
vsce package --no-dependencies

# Install into VS Code
code --install-extension context-condenser-vscode-0.1.0.vsix

cd ../..
```

**What you get after installing:**

| Feature | Description |
|---|---|
| 👻 Ghost Mode | Fades condensed function bodies to 35% opacity |
| 📊 Status bar | Shows `LVM 52.0% saved` — click for full report panel |
| 🔄 Auto-index | Re-indexes any file on save (< 50ms, incremental) |

**Commands** (`Ctrl+Shift+P`):
- `LVM: Copy Skeleton to Clipboard`
- `LVM: Show Efficiency Report`

**VS Code settings** (`settings.json`):
```json
{
  "lvm.ghostMode": true,
  "lvm.autoIndex": true
}
```

---

## How Skeletons and Hydration Work

### The five-step loop

1. **Index** — LVM parses every file with tree-sitter and builds a Symbol DAG (functions, classes, interfaces as nodes; calls and type refs as edges)
2. **Condense** — Files become Skeletons: function signatures + `@LVM-ID` tags; bodies replaced with `/* [Body Condensed] */`
3. **Deliver** — The MCP server sends the skeleton to Claude automatically, or you paste it manually
4. **Lazy Hydrate** — Claude calls `hydrate_context(["src/auth.ts:loginUser:42"])` only for what it needs
5. **Re-index** — Every file save triggers an incremental update for that single file only

### Automatic dependency surfacing

When Claude hydrates `loginUser`, LVM traces the dependency graph and surfaces required types without a second request:

```
loginUser
  ├── Credentials (interface) ← auto-hydrated at depth: 1
  ├── AuthError (class)       ← auto-hydrated at depth: 1
  └── generateSession (fn)    ← signature included
```

Set `depth: 0` for targeted single-function edits. Set `depth: 1` (default) when the AI needs to understand the full call signature.

### Skeleton format reference

```typescript
/* @LVM-ID: src/auth.ts:loginUser:42 */
export async function loginUser(creds: Credentials): Promise<User> { /* [Body Condensed] */ }
```

| Part | Meaning |
|---|---|
| `@LVM-ID` | Unique identifier used in hydration requests |
| `src/auth.ts` | Source file path |
| `loginUser` | Function or class name |
| `42` | Character offset — stable even when lines above the function change |
| `/* [Body Condensed] */` | Placeholder; full body is stored locally, never sent unless hydrated |

---

## MCP Tool Reference

### `get_skeleton`
Returns the condensed structure of a file. Use this first to understand a file before making changes.
```json
{ "filePath": "src/auth.ts" }
```

### `hydrate_context`
Expands `@LVM-ID` skeletons into full source code.
```json
{
  "symbolIds": ["src/auth.ts:loginUser:42"],
  "depth": 1
}
```
- `depth: 0` — target symbol only
- `depth: 1` — target + direct dependencies (types, called functions)

### `efficiency_report`
Returns token savings and estimated cost reduction for the current session.
```json
{}
```

---

## Configuration Reference

### `lvm.config.json` (project root)

```json
{
  "depth": 1,
  "maxTokenBudget": 32000,
  "preserveComments": false,
  "model": "claude",
  "languages": ["typescript", "javascript"],
  "ghostMode": true
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `depth` | number | `1` | Dependency hops on hydration |
| `maxTokenBudget` | number | `32000` | Hard token cap per LLM call |
| `preserveComments` | boolean | `false` | Include JSDoc in skeletons |
| `model` | string | `"claude"` | Cost model: `claude` or `gpt4` |
| `languages` | array | `["typescript","javascript"]` | Languages to index |
| `ghostMode` | boolean | `true` | Enable VS Code ghost decorations |

### `.lvmignore` (project root)

```gitignore
docs/
coverage/
fixtures/
*.json
*.csv
*.generated.ts
src/legacy/old-api.ts
```

---

## Developer FAQ

**Why did my build fail with `SyntaxError: Invalid or unexpected token`?**

Don't invoke the built file with `node` directly. The shebang line is only valid when the OS runs the file as an executable:
```bash
chmod +x packages/cli/dist/index.js
./packages/cli/dist/index.js scan .
```
After `pnpm link --global`, use `lvm scan .` instead.

**Why can't I use `npm install`?**

The workspace uses pnpm's `workspace:*` protocol to link internal packages. Plain `npm` doesn't understand this protocol. Always use `pnpm install`.

**Why did `pnpm clean` delete `node_modules` and break the build?**

The original `clean` script included `rm -rf node_modules`, which removes turbo itself. The next `pnpm build` then fails with `turbo: not found`. The updated script only removes `dist/` folders. Use `pnpm clean:hard` only when you explicitly need a full reinstall.

**How do I add a new language?**

Language support is driven by tree-sitter grammars in `packages/core/src/parser/tree-sitter-logic.ts`. The current parser handles TypeScript and JavaScript (ESM/CJS). To add Python, Go, or Rust:
1. `pnpm add tree-sitter-python -w`
2. Create `packages/core/src/parser/python.ts` mirroring the existing parser
3. Map language node types (`def`, `class`, `import_from`) to `SymbolType`
4. Register the extension in `IgnoreManager.PARSEABLE_EXTENSIONS`
5. Add a dispatch in `CondenserEngine.indexFile` based on file extension

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full walkthrough.

**How do I ignore files?**

LVM reads your `.gitignore` automatically. For LVM-specific exclusions run `lvm init` to scaffold a `.lvmignore`. The syntax is identical to `.gitignore`.

---

## Common Issues

**`pnpm: command not found`**
```bash
sudo npm install -g pnpm
# Restart your terminal
```

**`tree-sitter` fails to compile**
```bash
sudo apt install -y build-essential python3   # Ubuntu
xcode-select --install                        # macOS
pnpm install && pnpm approve-builds
```

**MCP server not appearing in Claude Desktop**
- Use absolute paths in `claude_desktop_config.json` — no `~/` shorthand
- Verify the dist file exists: `ls packages/mcp-server/dist/index.js`
- Fully quit and reopen Claude Desktop
- Verify you are on Claude Pro or Team — MCP is not available on the free plan
- Check logs: `~/.config/Claude/logs/` (Linux) · `~/Library/Logs/Claude/` (macOS)

**`lvm` not found after `pnpm link --global`**
```bash
pnpm bin --global   # shows the global bin path
# Add to ~/.bashrc or ~/.zshrc:
export PATH="/home/YOUR_USER/.local/share/pnpm:$PATH"
# Restart terminal
```

**Ghost Mode not fading code in VS Code**
- Confirm the `.vsix` installed: Extensions panel → search `Context Condenser`
- Run `lvm scan .` first — Ghost Mode only decorates indexed symbols
- Confirm `"lvm.ghostMode": true` in VS Code settings

**Scan shows 0 symbols for a file**

Supported extensions: `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs`
Excluded by default: `.min.js` `.d.ts` and anything matched by `.lvmignore` or `.gitignore`

---

## Next Steps

- ⭐ [Star the repo](https://github.com/david-spies/context-condenser) — helps other developers find it
- 📖 [Read ARCHITECTURE.md](ARCHITECTURE.md) — understand the Symbol DAG and BFS hydration in depth
- 🤝 [Read CONTRIBUTING.md](CONTRIBUTING.md) — especially if you want to add Python, Go, or Rust support
- 🐛 [Open an issue](https://github.com/david-spies/context-condenser/issues) if something doesn't work

---

<div align="center">

*Built to make AI-assisted development 90% cheaper and 10x more accurate.*

</div>
