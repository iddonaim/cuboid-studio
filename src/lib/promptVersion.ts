/**
 * Prompt-file provenance. The curated prompt templates in src/prompts/ carry a
 * "# version: N" header line that the architect bumps whenever the file is
 * edited. The API handlers parse it out of the template they just loaded and
 * echo it on results, so saved records document which prompt produced them.
 */
export function parsePromptVersion(template: string): string | null {
  const match = template.match(/^#\s*version:\s*(\S+)/im);
  return match ? match[1] : null;
}
