/**
 * packages/cli/src/index.ts
 *
 * lvm scan   — show token savings for the current project
 * lvm serve  — start the MCP server
 * lvm init   — scaffold a .lvmignore in the current directory
 */
 
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { CondenserEngine } from '@context-condenser/core';
 
const VERSION = '0.1.0';
 
// ─────────────────────────────────────────────────────────────────────────────
// Box-drawing helpers
// The core problem: chalk wraps strings in ANSI escape codes which have no
// visible width. padEnd/padStart count them as characters, breaking alignment.
// Solution: strip ANSI codes to measure visible length, then pad accordingly.
// ─────────────────────────────────────────────────────────────────────────────
 
// Strips ANSI escape sequences to get the true printable character count
const visibleLen = (s: string): number =>
  s.replace(/\x1B\[[0-9;]*m/g, '').replace(/\u{1F}/gu, '').length;
 
// Pad a (possibly chalk-colored) string to a target visible width
const padRight = (s: string, targetLen: number): string => {
  const pad = targetLen - visibleLen(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
};
 
// The inner content width (between the two │ borders), excluding the borders
const BOX_INNER = 58; // ┌ + 58 chars + ┐ = 60 total
 
// Wrap a pre-built inner string in │ borders, right-padding to exact width
const row = (content: string): string =>
  chalk.bold.cyan('│') +
  padRight(content, BOX_INNER) +
  chalk.bold.cyan('│');
 
const divider = (l: string, r: string): string =>
  chalk.bold.cyan(l + '─'.repeat(BOX_INNER) + r);
 
// ─────────────────────────────────────────────────────────────────────────────
 
const program = new Command();
 
program
  .name('lvm')
  .description('🧊 Context-Condenser — slash your LLM token costs by up to 90%')
  .version(VERSION);
 
// ─────────────────────────────────────────────
// lvm scan [dir]
// ─────────────────────────────────────────────
program
  .command('scan')
  .description('Scan a project and show token efficiency report')
  .argument('[dir]', 'directory to scan', '.')
  .option('--model <model>', 'cost model: claude | gpt4', 'claude')
  .option('--json', 'output as JSON (for CI pipelines)')
  .action(async (dir: string, opts: { model: string; json: boolean }) => {
    const absoluteDir = path.resolve(process.cwd(), dir);
    const spinner = ora({ text: chalk.cyan('Indexing project…'), color: 'cyan' }).start();
 
    const engine = new CondenserEngine();
 
    try {
      await engine.indexSource(absoluteDir);
      spinner.stop();
    } catch (err) {
      spinner.fail(chalk.red('Indexing failed'));
      console.error(err);
      process.exit(1);
    }
 
    const report = engine.getEfficiencyReport();
    const symbols = engine.totalSymbols();
 
    if (opts.json) {
      console.log(JSON.stringify({ ...report, symbols }, null, 2));
      return;
    }
 
    // ── Bar chart ──────────────────────────────────────────────────────────
    const BAR_WIDTH = 28;
    const bar = (n: number, max: number): string => {
      const filled = max > 0 ? Math.round((n / max) * BAR_WIDTH) : 0;
      const empty = BAR_WIDTH - filled;
      return chalk.cyan('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    };
 
    const maxTokens = report.rawTokens;
 
    // ── Token label: right-aligned 9-char number + " tokens" ───────────────
    const tokenLabel = (n: number, color: (s: string) => string): string =>
      color(n.toLocaleString().padStart(9)) + chalk.white(' tokens');
 
    // ── Savings + cost line ────────────────────────────────────────────────
    const savingsTag  = chalk.bgGreen.black.bold(` ${report.savingsPercent} `);
    const costStr     = chalk.red(report.estimatedCostRaw) +
                        chalk.white(' → ') +
                        chalk.green(report.estimatedCostLVM);
    const savingsLine = `  Efficiency gain: ${savingsTag}   Cost: ${costStr}`;
 
    // ── Header line ────────────────────────────────────────────────────────
    const title     = chalk.bold.white('🧊 CONTEXT-CONDENSER') + '  ' + chalk.gray(`v${VERSION}`);
    const headerLine = `  ${title}`;
 
    // ── Stats line ────────────────────────────────────────────────────────
    const projectName = path.basename(absoluteDir).slice(0, 20);
    const symStr      = chalk.yellow(symbols.toLocaleString());
    const projStr     = chalk.gray(projectName);
    const statsLine   = `  Symbols indexed: ${symStr}   Project: ${projStr}`;
 
    // ── Bar lines ──────────────────────────────────────────────────────────
    const rawLine = `  Raw:  ${bar(maxTokens, maxTokens)}  ${tokenLabel(report.rawTokens, chalk.red)}`;
    const lvmLine = `  LVM:  ${bar(report.condensedTokens, maxTokens)}  ${tokenLabel(report.condensedTokens, chalk.green)}`;
 
    // ── Render ─────────────────────────────────────────────────────────────
    console.log();
    console.log(divider('┌', '┐'));
    console.log(row(headerLine));
    console.log(divider('├', '┤'));
    console.log(row(statsLine));
    console.log(divider('├', '┤'));
    console.log(row(rawLine));
    console.log(row(lvmLine));
    console.log(divider('├', '┤'));
    console.log(row(savingsLine));
    console.log(divider('└', '┘'));
    console.log();
    console.log(
      chalk.gray(`  Run ${chalk.cyan('lvm serve')} to connect to Claude Desktop via MCP.`)
    );
    console.log();
  });
 
// ─────────────────────────────────────────────
// lvm serve
// ─────────────────────────────────────────────
program
  .command('serve')
  .description('Start the MCP server (for use with Claude Desktop)')
  .option('--root <path>', 'project root to index', '.')
  .action((opts: { root: string }) => {
    const root = path.resolve(process.cwd(), opts.root);
    process.env.LVM_ROOT = root;
    import('@context-condenser/mcp-server');
  });
 
// ─────────────────────────────────────────────
// lvm init
// ─────────────────────────────────────────────
program
  .command('init')
  .description('Scaffold a .lvmignore file in the current directory')
  .action(async () => {
    const dest = path.join(process.cwd(), '.lvmignore');
 
    const template = [
      '# Context-Condenser ignore file (.lvmignore)',
      '# Syntax identical to .gitignore',
      '',
      '# Documentation',
      'docs/',
      '*.md',
      'LICENSE',
      '',
      '# Large generated / binary files',
      '*.json',
      '*.csv',
      '*.log',
      '*.lock',
      '',
      '# Test fixtures (large snapshots)',
      '__snapshots__/',
      'fixtures/',
      '',
      '# Vendor / third-party',
      'vendor/',
    ].join('\n');
 
    try {
      await fs.access(dest);
      console.log(chalk.yellow('.lvmignore already exists — skipping.'));
    } catch {
      await fs.writeFile(dest, template, 'utf8');
      console.log(chalk.green('✅ .lvmignore created.'));
    }
  });
 
program.parse();
