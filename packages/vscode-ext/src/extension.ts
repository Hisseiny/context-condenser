/**
 * packages/vscode-ext/src/extension.ts
 *
 * VS Code Extension: Context-Condenser "Ghost Mode"
 *
 * Features:
 *  - Real-time index updates on file save
 *  - "Ghost" decoration: fades out condensed function bodies
 *  - Status bar token counter
 *  - Command: Copy Skeleton to clipboard
 *  - Command: Show Efficiency Report
 */

import * as vscode from 'vscode';
import { CondenserEngine } from '@context-condenser/core';

let engine: CondenserEngine;
let statusBarItem: vscode.StatusBarItem;

// Decoration type for "condensed" (ghost) regions
const ghostDecoration = vscode.window.createTextEditorDecorationType({
  opacity: '0.35',
  fontStyle: 'italic',
});

// ─────────────────────────────────────────────────────────────────────────────
// Activate
// ─────────────────────────────────────────────────────────────────────────────
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  engine = new CondenserEngine();

  // Initial index of workspace
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (root) {
    await engine.indexSource(root);
  }

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'lvm.showReport';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Commands ────────────────────────────────────────────────────────────────

  // Copy Skeleton
  const copySkeleton = vscode.commands.registerCommand(
    'lvm.copySkeleton',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      const skeleton = engine.generateSkeleton(editor.document.fileName);
      if (!skeleton) {
        vscode.window.showWarningMessage('No LVM symbols found in this file.');
        return;
      }

      await vscode.env.clipboard.writeText(skeleton);
      const report = engine.getEfficiencyReport();
      vscode.window.showInformationMessage(
        `🧊 Skeleton copied! Saving ~${report.savingsPercent} tokens.`
      );
    }
  );

  // Show Efficiency Report
  const showReport = vscode.commands.registerCommand(
    'lvm.showReport',
    async () => {
      const report = engine.getEfficiencyReport();
      const panel = vscode.window.createWebviewPanel(
        'lvmReport',
        '🧊 LVM Efficiency Report',
        vscode.ViewColumn.Beside,
        {}
      );
      panel.webview.html = buildReportHtml(report);
    }
  );

  // Re-index on save
  const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    const lang = doc.languageId;
    if (!['typescript', 'javascript', 'typescriptreact', 'javascriptreact'].includes(lang)) {
      return;
    }
    await engine.indexFile(doc.fileName);
    updateStatusBar();
    applyGhostDecorations(vscode.window.activeTextEditor);
    vscode.window.setStatusBarMessage('$(sync) LVM index updated', 2000);
  });

  // Decorate on editor change
  const onEditorChange = vscode.window.onDidChangeActiveTextEditor(
    (editor) => {
      if (editor) applyGhostDecorations(editor);
    }
  );

  context.subscriptions.push(
    copySkeleton,
    showReport,
    onSave,
    onEditorChange
  );

  // Initial decoration for current editor
  applyGhostDecorations(vscode.window.activeTextEditor);
}

export function deactivate(): void {
  ghostDecoration.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function updateStatusBar(): void {
  const report = engine.getEfficiencyReport();
  statusBarItem.text = `$(archive) LVM ${report.savingsPercent} saved`;
  statusBarItem.tooltip = `Raw: ${report.rawTokens.toLocaleString()} tokens → LVM: ${report.condensedTokens.toLocaleString()} tokens`;
}

/**
 * Apply "ghost" opacity to function bodies that are currently condensed.
 * This gives developers confidence in what the AI actually "sees."
 */
function applyGhostDecorations(
  editor: vscode.TextEditor | undefined
): void {
  if (!editor) return;

  const filePath = editor.document.fileName;
  const symbols = engine['graph']?.getFileSymbols(filePath) ?? [];

  const ranges = symbols
    .filter((s) => s.type === 'function' || s.type === 'class')
    .map((s) => {
      // Dim the body (everything after the opening brace)
      const start = new vscode.Position(s.startLine + 1, 0);
      const end = new vscode.Position(s.endLine, 0);
      return new vscode.Range(start, end);
    });

  editor.setDecorations(ghostDecoration, ranges);
}

function buildReportHtml(report: ReturnType<CondenserEngine['getEfficiencyReport']>): string {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
    .metric { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--vscode-panel-border); }
    .label { color: var(--vscode-descriptionForeground); }
    .value { font-weight: bold; }
    .savings { color: #4caf50; font-size: 1.4em; }
    h2 { color: #4dd0e1; }
  </style>
</head>
<body>
  <h2>🧊 LVM Efficiency Report</h2>
  <div class="metric"><span class="label">Raw tokens</span><span class="value">${report.rawTokens.toLocaleString()}</span></div>
  <div class="metric"><span class="label">Condensed tokens</span><span class="value">${report.condensedTokens.toLocaleString()}</span></div>
  <div class="metric"><span class="label">Token savings</span><span class="value savings">${report.savingsPercent}</span></div>
  <div class="metric"><span class="label">Estimated cost (raw)</span><span class="value">${report.estimatedCostRaw}</span></div>
  <div class="metric"><span class="label">Estimated cost (LVM)</span><span class="value" style="color:#4caf50">${report.estimatedCostLVM}</span></div>
</body>
</html>`;
}
