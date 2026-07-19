/**
 * Floating "Export demo bundle" button — authoring aid, never part of the demo.
 *
 * Rendered only when the URL carries `?demoExport` AND a user is signed in.
 * Online, it gathers pins + compositions + memes + canned translations and
 * downloads `demo-bundle-raw.json` (see src/lib/demo/export.ts for step 2).
 */
import React, { useState } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { isDemoExportMode } from '../../lib/demo/demoMode';
import { buildRawDemoBundle, downloadRawDemoBundle } from '../../lib/demo/export';

export const DemoExportButton: React.FC = () => {
  const { user } = useAuthContext();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!isDemoExportMode() || !user) return null;

  const handleExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const bundle = await buildRawDemoBundle(user.uid);
      downloadRawDemoBundle(bundle);
      const rec = bundle.recordings;
      const recLine = rec
        ? `Recording included: ${rec.geocode.length} address(es), ${rec.encodes.length} ` +
          `photo encode(s), ${rec.evolveRounds.length} evolve round(s), ${rec.twoPass.length} ` +
          `live translation(s). `
        : 'No ?demoRecord session found in this browser. ';
      setMessage(
        `Exported ${bundle.compositions.length} composition(s), ${bundle.pins.length} pin(s), ` +
          `${bundle.memes.length} meme(s), ${bundle.translations.length} canned translation(s). ` +
          recLine +
          'Now run: node scripts/build-demo-bundle.mjs demo-bundle-raw.json',
      );
    } catch (err) {
      console.error('Demo export failed:', err);
      setMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-[1000] max-w-sm rounded-lg border border-purple-500/40 bg-zinc-900/95 p-3 text-sm text-zinc-100 shadow-xl">
      <button
        onClick={handleExport}
        disabled={busy}
        className="rounded bg-purple-600 px-3 py-1.5 font-medium text-white hover:bg-purple-500 disabled:opacity-50"
      >
        {busy ? 'Exporting…' : 'Export demo bundle'}
      </button>
      {message && <p className="mt-2 leading-snug text-zinc-300">{message}</p>}
    </div>
  );
};
