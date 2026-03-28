/**
 * packages/mcp-server/src/index.ts
 *
 * Model Context Protocol server for Context-Condenser.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import path from 'path';
import { CondenserEngine } from '@context-condenser/core';

// ---------------------------------------------------------------------------
// Engine bootstrap
// ---------------------------------------------------------------------------
const engine = new CondenserEngine();
// Ensure projectRoot is an absolute path
const rawRoot = process.env.LVM_ROOT ?? process.cwd();
const projectRoot = path.isAbsolute(rawRoot) ? rawRoot : path.resolve(process.cwd(), rawRoot);

// Index the project on startup
// We use a small delay to ensure the transport is ready before heavy IO starts
setTimeout(() => {
  console.error(`[LVM] Indexing project at: ${projectRoot}`);
  engine.indexSource(projectRoot).catch((err) => {
    console.error(`[LVM] Initial indexing failed: ${err.message}`);
  });
}, 1000);

// ---------------------------------------------------------------------------
// MCP Server Configuration
// ---------------------------------------------------------------------------
const server = new Server(
  { name: 'context-condenser', version: '0.1.0' },
  { capabilities: { tools: {}, prompts: {} } }
);

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'hydrate_context',
      description:
        'Expands one or more @LVM-ID skeletons into their full source code. ' +
        'Call this BEFORE editing any condensed function or class.',
      inputSchema: {
        type: 'object',
        properties: {
          symbolIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of @LVM-ID strings found in the skeleton comment',
          },
          depth: {
            type: 'number',
            description:
              'How many dependency hops to include (0 = target only, 1 = + direct deps). Default: 0',
          },
        },
        required: ['symbolIds'],
      },
    },
    {
      name: 'get_skeleton',
      description:
        'Returns the condensed "Skeleton" view of a file. ' +
        'Use this to understand a file\'s structure without burning tokens on logic.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: {
            type: 'string',
            description: 'Relative path from project root or absolute path',
          },
        },
        required: ['filePath'],
      },
    },
    {
      name: 'efficiency_report',
      description:
        'Returns token savings and estimated cost reduction for the currently indexed project.',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

// ---------------------------------------------------------------------------
// Tool Logic
// ---------------------------------------------------------------------------
const HydrateSchema = z.object({
  symbolIds: z.array(z.string()),
  depth: z.number().optional().default(0),
});

const SkeletonSchema = z.object({ filePath: z.string() });

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case 'hydrate_context': {
        const { symbolIds, depth } = HydrateSchema.parse(request.params.arguments);
        const bodies = engine.hydrateMany({ symbolIds, depth });
        
        return {
          content: bodies.map((body, i) => ({
            type: 'text' as const,
            text: `--- SOURCE FOR: ${symbolIds[i] || 'Dependency'} ---\n${body}\n--- END ---`,
          })),
        };
      }

      case 'get_skeleton': {
        const { filePath } = SkeletonSchema.parse(request.params.arguments);
        // Ensure we resolve the path relative to project root if it's relative
        const fullPath = path.isAbsolute(filePath) 
          ? filePath 
          : path.resolve(projectRoot, filePath);
          
        const skeleton = engine.generateSkeleton(fullPath);
        return {
          content: [
            {
              type: 'text' as const,
              text: skeleton || `⚠️ No indexed symbols found for path: ${filePath}\nEnsure the file exists and is a supported type (.ts, .js, .tsx).`,
            },
          ],
        };
      }

      case 'efficiency_report': {
        const report = engine.getEfficiencyReport();
        return {
          content: [
            {
              type: 'text' as const,
              text: [
                `📊 LVM Efficiency Report`,
                `─────────────────────────────────`,
                `Project Root:     ${projectRoot}`,
                `Raw tokens:       ${report.rawTokens.toLocaleString()}`,
                `Condensed tokens: ${report.condensedTokens.toLocaleString()}`,
                `Savings:          ${report.savingsPercent}`,
                `Cost (raw):       ${report.estimatedCostRaw}`,
                `Cost (LVM):       ${report.estimatedCostLVM}`,
              ].join('\n'),
            },
          ],
        };
      }

      default:
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${request.params.name}` }],
        };
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error executing tool: ${error.message}` }],
    };
  }
});

// ---------------------------------------------------------------------------
// Prompts (Instructional Context)
// ---------------------------------------------------------------------------
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'lvm-system',
      description: 'System instructions for navigating and modifying condensed codebases.',
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name === 'lvm-system') {
    return {
      messages: [
        {
          role: 'user', // System-level instructions often presented as a user-start in MCP
          content: {
            type: 'text',
            text: LVM_SYSTEM_PROMPT,
          },
        },
      ],
    };
  }
  throw new Error('Prompt not found');
});

// ---------------------------------------------------------------------------
// Transport & Start
// ---------------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[LVM] MCP Server running on Stdio');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const LVM_SYSTEM_PROMPT = `
# LVM (Low-Value Management) Operating Instructions

You are using a token-efficient "Skeleton" view. Most function and class bodies are hidden.

## Core Directives
1. **Hydrate Before Modifying:** If you need to edit a function, you MUST call \`hydrate_context\` with its \`@LVM-ID\`.
2. **Follow Dependencies:** If hydrated code calls another condensed function, hydrate that dependency if the logic is unclear.
3. **Use Skeletons for Navigation:** Use \`get_skeleton\` to explore the file structure without loading full implementation details.
4. **ID Format:** \`@LVM-ID: <path>:<name>:<offset>\`. Use the full string for hydration.

## Optimization
Only hydrate what you need. A \`depth: 1\` call is usually enough to understand local context.
`.trim();
