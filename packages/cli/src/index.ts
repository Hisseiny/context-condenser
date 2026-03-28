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

const program = new Command();

program
  .name('lvm')
  .description(
    '🧊 Context-Condenser — slash your LLM token costs by up to 90%'
  )
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
    const spinner = ora({
      text: chalk.cyan('Indexing project…'),
      color: 'cyan',
    }).start();

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

    // ─── Pretty terminal output ───
    const bar = (n: number, max: number, width = 30) => {
      if (max === 0) return chalk.gray('░'.repeat(width));
      const filled = Math.min(width, Math.round((n / max) * width));
      return (
        chalk.red('█'.repeat(filled)) +
        chalk.gray('░'.repeat(width - filled))
      );
    };

    const maxTokens = report.rawTokens || 1;

    console.log();
    console.log(chalk.bold.cyan('┌──────────────────────────────────────────────────────────┐'));
    console.log(
      chalk.bold.cyan('│') +
      chalk.bold('  🧊 CONTEXT-CONDENSER  ') +
      chalk.gray(`v${VERSION}`).padEnd(34) +
      chalk.bold.cyan('│')
    );
    console.log(chalk.bold.cyan('├──────────────────────────────────────────────────────────┤'));
    console.log(
      chalk.bold.cyan('│') +
      `  Symbols indexed: ${chalk.yellow(symbols.toLocaleString().padEnd(10))}` +
      ` Project: ${chalk.gray(path.basename(absoluteDir).slice(0, 15).padEnd(15))}` +
      ' '.repeat(4) +
      chalk.bold.cyan('│')
    );
    console.log(chalk.bold.cyan('├──────────────────────────────────────────────────────────┤'));
    console.log(
      chalk.bold.cyan('│') +
      `  Raw:  ${bar(report.rawTokens, maxTokens)}  ${chalk.red(
        report.rawTokens.toLocaleString().padStart(8)
      )} tokens  ` +
      chalk.bold.cyan('│')
    );
    console.log(
      chalk.bold.cyan('│') +
      `  LVM:  ${bar(report.condensedTokens, maxTokens)}  ${chalk.green(
        report.condensedTokens.toLocaleString().padStart(8)
      )} tokens  ` +
      chalk.bold.cyan('│')
    );
    console.log(chalk.bold.cyan('├──────────────────────────────────────────────────────────┤'));
    console.log(
      chalk.bold.cyan('│') +
      `  Efficiency gain: ${chalk.bgGreen.black.bold(` ${report.savingsPercent} `)}` +
      `  Cost: ${chalk.red(report.estimatedCostRaw)} → ${chalk.green(report.estimatedCostLVM)}`.padEnd(30) +
      chalk.bold.cyan('│')
    );
    console.log(chalk.bold.cyan('└──────────────────────────────────────────────────────────┘'));
    console.log();
    console.log(
      chalk.gray(`  Run ${chalk.blue('lvm serve')} to connect this to Claude Desktop via MCP.`)
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
  .action(async (opts: { root: string }) => {
    const root = path.resolve(process.cwd(), opts.root);
    process.env.LVM_ROOT = root;
    
    console.log(chalk.cyan(`🚀 Starting MCP server at ${root}...`));
    
    try {
      // Dynamic import to boot the server
      await import('@context-condenser/mcp-server');
    } catch (err) {
      console.error(chalk.red('Failed to start MCP server:'), err);
      process.exit(1);
    }
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
      'node_modules/',
      'vendor/',
      'dist/',
    ].join('\n');

    try {
      await fs.access(dest);
      console.log(chalk.yellow('⚠️  .lvmignore already exists — skipping.'));
    } catch {
      await fs.writeFile(dest, template, 'utf8');
      console.log(chalk.green('✅ .lvmignore created successfully.'));
    }
  });

program.parse();
