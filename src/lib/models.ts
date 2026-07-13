/**
 * Model registry — the single place model identifiers live.
 *
 * The system talks to models through OpenRouter by default, so ids here use
 * OpenRouter's naming (vendor prefix, dots in version numbers). The
 * Anthropic-native fallback path converts with toAnthropicModelId().
 *
 * Editing this list is how the model-comparison panel gets its candidates.
 * OpenRouter slugs for newly released models should be verified against
 * GET https://openrouter.ai/api/v1/models before relying on them — a wrong
 * slug fails per-model in the comparison panel with a visible error, it
 * does not break anything else.
 *
 * Strategy for choosing between these lives in docs/MODEL_STRATEGY.md.
 */

export interface ModelOption {
  /** OpenRouter-style id, sent as the `model` request field. */
  id: string;
  /** Short human label for UI. */
  label: string;
  /** One-line context shown in the comparison panel. */
  note?: string;
}

/**
 * Candidates offered in the Pataphysical model-comparison panel.
 * The first entry is the current deployed default for translation.
 */
export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'anthropic/claude-sonnet-4',
    label: 'Sonnet 4',
    note: 'Current translation default — deprecated by Anthropic, retirement pending',
  },
  {
    id: 'anthropic/claude-sonnet-4.6',
    label: 'Sonnet 4.6',
    note: 'Same model Encode runs; the prompts were tuned in this era',
  },
  {
    id: 'anthropic/claude-sonnet-5',
    label: 'Sonnet 5',
    note: 'Newest Sonnet — stronger reasoning, more literal instruction-following',
  },
  {
    id: 'anthropic/claude-opus-4.8',
    label: 'Opus 4.8',
    note: 'Most capable tier — deepest cultural readings, slower and ~3× cost',
  },
  {
    id: 'anthropic/claude-haiku-4.5',
    label: 'Haiku 4.5',
    note: 'Fast/cheap baseline — useful as a comparison floor',
  },
  {
    id: 'google/gemini-3.5-flash',
    label: 'Gemini 3.5 Flash',
    note: 'Google — newest-generation Google model, near-Pro reasoning at Flash speed/cost. Needs the OpenRouter path (the deployed default)',
  },
  {
    id: 'google/gemini-3.1-pro-preview',
    label: 'Gemini 3.1 Pro Preview',
    note: "Google's deepest-reasoning tier (no 3.5 Pro exists yet). Needs the OpenRouter path (the deployed default)",
  },
  {
    id: 'openai/gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    note: 'OpenAI flagship (the ChatGPT-era 5.6). Needs the OpenRouter path (the deployed default)',
  },
  {
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    note: 'OpenAI fast/cheap tier — the 5.6-generation cost floor. Needs the OpenRouter path (the deployed default)',
  },
];

/**
 * Convert an OpenRouter-style id to an Anthropic API id:
 * strip the vendor prefix and turn version dots into dashes
 * ("anthropic/claude-sonnet-4.6" → "claude-sonnet-4-6").
 * Non-Anthropic ids pass through unchanged; the caller decides how to
 * handle them (the API falls back to its default with a warning).
 */
export function toAnthropicModelId(id: string): string {
  if (!id.startsWith('anthropic/') && !id.startsWith('claude-')) return id;
  const stripped = id.startsWith('anthropic/') ? id.slice('anthropic/'.length) : id;
  return stripped.replace(/(\d)\.(\d)/g, '$1-$2');
}
