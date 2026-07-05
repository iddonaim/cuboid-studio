/**
 * Live-Link Client — HTTP bridge to Grasshopper
 * =============================================
 *
 * Talks to a local Python bridge server over plain HTTP. When active,
 * every assembly change is POSTed so a running Grasshopper definition
 * can pick it up on its next poll.
 *
 * Architecture:
 *   Browser (this module)  ──POST /state──▶  Bridge Server (Python)
 *                                                  ▲
 *                                            GET /state polling
 *                                                  │
 *                                           GH Python component
 *
 * Connection status is heartbeat-based: while active, the client pings
 * GET /status every few seconds. 'connected' means the last ping
 * succeeded; a failed ping drops to 'error' and pinging continues until
 * disconnect() is called.
 *
 * Usage:
 *   import { liveLinkClient } from './liveLinkClient';
 *   liveLinkClient.connect();     // start pinging http://localhost:9876
 *   liveLinkClient.push(data);    // POST assembly state
 *   liveLinkClient.disconnect();  // stop
 */

import { AssemblyExport } from './assemblyExport';

type LiveLinkStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
type StatusListener = (status: LiveLinkStatus) => void;

const DEFAULT_PORT = 9876;
const HEARTBEAT_MS = 3000;
const FETCH_TIMEOUT_MS = 2000;

class LiveLinkClient {
  private _status: LiveLinkStatus = 'disconnected';
  private _active = false;
  private listeners: Set<StatusListener> = new Set();
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private port = DEFAULT_PORT;

  get status(): LiveLinkStatus {
    return this._status;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  /** True between connect() and disconnect(), regardless of server reachability. */
  get isActive(): boolean {
    return this._active;
  }

  /** Subscribe to status changes. Returns unsubscribe function. */
  onStatusChange(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: LiveLinkStatus) {
    if (this._status === status) return;
    this._status = status;
    this.listeners.forEach(fn => fn(status));
  }

  private baseUrl(): string {
    return `http://localhost:${this.port}`;
  }

  /** Start the link: ping the bridge now and keep pinging until disconnect(). */
  connect(port: number = DEFAULT_PORT): void {
    this.port = port;
    if (this._active) return;
    this._active = true;
    this.setStatus('connecting');
    void this.heartbeat();
  }

  /** Stop the link. */
  disconnect(): void {
    this._active = false;
    if (this.heartbeatTimer) {
      clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.setStatus('disconnected');
  }

  /**
   * Push assembly state to the bridge (fire-and-forget).
   * Returns false when the link isn't up; delivery failures surface
   * through the status turning 'error' on the next heartbeat.
   */
  push(data: AssemblyExport): boolean {
    if (!this.isConnected) return false;
    fetch(`${this.baseUrl()}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).catch(err => {
      console.error('[LiveLink] Failed to push:', err);
      if (this._active) this.setStatus('error');
    });
    return true;
  }

  private async heartbeat(): Promise<void> {
    if (!this._active) return;
    try {
      const res = await fetch(`${this.baseUrl()}/status`, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!this._active) return; // disconnected while awaiting
      if (res.ok) {
        if (this._status !== 'connected') {
          console.log(`[LiveLink] Connected to bridge on port ${this.port}`);
        }
        this.setStatus('connected');
      } else {
        this.setStatus('error');
      }
    } catch {
      if (!this._active) return;
      this.setStatus('error');
    }
    this.heartbeatTimer = setTimeout(() => void this.heartbeat(), HEARTBEAT_MS);
  }
}

/** Singleton live-link client instance. */
export const liveLinkClient = new LiveLinkClient();
