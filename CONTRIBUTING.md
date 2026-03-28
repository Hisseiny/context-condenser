# Contributing to Context-Condenser 🧊

We're building the standard context layer for AI-assisted development. Every contribution — bug fix, language adapter, docs improvement — directly helps thousands of developers cut their LLM costs.

---

## Before You Start

- Read [ARCHITECTURE.md](ARCHITECTURE.md) — it explains *why* the code is structured this way, not just how.
- Check [open issues](https://github.com/david-spies/context-condenser/issues) to avoid duplicate work.
- For large features, open a discussion issue first so we can align before you invest significant time.

---

## Development Setup

**Requirements:** Node.js 18+, pnpm 8+

```bash
git clone https://github.com/david-spies/context-condenser
cd context-condenser
pnpm install
pnpm build
pnpm test
```

To run a specific package in dev (watch) mode:

```bash
cd packages/core
pnpm dev
```

To test the CLI against your own project:

```bash
cd packages/cli
pnpm build
node dist/index.js scan /path/to/your/project
```

---

## Project Structure

```
packages/
  core/         ← Pure logic, zero side effects, fully unit-tested
  cli/          ← Thin shell over core + display formatting
  mcp-server/   ← MCP protocol adapter
  vscode-ext/   ← VS Code API glue
```

Changes to `core` flow into all other packages — tests are mandatory there. Changes to `cli` or `vscode-ext` don't require `core` tests but need their own.

---

## High-Value Contributions

These are the things that will have the most impact on the project's adoption:

### 🌐 Language Adapters

We support TypeScript/JavaScript. The community needs:

| Language | tree-sitter grammar | Status |
|---|---|---|
| Python | `tree-sitter-python` | **Help wanted** |
| Go | `tree-sitter-go` | **Help wanted** |
| Rust | `tree-sitter-rust` | **Help wanted** |
| Java | `tree-sitter-java` | **Help wanted** |
| Ruby | `tree-sitter-ruby` | **Help wanted** |

**To add a language:**

1. Install the grammar: `pnpm add tree-sitter-<lang> -w`
2. Create `packages/core/src/parser/<lang>.ts`
3. Mirror the structure of `tree-sitter-logic.ts`, mapping language-specific node types to `SymbolType`
4. Add the file extension to `IgnoreManager.PARSEABLE_EXTENSIONS`
5. Add a dispatch case in `CondenserEngine.indexFile`
6. Write tests in `packages/core/src/parser/__tests__/<lang>.test.ts`

### ⚡ SQLite Persistence

For repos with > 10,000 files, holding everything in memory isn't ideal. We need a `PersistentCondenserEngine` that writes the symbol graph to SQLite (using `better-sqlite3`) and loads it incrementally.

Interface to implement: `ICondenserEngine` in `packages/core/src/types.ts`.

### 🗺️ VS Code Hot Map

A Webview panel that shows a heatmap of your project files — deep red = frequently hydrated (full logic sent to AI), cold blue = mostly skeletonized. This is the most viral feature on our roadmap.

---

## Code Standards

### TypeScript

- Strict mode enabled (`"strict": true` in tsconfig)
- No `any` types — use `unknown` and narrow
- All public methods on classes must have JSDoc comments
- Prefer `const` over `let`, avoid `var`

### Testing

We use Vitest. Tests live in `__tests__/` directories next to the code they test.

```bash
pnpm test              # run all tests
pnpm test --watch      # watch mode
pnpm test packages/core  # single package
```

**What needs tests:**
- All `core` logic — parser, graph, resolver, condenser
- Edge cases: anonymous functions, nested classes, aliased imports, circular-looking dependency strings

**What doesn't need tests:**
- CLI display formatting (chalk output)
- VS Code extension glue code

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add Python language adapter
fix(cli): handle empty directories without crashing
docs: add Go adapter guide to CONTRIBUTING
perf(parser): cache tree-sitter grammar instances
```

---

## Pull Request Process

1. Fork the repo and create a branch: `git checkout -b feat/python-adapter`
2. Make your changes with tests
3. Run `pnpm test` and `pnpm lint` — both must pass
4. Open a PR with a clear description of what changed and why
5. Reference any related issues: `Closes #42`

PR titles should follow Conventional Commits format.

---

## Issue Labels

| Label | Meaning |
|---|---|
| `good first issue` | Small, well-scoped, great for new contributors |
| `help wanted` | We want community input — larger scope |
| `language-adapter` | Adding a new tree-sitter language |
| `performance` | Speed or memory improvements |
| `hallucination-reduction` | Features that improve AI accuracy |

---

## Code of Conduct

Be kind. We are building the future of human-AI collaboration.

Constructive criticism of ideas is always welcome. Personal attacks are not. Maintainers reserve the right to remove comments and ban users who repeatedly violate this.

---

## Recognition

Significant contributors get:
- Listed in `CONTRIBUTORS.md`
- A shout-out in release notes
- The `contributor` role in our Discord

We ship fast. Your PR can be merged and released within 48 hours.

---

*Questions? Open a [discussion](https://github.com/david-spies/context-condenser/discussions) or join our [Discord](https://discord.gg/placeholder).*
