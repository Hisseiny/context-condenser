---
name: Language adapter request
about: Request support for a new programming language
title: "[LANG] Add <language> support"
labels: language-adapter, help wanted
---

**Language**
Which language should be supported? (e.g. Python, Go, Rust)

**tree-sitter grammar**
Link to the grammar package: https://github.com/tree-sitter/tree-sitter-<lang>

**Node types to map**
List the AST node types that correspond to definitions and call sites:

| LVM SymbolType | tree-sitter node type |
|---|---|
| `function` | `function_definition` |
| `class` | `class_definition` |
| `interface` | n/a (or equivalent) |

**Are you willing to implement this?**
- [ ] Yes, I'll submit a PR
- [ ] No, just requesting
