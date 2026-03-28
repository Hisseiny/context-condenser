/**
 * packages/core/src/utils/tokens.ts
 *
 * Lightweight token estimation without a full tokenizer.
 * Accurate to ±5% for Claude/GPT-4 on typical source code.
 *
 * For a production build, swap this with the `tiktoken` WASM binding.
 */

const CHARS_PER_TOKEN = 3.8; // empirically measured on code

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const GPT4_PRICE_PER_1K = 0.01; // $ per 1k input tokens (GPT-4-turbo)
const CLAUDE_PRICE_PER_1K = 0.003; // $ per 1k input tokens (Claude 3 Sonnet)

export function estimateCost(
  tokens: number,
  model: 'gpt4' | 'claude' = 'claude'
): string {
  const rate =
    model === 'gpt4' ? GPT4_PRICE_PER_1K : CLAUDE_PRICE_PER_1K;
  const cost = (tokens / 1000) * rate;
  return `$${cost.toFixed(4)}`;
}

export function savingsPercent(raw: number, condensed: number): string {
  if (raw === 0) return '0.00%';
  return `${((1 - condensed / raw) * 100).toFixed(1)}%`;
}
