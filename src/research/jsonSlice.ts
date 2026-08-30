/**
 * Verbatim JSON slice extraction.
 *
 * The shipped two-pass translation is ONE model call whose response is a JSON
 * array `[Pass1, Pass2]`. Ruling R1 requires cell (c) to prefill the stored
 * Pass 1 as "verbatim raw text from the referenced record" — so translation
 * records must store each pass's exact character span from the raw response,
 * not a re-serialization (JSON.parse → stringify would normalize whitespace
 * and key order, changing the text the model actually produced).
 *
 * This is a small string-aware bracket walker, not a JSON parser: it finds
 * the character spans of the top-level elements of a JSON array (or the
 * object itself, for a bare object). It assumes the input is valid JSON —
 * callers only use it on text JSON.parse already accepted.
 */

/**
 * Returns the exact character spans of the top-level elements of a JSON
 * array, or null when the (fence-stripped) text is not an array. Whitespace
 * around elements is not included in the spans.
 */
export function extractTopLevelArrayElements(text: string): string[] | null {
  const s = text;
  let i = 0;
  const skipWs = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };

  skipWs();
  if (s[i] !== '[') return null;
  i++;

  const elements: string[] = [];
  skipWs();
  if (s[i] === ']') return elements; // empty array

  while (i < s.length) {
    skipWs();
    const start = i;
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (; i < s.length; i++) {
      const c = s[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') {
        inString = true;
        continue;
      }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') {
        if (depth === 0) break; // the array's own closing bracket
        depth--;
      } else if (c === ',' && depth === 0) {
        break;
      }
    }

    if (i >= s.length) return null; // ran off the end — malformed
    elements.push(s.slice(start, i).trimEnd());

    if (s[i] === ']') return elements;
    if (s[i] === ',') {
      i++;
      continue;
    }
    return null;
  }
  return null;
}

export interface TwoPassRawSlices {
  pass1: string | null;
  pass2: string | null;
}

/**
 * Extracts the verbatim raw text of pass 1 and pass 2 from a (fence-stripped)
 * two-pass response. Handles the array form `[{pass:1,…},{pass:2,…}]` by
 * matching each element's `"pass"` value the same way the validator does.
 * The object form `{pass1:…, pass2:…}` has no per-pass verbatim spans worth
 * the complexity — both come back null and the full raw_response remains the
 * verbatim artifact.
 */
export function extractTwoPassRawSlices(text: string): TwoPassRawSlices {
  const elements = extractTopLevelArrayElements(text);
  if (!elements) return { pass1: null, pass2: null };

  let pass1: string | null = null;
  let pass2: string | null = null;
  for (const el of elements) {
    try {
      const parsed = JSON.parse(el);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (parsed.pass === 1 && pass1 === null) pass1 = el;
        if (parsed.pass === 2 && pass2 === null) pass2 = el;
      }
    } catch {
      // Not individually parseable — leave that slot null.
    }
  }
  return { pass1, pass2 };
}
