import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
// The two scripts ship inside the app bundle so users never need the repo.
// `?raw` inlines the file contents as strings at build time — the app and
// the downloadable scripts can't drift apart.
import bridgeServerSource from '../../../grasshopper/cuboid_bridge_server.py?raw';
import ghReceiverSource from '../../../grasshopper/cuboid_gh_receiver.py?raw';
import ghCanvasSource from '../../../grasshopper/cuboid_live_link.ghx?raw';

/**
 * Grasshopper Setup Guide — modal opened from the Export panel.
 *
 * Everything a Rhino user needs to run the live-link, with zero repo
 * access: download the two Python scripts straight from the app, then
 * follow a plain-language walkthrough (start bridge → connect → wire up
 * Grasshopper). Written for people who don't live in a terminal.
 */

const downloadScript = (filename: string, source: string) => {
  const blob = new Blob([source], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // Deferred: revoking synchronously races the download navigation in
  // Firefox/Safari and can yield an empty file.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
};

/* ── Small building blocks ── */

const StepHeading: React.FC<{ n: number; title: string }> = ({ n, title }) => (
  <div className="flex items-baseline gap-2 mb-1.5">
    <span className="font-mono text-[11px] text-primary flex-shrink-0">
      {String(n).padStart(2, '0')}
    </span>
    <h3 className="text-[14px] font-semibold text-ink-900 m-0">{title}</h3>
  </div>
);

const CommandBlock: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-ink-900 text-ink-100 rounded px-2.5 py-1.5 font-mono text-[11.5px] overflow-x-auto whitespace-pre my-1.5">
    {children}
  </div>
);

const Hint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11.5px] text-ink-500 leading-relaxed m-0 mt-1.5">{children}</p>
);

const NumberedList: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ol className="m-0 mt-1 pl-4 flex flex-col gap-1 text-[12.5px] text-ink-700 leading-relaxed">
    {items.map((item, i) => (
      <li key={i}>{item}</li>
    ))}
  </ol>
);

const DownloadRow: React.FC<{
  filename: string;
  source: string;
  role: string;
}> = ({ filename, source, role }) => (
  <div className="flex items-center gap-2 p-2 bg-ink-100 border border-ink-200 rounded-md">
    <div className="flex-1 min-w-0">
      <div className="font-mono text-[11.5px] text-ink-900 truncate">{filename}</div>
      <div className="text-[11px] text-ink-500">{role}</div>
    </div>
    <Button
      onClick={() => downloadScript(filename, source)}
      className="h-auto py-1.5 px-2.5 text-[11.5px] bg-primary hover:bg-primary/85 text-white border-0 flex items-center gap-1.5 flex-shrink-0"
    >
      <Download size={12} />
      Download
    </Button>
  </div>
);

/* ── The guide ── */

export const GrasshopperSetupGuide: React.FC<{ onClose: () => void; port?: number }> = ({
  onClose,
  port = 9876,
}) => {
  // startsWith, not includes: 'darwin' contains 'win'. Optional chain:
  // navigator.platform is deprecated and absent in some webviews.
  const [os, setOs] = useState<string>(() =>
    navigator.platform?.toLowerCase().startsWith('win') ? 'windows' : 'mac'
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Capture-phase + stopPropagation so App.tsx's global Escape
        // shortcut (clear cube selection / picker) doesn't also fire.
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [onClose]);

  const pythonCmd = os === 'windows' ? 'py' : 'python3';

  // Portal: on mobile this panel lives inside the BottomSheet, whose
  // CSS transform would otherwise trap `position: fixed` and clip the
  // modal to the sheet instead of covering the viewport.
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        background: 'hsl(45 9% 13% / 0.35)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Grasshopper live-link setup guide"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-[560px] max-h-[88vh] flex flex-col rounded-xl overflow-hidden"
        style={{
          background: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          boxShadow: '0 24px 64px hsl(45 9% 13% / 0.22)',
        }}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-ink-200 flex items-center gap-3 flex-shrink-0">
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold text-ink-900 m-0">
              Grasshopper Live-Link Setup
            </h2>
            <p className="text-[11.5px] text-ink-500 m-0 mt-0.5">
              One-time setup, about five minutes. Nothing to install beyond free Python.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close setup guide"
            className="bg-transparent border-0 text-ink-400 hover:text-ink-600 cursor-pointer p-1"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-5 py-4 overflow-y-auto flex flex-col gap-5">
          {/* Step 1 — download the files */}
          <section>
            <StepHeading n={1} title="Download the two helper files" />
            <p className="text-[12.5px] text-ink-700 leading-relaxed m-0 mb-2">
              These come straight from this app — no GitHub account or repo needed. Save them
              into <strong>one folder you can find again</strong>, e.g.{' '}
              <code className="text-[11.5px]">Documents/cuboid-grasshopper</code>.
            </p>
            <div className="flex flex-col gap-1.5">
              <DownloadRow
                filename="cuboid_live_link.ghx"
                source={ghCanvasSource}
                role="Ready-made Grasshopper canvas — open it and skip step 4 entirely"
              />
              <DownloadRow
                filename="cuboid_bridge_server.py"
                source={bridgeServerSource}
                role="The bridge — relays this app's cubes to Grasshopper"
              />
              <DownloadRow
                filename="cuboid_gh_receiver.py"
                source={ghReceiverSource}
                role="The receiver script — only needed for the manual path in step 4"
              />
            </div>
          </section>

          {/* Step 2 — start the bridge */}
          <section>
            <StepHeading n={2} title="Start the bridge" />
            <p className="text-[12.5px] text-ink-700 leading-relaxed m-0 mb-1.5">
              The bridge is a tiny program that runs in a terminal window and passes your cubes
              from the browser to Grasshopper. It needs{' '}
              <a
                href="https://www.python.org/downloads/"
                target="_blank"
                rel="noreferrer"
                className="text-primary"
              >
                Python 3
              </a>{' '}
              (free) — and nothing else.
            </p>
            <Tabs value={os} onValueChange={setOs}>
              <TabsList className="h-8">
                <TabsTrigger value="mac" className="text-[11.5px] px-2.5 py-1">
                  Mac
                </TabsTrigger>
                <TabsTrigger value="windows" className="text-[11.5px] px-2.5 py-1">
                  Windows
                </TabsTrigger>
              </TabsList>
              <TabsContent value="mac">
                <NumberedList
                  items={[
                    <>
                      Open <strong>Terminal</strong> (press <kbd>⌘ Space</kbd>, type
                      &ldquo;Terminal&rdquo;, press Enter).
                    </>,
                    <>
                      Type <code>cd </code> (with a trailing space), then <strong>drag the
                      folder from step 1 onto the Terminal window</strong> — its location fills
                      in for you. Press Enter.
                    </>,
                    <>Start the bridge:</>,
                  ]}
                />
                <CommandBlock>python3 cuboid_bridge_server.py</CommandBlock>
                <Hint>
                  If the terminal says <em>command not found</em>, Python isn&apos;t installed
                  yet — get it from python.org, then try again in a new Terminal window.
                </Hint>
              </TabsContent>
              <TabsContent value="windows">
                <NumberedList
                  items={[
                    <>
                      Open the folder from step 1 in <strong>File Explorer</strong>.
                    </>,
                    <>
                      Click the <strong>address bar</strong> at the top, type <code>cmd</code>,
                      press Enter — a terminal opens already pointed at that folder.
                    </>,
                    <>Start the bridge:</>,
                  ]}
                />
                <CommandBlock>py cuboid_bridge_server.py</CommandBlock>
                <Hint>
                  If the Microsoft Store opens instead, Python isn&apos;t installed yet — get it
                  from python.org (tick &ldquo;Add python.exe to PATH&rdquo; during install),
                  then re-open the terminal.
                </Hint>
              </TabsContent>
            </Tabs>
            <div className="mt-2 p-2 bg-ink-100 border border-ink-200 rounded-md">
              <div className="text-[11px] text-ink-500 mb-1">You&apos;ll know it worked when you see:</div>
              <div className="font-mono text-[11px] text-ink-700 whitespace-pre">
                [Bridge] Listening on http://localhost:{port}
              </div>
              <div className="text-[11px] text-ink-500 mt-1">
                Leave this window open — closing it stops the link.
              </div>
            </div>
          </section>

          {/* Step 3 — connect the app */}
          <section>
            <StepHeading n={3} title="Connect this app" />
            <p className="text-[12.5px] text-ink-700 leading-relaxed m-0">
              Back in the Export panel, click <strong>Connect</strong> next to
              &ldquo;GH Live-Link&rdquo;. The dot turns green, and from then on every cube you
              place, move, or modify streams to the bridge automatically.
            </p>
            <Hint>
              Safari blocks this connection — use Chrome, Edge, or Firefox for the live-link.
            </Hint>
          </section>

          {/* Step 4 — Grasshopper */}
          <section>
            <StepHeading n={4} title="Wire up Grasshopper" />
            <p className="text-[12.5px] text-ink-700 leading-relaxed m-0 mb-1.5">
              <strong>Easy path:</strong> open the downloaded{' '}
              <code>cuboid_live_link.ghx</code> in Grasshopper — toggle, timer, and script come
              pre-wired, and your cubes appear as soon as the bridge has data. The steps below
              are only for building it into an existing definition by hand.
            </p>
            <NumberedList
              items={[
                <>
                  In Grasshopper, add a <strong>Python script</strong> component to the canvas
                  (called <em>GHPython</em> in Rhino 7, <em>Script</em> in Rhino 8 — set its
                  language to Python).
                </>,
                <>
                  Open the downloaded <code>cuboid_gh_receiver.py</code> in any text editor,
                  copy everything, and paste it into the component.
                </>,
                <>
                  <strong>Inputs:</strong> the component needs two input sockets named exactly{' '}
                  <code>poll</code> and <code>port</code>. Zoom in close on its <em>left</em>{' '}
                  edge until small ⊕ icons appear, add/remove until there are two, and
                  right-click each name to rename it. Wire a <strong>Boolean Toggle</strong>{' '}
                  (set to True) into <code>poll</code>. You can leave <code>port</code>{' '}
                  unconnected — it uses {port} automatically. (If you do wire a slider into it,
                  right-click the slider and set its rounding to whole numbers.)
                </>,
                <>
                  <strong>Outputs:</strong> same trick on the <em>right</em> edge — add an
                  output and rename it to exactly <code>boxes</code>. The moment it exists,
                  your carved cubes — master cuts and meme cuts included — appear in the Rhino
                  viewport, placed and rotated as in the browser. Nothing needs to be wired to
                  it. The first load takes a few seconds while the cuts are computed; after
                  that they&apos;re cached and updates are instant.
                </>,
                <>
                  <strong>Make it live:</strong> add a <strong>Timer</strong> component and
                  double-click it to set the interval to 1&nbsp;second. The Timer doesn&apos;t
                  plug into a socket — drag a wire from its output nub onto the{' '}
                  <em>middle of the Python component itself</em>; it latches onto the whole
                  component with a dashed wire. Now changes in the browser show up in Rhino
                  within a second.
                </>,
              ]}
            />
            <Hint>
              Not sure it&apos;s working? Attach a <strong>Panel</strong> to the
              component&apos;s <code>out</code> socket — it prints status messages like
              &ldquo;Loaded 13 cubes from bridge&rdquo;. And for parametric work beyond
              preview, add more outputs the same way: <code>positions</code>,{' '}
              <code>variations</code>, <code>rotations_y</code>, <code>cutter_ids</code>,{' '}
              <code>operators</code>, <code>raw_json</code>.
            </Hint>
          </section>

          {/* Troubleshooting */}
          <section className="pb-1">
            <h3 className="text-[12px] font-semibold text-ink-900 m-0 mb-1.5 font-mono uppercase tracking-wide">
              If something goes wrong
            </h3>
            <ul className="m-0 p-0 list-none flex flex-col gap-1.5 text-[11.5px] text-ink-600 leading-relaxed">
              <li>
                <strong>&ldquo;No such file or directory&rdquo;</strong> — the terminal
                isn&apos;t in the folder with the files. Redo step 2&apos;s folder part.
              </li>
              <li>
                <strong>Dot turns red after connecting</strong> — the bridge window was closed
                or never started. Restart it (step 2) and reconnect.
              </li>
              <li>
                <strong>Port already in use</strong> — run{' '}
                <code>{pythonCmd} cuboid_bridge_server.py --port 9877</code> and set the same
                port in this panel&apos;s settings and in Grasshopper.
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
};
