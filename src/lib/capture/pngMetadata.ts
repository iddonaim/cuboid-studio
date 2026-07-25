/**
 * Minimal PNG tEXt-chunk writer, used to stamp capture provenance (camera,
 * section plane, composition id) INTO the exported PNG itself — one file, no
 * sidecar, invisible in the image. Readable with any PNG chunk inspector
 * (e.g. `exiftool`, `pngcheck -t`, or TweakPNG).
 *
 * PNG layout: 8-byte signature, then chunks of [length, type, data, CRC].
 * A tEXt chunk is `keyword\0text` (Latin-1). We insert ours immediately after
 * the mandatory IHDR chunk, which is always first.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c >>> 0;
  }
  return crcTable;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Returns a copy of `png` with a tEXt chunk (`keyword` → `text`) inserted
 * after IHDR. If the input doesn't look like a PNG, it is returned unchanged
 * — a capture must never fail because metadata couldn't be written.
 *
 * `text` must be representable in Latin-1 (JSON without exotic strings is).
 */
export function embedPngText(png: Uint8Array, keyword: string, text: string): Uint8Array {
  if (png.length < 8 + 25 || !PNG_SIGNATURE.every((b, i) => png[i] === b)) return png;

  // IHDR: first chunk, fixed 13-byte payload → signature(8) + len(4) +
  // type(4) + data(13) + crc(4) = insertion point at byte 33.
  const ihdrLength = new DataView(png.buffer, png.byteOffset + 8, 4).getUint32(0);
  const insertAt = 8 + 4 + 4 + ihdrLength + 4;

  const payload = new TextEncoder().encode(`${keyword}\0${text}`);
  // tEXt payloads are Latin-1; TextEncoder emits UTF-8. Provenance JSON is
  // ASCII by construction (ids, numbers), so the encodings coincide.
  const chunk = new Uint8Array(4 + 4 + payload.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // "tEXt"
  chunk.set(payload, 8);
  const crcInput = chunk.subarray(4, 8 + payload.length);
  view.setUint32(8 + payload.length, crc32(crcInput));

  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, insertAt), 0);
  out.set(chunk, insertAt);
  out.set(png.subarray(insertAt), insertAt + chunk.length);
  return out;
}
