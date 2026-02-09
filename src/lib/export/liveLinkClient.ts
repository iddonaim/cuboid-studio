/**
 * Live-Link Client — WebSocket bridge to Grasshopper
 * ===================================================
 *
 * Connects the browser to a local Python bridge server via WebSocket.
 * When connected, every assembly change is pushed in real-time so that
 * a running Grasshopper definition can pick it up instantly.
 *
 * Architecture:
 *   Browser (this module)  ──WebSocket──▶  Bridge Server (Python)
 *                                                ▲
 *                                          HTTP polling
 *                                                │
 *                                         GH Python component
 *
 * Usage:
 *   import { liveLinkClient } from './liveLinkClient';
 *   liveLinkClient.connect();     // connect to ws://localhost:9876
 *   liveLinkClient.push(data);    // send assembly state
 *   liveLinkClient.disconnect();  // close connection
 */

import { AssemblyExport } from './assemblyExport';

type LiveLinkStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusListener = (status: LiveLinkStatus) => void;

const DEFAULT_PORT = 9876;
const RECONNECT_DELAY_MS = 3000;

class LiveLinkClient {
  private ws: WebSocket | null = null;
  private _status: LiveLinkStatus = 'disconnected';
  private listeners: Set<StatusListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private autoReconnect = false;
  private port = DEFAULT_PORT;

  get status(): LiveLinkStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: LiveLinkStatus) {
    this._status = status;
    this.listeners.forEach(fn => fn(status));
  }

  /** Connect to the local bridge server. */
  connect(port: number = DEFAULT_PORT): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return; // already connected or connecting
    }

    this.port = port;
    this.autoReconnect = true;
    this.setStatus('connecting');

    try {
      this.ws = new WebSocket(`ws://localhost:${port}`);

      this.ws.onopen = () => {
        this.setStatus('connected');
        console.log(`[LiveLink] Connected to bridge on port ${port}`);
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        this.ws = null;
        if (this.autoReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = () => {
        this.setStatus('error');
      };

      this.ws.onmessage = (event) => {
        // Bridge may send back acknowledgements or requests
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'request_state') {
            // GH is asking for current state — caller should handle this
            console.log('[LiveLink] Bridge requested current state');
          }
        } catch {
          // ignore non-JSON messages
        }
      };
    } catch {
      this.setStatus('error');
      if (this.autoReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  /** Disconnect from the bridge server. */
  disconnect(): void {
    this.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** Push assembly state to the bridge. */
  push(data: AssemblyExport): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      this.ws.send(JSON.stringify({
        type: 'assembly_update',
        payload: data,
      }));
      return true;
    } catch (err) {
      console.error('[LiveLink] Failed to push:', err);
      return false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.autoReconnect) {
        console.log('[LiveLink] Attempting reconnection...');
        this.connect(this.port);
      }
    }, RECONNECT_DELAY_MS);
  }
}

/** Singleton live-link client instance. */
export const liveLinkClient = new LiveLinkClient();
