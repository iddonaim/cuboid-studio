import { describe, it, expect } from 'vitest';
import { MODEL_OPTIONS, toAnthropicModelId } from './models';

describe('toAnthropicModelId', () => {
  it('strips the vendor prefix and converts version dots to dashes', () => {
    expect(toAnthropicModelId('anthropic/claude-sonnet-4.6')).toBe('claude-sonnet-4-6');
    expect(toAnthropicModelId('anthropic/claude-opus-4.8')).toBe('claude-opus-4-8');
    expect(toAnthropicModelId('anthropic/claude-haiku-4.5')).toBe('claude-haiku-4-5');
  });

  it('leaves dotless ids unchanged apart from the prefix', () => {
    expect(toAnthropicModelId('anthropic/claude-sonnet-4')).toBe('claude-sonnet-4');
    expect(toAnthropicModelId('anthropic/claude-sonnet-5')).toBe('claude-sonnet-5');
  });

  it('passes already-Anthropic ids through', () => {
    expect(toAnthropicModelId('claude-sonnet-4-6')).toBe('claude-sonnet-4-6');
    expect(toAnthropicModelId('claude-opus-4.8')).toBe('claude-opus-4-8');
  });

  it('does not touch non-version dots or foreign vendors', () => {
    expect(toAnthropicModelId('openai/gpt-4o')).toBe('openai/gpt-4o');
    expect(toAnthropicModelId('openai/gpt-5.6-sol')).toBe('openai/gpt-5.6-sol');
    expect(toAnthropicModelId('google/gemini-3.5-flash')).toBe('google/gemini-3.5-flash');
  });

  it('registry ids are unique and OpenRouter-shaped', () => {
    const ids = MODEL_OPTIONS.map(m => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
  });

  it('registry still leads with the deployed Anthropic default', () => {
    // The panel pre-selects entries 0 and 1; non-Anthropic candidates are
    // appended after the Claude family so those defaults stay meaningful.
    expect(MODEL_OPTIONS[0].id).toBe('anthropic/claude-sonnet-4');
    expect(MODEL_OPTIONS[1].id).toBe('anthropic/claude-sonnet-4.6');
  });
});
