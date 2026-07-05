import React, { useState, useEffect, useCallback } from 'react';
import { Box } from 'lucide-react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { buildAssemblyExport, downloadAssemblyJSON } from '../../lib/export/assemblyExport';
import { liveLinkClient } from '../../lib/export/liveLinkClient';
import { ARViewer } from '../ar/ARViewer';
import { SavedStatesPanel } from '../tools/SavedStatesPanel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Section } from '@/components/ui/section';

/**
 * Export & Live-Link panel — shown at the bottom of the sidebar.
 *
 * Two features:
 * 1. Download assembly JSON (one-shot export)
 * 2. Live-link to Grasshopper via local bridge server (real-time push)
 */
export const ExportPanel: React.FC = () => {
  const placedCubes = useBuilderStore(s => s.placedCubes);
  const cubeOperators = useMemeStore(s => s.cubeOperators);
  const [linkStatus, setLinkStatus] = useState(liveLinkClient.status);
  const [port, setPort] = useState(9876);
  const [showSettings, setShowSettings] = useState(false);
  const [lastPush, setLastPush] = useState<string | null>(null);
  const [showAR, setShowAR] = useState(false);

  // Subscribe to live-link status changes
  useEffect(() => {
    return liveLinkClient.onStatusChange(setLinkStatus);
  }, []);

  // Auto-push when assembly changes and live-link is connected
  useEffect(() => {
    if (linkStatus !== 'connected' || placedCubes.length === 0) return;
    const data = buildAssemblyExport(placedCubes, cubeOperators);
    const sent = liveLinkClient.push(data);
    if (sent) {
      setLastPush(new Date().toLocaleTimeString());
    }
  }, [placedCubes, cubeOperators, linkStatus]);

  const handleConnect = useCallback(() => {
    if (liveLinkClient.isConnected) {
      liveLinkClient.disconnect();
    } else {
      liveLinkClient.connect(port);
    }
  }, [port]);

  const handleManualPush = useCallback(() => {
    const data = buildAssemblyExport(placedCubes, cubeOperators);
    const sent = liveLinkClient.push(data);
    if (sent) setLastPush(new Date().toLocaleTimeString());
  }, [placedCubes, cubeOperators]);

  // Status dot color via Tailwind bg classes
  const statusDotClass: Record<string, string> = {
    disconnected: 'bg-ink-300',
    connecting: 'bg-amber-400',
    connected: 'bg-green-500',
    error: 'bg-destructive',
  };

  const hasCubes = placedCubes.length > 0;

  return (
    <div>
      <Section id="util-export" title="Export & Grasshopper">
      <div className="flex items-center justify-end mb-1 -mt-1">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="bg-transparent border-0 text-ink-400 hover:text-ink-600 cursor-pointer text-[11px] px-1 py-0.5"
        >
          {showSettings ? 'hide settings' : 'settings'}
        </button>
      </div>

      {/* Download JSON button */}
      <Button
        onClick={downloadAssemblyJSON}
        disabled={!hasCubes}
        className={`w-full h-auto py-2 mb-1.5 text-[12px] border border-ink-200 ${
          hasCubes
            ? 'bg-ink-100 text-ink-600 hover:bg-ink-200'
            : 'bg-ink-100 text-ink-400 cursor-default'
        }`}
      >
        Download Assembly JSON
      </Button>

      {/* View in AR button */}
      <Button
        onClick={() => setShowAR(true)}
        disabled={!hasCubes}
        className={`w-full h-auto py-2 mb-1.5 text-[12px] border border-ink-200 flex items-center justify-center gap-1.5 ${
          hasCubes
            ? 'bg-primary/10 text-primary hover:bg-primary/20'
            : 'bg-ink-100 text-ink-400 cursor-default'
        }`}
      >
        <Box size={12} />
        View in AR
      </Button>

      {/* Live-link section */}
      <Separator className="bg-ink-200 my-2" />
      <div className="p-2 bg-ink-100 border border-ink-200 rounded-md">
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotClass[linkStatus] ?? 'bg-ink-300'}`} />
          <span className="text-ink-600 text-[11px] flex-1">
            GH Live-Link: {linkStatus}
          </span>
          <Button
            onClick={handleConnect}
            className={`h-auto py-0.5 px-2 text-[11px] border-0 ${
              linkStatus === 'connected'
                ? 'bg-destructive/10 hover:bg-destructive/20 text-destructive'
                : 'bg-primary hover:bg-primary/85 text-white'
            }`}
          >
            {linkStatus === 'connected' ? 'Stop' : 'Connect'}
          </Button>
        </div>

        {linkStatus === 'connected' && (
          <div className="flex items-center gap-1.5">
            <Button
              onClick={handleManualPush}
              disabled={!hasCubes}
              className={`flex-1 h-auto py-1 text-[11px] border border-ink-200 ${
                hasCubes
                  ? 'bg-ink-100 text-ink-600 hover:bg-ink-200'
                  : 'bg-transparent text-ink-400 cursor-default'
              }`}
            >
              Push Now
            </Button>
            {lastPush && (
              <span className="text-ink-400 text-[10px]">{lastPush}</span>
            )}
          </div>
        )}

        {linkStatus === 'disconnected' && (
          <div className="text-ink-400 text-[10px] leading-relaxed">
            Run <code className="text-primary">python cuboid_bridge_server.py</code> first
          </div>
        )}
      </div>

      {/* Settings (port config) */}
      {showSettings && (
        <div className="mt-1.5 p-1.5 bg-ink-100 border border-ink-200 rounded">
          <label className="flex items-center gap-1.5 text-[11px] text-ink-500">
            Port:
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className="w-16 px-1 py-0.5 text-[11px] bg-ink-100 border border-ink-200 rounded text-ink-600"
            />
          </label>
        </div>
      )}
      </Section>

      {/* Saved States — own collapsible header */}
      <SavedStatesPanel />

      {/* AR Viewer modal */}
      {showAR && <ARViewer onClose={() => setShowAR(false)} />}
    </div>
  );
};
