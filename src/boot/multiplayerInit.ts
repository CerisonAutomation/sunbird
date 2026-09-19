/**
 * Multiplayer service initialization with comprehensive error handling.
 * Supports both development (Node reference server) and production (Rust server).
 */

export interface MultiplayerConfig {
  wsUrl: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
}

export interface MultiplayerStatus {
  connected: boolean;
  url: string;
  lastError?: string;
  reconnectCount: number;
}

const DEFAULT_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_DELAY = 2000; // 2s
const DEFAULT_HEARTBEAT_INTERVAL = 30000; // 30s

let wsInstance: WebSocket | null = null;
let connectionStatus: MultiplayerStatus = {
  connected: false,
  url: '',
  reconnectCount: 0,
};

/**
 * Initialize the multiplayer WebSocket connection.
 * Supports same-origin proxy (/mp) which Vite rewrites to the actual WS server.
 */
export async function initializeMultiplayer(
  config: MultiplayerConfig
): Promise<MultiplayerStatus> {
  // Use same-origin /mp path; Vite dev proxy will rewrite it
  const wsUrl =
    process.env.NODE_ENV === 'development'
      ? 'ws://localhost:5173/mp' // Vite will proxy to /ws
      : config.wsUrl; // Production uses relative path or configured URL

  connectionStatus = {
    connected: false,
    url: wsUrl,
    reconnectCount: 0,
  };

  return new Promise((resolve, reject) => {
    const attemptConnection = (attemptNumber: number) => {
      if (attemptNumber > (config.reconnectAttempts ?? DEFAULT_RECONNECT_ATTEMPTS)) {
        const error = new Error(
          `Failed to connect to multiplayer after ${config.reconnectAttempts ?? DEFAULT_RECONNECT_ATTEMPTS} attempts: ${wsUrl}`
        );
        connectionStatus.lastError = error.message;
        reject(error);
        return;
      }

      try {
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          wsInstance = ws;
          connectionStatus.connected = true;
          connectionStatus.lastError = undefined;
          console.log('✅ Multiplayer connected:', wsUrl);

          // Setup heartbeat to keep connection alive
          setupHeartbeat(ws, config.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL);

          resolve(connectionStatus);
        };

        ws.onerror = (event) => {
          console.error('❌ Multiplayer connection error:', event);
          connectionStatus.lastError = `Connection error on attempt ${attemptNumber}`;
          ws.close();
        };

        ws.onclose = () => {
          if (!connectionStatus.connected) {
            // Connection never established, retry
            setTimeout(
              () => attemptConnection(attemptNumber + 1),
              (config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY) * attemptNumber
            );
          } else {
            // Previously connected, attempt reconnection
            console.warn('⚠️  Multiplayer disconnected, attempting reconnection...');
            connectionStatus.connected = false;
            connectionStatus.reconnectCount++;
            setTimeout(
              () => attemptConnection(attemptNumber),
              config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY
            );
          }
        };
      } catch (error) {
        connectionStatus.lastError = `Connection creation error: ${error instanceof Error ? error.message : String(error)}`;
        setTimeout(
          () => attemptConnection(attemptNumber + 1),
          (config.reconnectDelay ?? DEFAULT_RECONNECT_DELAY) * attemptNumber
        );
      }
    };

    attemptConnection(1);
  });
}

/**
 * Setup automatic heartbeat to prevent connection idle timeouts.
 */
function setupHeartbeat(ws: WebSocket, interval: number): void {
  const heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'ping' }));
      } catch (error) {
        console.warn('Failed to send heartbeat:', error);
        clearInterval(heartbeatInterval);
      }
    } else {
      clearInterval(heartbeatInterval);
    }
  }, interval);
}

/**
 * Get the current multiplayer connection status.
 */
export function getMultiplayerStatus(): MultiplayerStatus {
  return { ...connectionStatus };
}

/**
 * Send a message through the multiplayer connection.
 */
export function sendMultiplayerMessage(data: unknown): boolean {
  if (!wsInstance || wsInstance.readyState !== WebSocket.OPEN) {
    console.warn('Multiplayer not connected');
    return false;
  }
  try {
    wsInstance.send(JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Failed to send multiplayer message:', error);
    return false;
  }
}

/**
 * Close the multiplayer connection.
 */
export function closeMultiplayer(): void {
  if (wsInstance) {
    wsInstance.close();
    wsInstance = null;
    connectionStatus.connected = false;
  }
}
