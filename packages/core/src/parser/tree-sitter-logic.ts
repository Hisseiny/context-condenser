/**
 * packages/core/src/parser/tree-sitter-logic.ts
 *
 * Single-pass AST traversal using tree-sitter.
 * Extracts: function/class/interface definitions, import maps,
 * call-site dependencies, and type references — all in O(n) time.
 */

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { CodeSymbol, ScanResult, SymbolType } from '../types';

// ---------------------------------------------------------------------------
// Singleton parser — avoid re-initialization per file
// ---------------------------------------------------------------------------
const parser = new Parser();
(parser as any).setLanguage((TypeScript as any).typescript);

// Token estimation: ~4 chars per token (rough GPT/Claude average)
const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

// ---------------------------------------------------------------------------
// Node type matchers
// ---------------------------------------------------------------------------
const DEFINITION_TYPES = new Set([
  'function_declaration',
  'function_expression',
  'method_definition',
  'arrow_function',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
]);

function nodeToSymbolType(nodeType: string): SymbolType {
  if (nodeType.includes('class')) return 'class';
  if (nodeType.includes('interface')) return 'interface';
  if (nodeType.includes('type_alias')) return 'type_alias';
  return 'function';
}

// ---------------------------------------------------------------------------
// Import extraction helpers
// ---------------------------------------------------------------------------
function extractImports(
  node: Parser.SyntaxNode,
  fileImports: Map<string, string>
): void {
  // In Tree-Sitter TS, the source is usually the string at the end of the declaration
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return;

  const source = sourceNode.text.replace(/['"]/g, '');
  
  // Find the import clause (the part between 'import' and 'from')
  const clause = node.children.find(c => c.type === 'import_clause');
  if (!clause) return;

  // 1. Named Imports: import { a, b as c }
  const namedImports = clause.descendantsOfType('import_specifier');
  namedImports.forEach((spec) => {
    // Check for 'alias' field (the 'c' in 'b as c') or 'name' field (the 'a')
    const localName = spec.childForFieldName('alias')?.text || spec.childForFieldName('name')?.text;
    if (localName) {
      fileImports.set(localName, source);
    }
  });

  // 2. Default Import: import DefaultMember from '...'
  // The first child of a clause is often the identifier if it's a default import
  const firstChild = clause.child(0);
  if (firstChild?.type === 'identifier') {
    fileImports.set(firstChild.text, source);
  }

  // 3. Namespace Import: import * as NS from '...'
  const nsImport = clause.descendantsOfType('namespace_import')[0];
  if (nsImport) {
    const nsIdentifier = nsImport.children.find(c => c.type === 'identifier');
    if (nsIdentifier) {
      fileImports.set(nsIdentifier.text, source);
    }
  }
}

// ---------------------------------------------------------------------------
// Main extraction function
// ---------------------------------------------------------------------------
export function extractSymbols(
  sourceCode: string,
  filePath: string
): ScanResult {
  const tree = (parser as any).parse(sourceCode);
  const symbols: CodeSymbol[] = [];
  const fileImports = new Map<string, string>();

  // Lexical scope stack — lets us attribute calls/types to their parent
  const contextStack: CodeSymbol[] = [];

  const traverse = (node: Parser.SyntaxNode): void => {
    let currentSymbol: CodeSymbol | null = null;

    // 1. Imports
    if (node.type === 'import_statement' || node.type === 'import_declaration') {
      extractImports(node, fileImports);
    }

    // 2. Definitions
    if (DEFINITION_TYPES.has(node.type)) {
      const nameNode =
        node.childForFieldName('name') ??
        node.parent?.childForFieldName('name');

      const name = nameNode?.text ?? `anon_${node.startIndex}`;
      const bodyNode = node.childForFieldName('body');
      
      // Signature is everything from start to just before the body starts
      const signature = sourceCode
        .substring(node.startIndex, bodyNode?.startIndex ?? node.endIndex)
        .trim();

      currentSymbol = {
        id: `${filePath}:${name}:${node.startIndex}`,
        name,
        type: nodeToSymbolType(node.type),
        filePath,
        startLine: node.startPosition.row,
        endLine: node.endPosition.row,
        signature,
        fullBody: node.text,
        dependencies: [],
        tokenCount: estimateTokens(node.text),
      };

      symbols.push(currentSymbol);
      contextStack.push(currentSymbol);
    }

    // 3. Dependencies
    const activeParent = contextStack[contextStack.length - 1];
    if (activeParent) {
      // Avoid a symbol depending on itself during its own definition
      const isNotSelf = !currentSymbol || activeParent.id !== currentSymbol.id;
      
      if (isNotSelf) {
        // Function/Method calls
        if (node.type === 'call_expression') {
          const fnNode = node.childForFieldName('function');
          // Split on '.' to handle 'db.users.find' -> 'db'
          const baseName = fnNode?.text?.split('.')[0];
          if (baseName && !activeParent.dependencies.includes(baseName)) {
            activeParent.dependencies.push(baseName);
          }
        }

        // Type references
        if (node.type === 'type_identifier') {
          const typeName = node.text;
          if (typeName && !activeParent.dependencies.includes(typeName)) {
            activeParent.dependencies.push(typeName);
          }
        }
      }
    }

    // 4. Recurse
    for (let i = 0; i < node.childCount; i++) {
      traverse(node.child(i)!);
    }

    if (currentSymbol) contextStack.pop();
  };

  traverse(tree.rootNode);

  return { symbols, imports: fileImports };
}
