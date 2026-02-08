/**
 * Maps an archthesis meme to the cuboid-studio pataphysical translation input.
 *
 * Field mapping:
 *   memeText/topText+bottomText + description + tags → memeDescription
 *   location.display_name                            → locationTag
 *   likes (logarithmic bucketing)                    → engagementLevel (0-100)
 */
import type { ArchthesisMeme, CuboidMemeInput } from '../types/archthesis';

/**
 * Convert a raw likes count to a 0-100 engagement level using logarithmic bucketing.
 * This prevents a handful of viral memes from squashing the rest to near-zero.
 *
 *   0 likes   →  0
 *   1 like    → ~15
 *   10 likes  → ~44
 *   50 likes  → ~65
 *   100 likes → ~75
 *   500+      → ~95-100
 */
function likesToEngagement(likes: number): number {
  if (likes <= 0) return 0;
  // log10(1) = 0, log10(1000) ≈ 3 → scale to 0-100
  const scaled = (Math.log10(likes + 1) / Math.log10(1000)) * 100;
  return Math.min(100, Math.round(scaled));
}

/**
 * Build a rich meme description string from all available text fields.
 * Gives Claude maximum context for the pataphysical translation.
 */
function buildDescription(meme: ArchthesisMeme): string {
  const parts: string[] = [];

  // Primary meme text (prefer combined memeText, fall back to top+bottom)
  const memeText = meme.memeText?.trim();
  if (memeText) {
    parts.push(memeText);
  } else {
    const combined = [meme.topText, meme.bottomText].filter(Boolean).join(' / ');
    if (combined) parts.push(combined);
  }

  // User-provided description adds narrative context
  if (meme.description?.trim()) {
    parts.push(`Description: ${meme.description.trim()}`);
  }

  // Tags help Claude identify rhetorical register
  if (meme.tags.length > 0) {
    parts.push(`Tags: ${meme.tags.join(', ')}`);
  }

  // Creator attribution (optional, adds social context)
  if (meme.username?.trim()) {
    parts.push(`Created by: ${meme.username.trim()}`);
  }

  return parts.join('\n') || 'Untitled meme';
}

export function mapMemeToCuboidInput(meme: ArchthesisMeme): CuboidMemeInput {
  return {
    memeDescription: buildDescription(meme),
    locationTag: meme.location?.display_name || null,
    engagementLevel: likesToEngagement(meme.likes),
  };
}
