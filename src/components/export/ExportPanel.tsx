import React, { useState, useEffect, useCallback } from 'react';
import { useBuilderStore } from '../../store/useBuilderStore';
import { useMemeStore } from '../../store/useMemeStore';
import { buildAssemblyExport, downloadAssemblyJSON } from '../../lib/export/assemblyExport';
import { liveLinkClient } from '../../lib/export/liveLinkClient';
import { ARViewer } from '../ar/ARViewer';
import { SavedStatesPanel } from '../tools/SavedStatesPanel';

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

  const statusColor: Record<string, string> = {
    disconnected: '#64748b',
    connecting: '#f59e0b',
    connected: '#22c55e',
    error: '#ef4444',
  };

  const hasCubes = placedCubes.length > 0;

  return (
    <div style={{ borderTop: '1px solid #334155', paddingTop: 12, marginTop: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>Export</span>
        <button
          onClick={() => setShowSettings(!showSettings)}
          style={{
            background: 'none', border: 'none', color: '#475569',
            cursor: 'pointer', fontSize: 10, padding: '2px 4px',
          }}
        >
          {showSettings ? 'hide' : 'settings'}
        </button>
      </div>

      {/* Download JSON button */}
      <button
        onClick={downloadAssemblyJSON}
        disabled={!hasCubes}
        style={{
          width: '100%', padding: 8, fontSize: 11,
          background: hasCubes ? '#1e293b' : '#0f172a',
          border: '1px solid #334155', borderRadius: 6,
          color: hasCubes ? '#94a3b8' : '#475569',
          cursor: hasCubes ? 'pointer' : 'default',
          marginBottom: 6,
        }}
      >
        Download Assembly JSON
      </button>

      {/* View in AR button */}
      <button
        onClick={() => setShowAR(true)}
        disabled={!hasCubes}
        style={{
          width: '100%', padding: 8, fontSize: 11,
          background: hasCubes ? '#1e3a5f' : '#0f172a',
          border: '1px solid #334155', borderRadius: 6,
          color: hasCubes ? '#93c5fd' : '#475569',
          cursor: hasCubes ? 'pointer' : 'default',
          marginBottom: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <i className="fas fa-cube" style={{ fontSize: 10 }} />
        View in AR
      </button>

      {/* Saved States */}
      <SavedStatesPanel />

      {/* AR Viewer modal */}
      {showAR && <ARViewer onClose={() => setShowAR(false)} />}

      {/* Live-link section */}
      <div style={{
        padding: 8, background: '#0f172a',
        border: '1px solid #334155', borderRadius: 6,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor[linkStatus] || '#64748b',
          }} />
          <span style={{ color: '#94a3b8', fontSize: 10, flex: 1 }}>
            GH Live-Link: {linkStatus}
          </span>
          <button
            onClick={handleConnect}
            style={{
              padding: '3px 8px', fontSize: 10, borderRadius: 4,
              border: 'none', cursor: 'pointer',
              background: linkStatus === 'connected' ? '#7f1d1d' : '#065f46',
              color: 'white',
            }}
          >
            {linkStatus === 'connected' ? 'Stop' : 'Connect'}
          </button>
        </div>

        {linkStatus === 'connected' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={handleManualPush}
              disabled={!hasCubes}
              style={{
                flex: 1, padding: 4, fontSize: 10, borderRadius: 4,
                border: '1px solid #334155', cursor: hasCubes ? 'pointer' : 'default',
                background: '#1e293b', color: hasCubes ? '#94a3b8' : '#475569',
              }}
            >
              Push Now
            </button>
            {lastPush && (
              <span style={{ color: '#475569', fontSize: 9 }}>
                {lastPush}
              </span>
            )}
          </div>
        )}

        {linkStatus === 'disconnected' && (
          <div style={{ color: '#475569', fontSize: 9, lineHeight: 1.4 }}>
            Run <code style={{ color: '#60a5fa' }}>python cuboid_bridge_server.py</code> first
          </div>
        )}
      </div>

      {/* Settings (port config) */}
      {showSettings && (
        <div style={{ marginTop: 6, padding: 6, background: '#0f172a', borderRadius: 4, border: '1px solid #1e293b' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: '#64748b' }}>
            Port:
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              style={{
                width: 60, padding: '2px 4px', fontSize: 10,
                background: '#1e293b', border: '1px solid #334155',
                borderRadius: 3, color: '#94a3b8',
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
};
