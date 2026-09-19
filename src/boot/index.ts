/**
 * Application boot sequence with comprehensive error handling and recovery.
 */

import { loadCSS, loadModule, validateAssets } from './assetLoader';
import { initializeMultiplayer, getMultiplayerStatus } from './multiplayerInit';

export interface BootConfig {
  enableMultiplayer?: boolean;
  multiplayerUrl?: string;
  onProgress?: (status: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Display boot status to the user.
 */
function updateBootStatus(message: string): void {
  const bootContainer = document.getElementById('boot-status');
  if (bootContainer) {
    bootContainer.textContent = message;
    console.log(`🎮 Boot: ${message}`);
  }
}

/**
 * Main boot sequence.
 */
export async function boot(config: BootConfig = {}): Promise<void> {
  const onProgress = config.onProgress ?? updateBootStatus;
  const onError = config.onError ?? ((e) => console.error('Boot error:', e));

  try {
    // Step 1: Validate assets are accessible
    onProgress('Validating assets...');
    await validateAssets(onProgress);

    // Step 2: Ensure critical CSS is loaded
    onProgress('Loading stylesheets...');
    try {
      // The main CSS bundle should already be linked in index.html,
      // but we can validate it here if needed
      await new Promise((resolve) => {
        if (document.styleSheets.length > 0) {
          resolve(null);
        } else {
          // Wait for DOMContentLoaded if styles haven't loaded yet
          document.addEventListener('DOMContentLoaded', () => resolve(null));
        }
      });
    } catch (error) {
      throw new Error(
        `CSS loading failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Step 3: Initialize multiplayer if enabled (non-blocking)
    if (config.enableMultiplayer ?? true) {
      onProgress('Connecting to multiplayer...');
      try {
        await initializeMultiplayer({
          wsUrl: config.multiplayerUrl ?? '/mp',
          reconnectAttempts: 3,
          reconnectDelay: 1000,
        });
        const mpStatus = getMultiplayerStatus();
        onProgress(`Multiplayer connected: ${mpStatus.url}`);
      } catch (error) {
        // Multiplayer is optional; log but continue
        console.warn(
          'Multiplayer initialization failed (continuing without MP):',
          error
        );
        onProgress(
          'Multiplayer unavailable; single-player mode ready',
          'warning'
        );
      }
    }

    // Step 4: Load and initialize the game
    onProgress('Loading game module...');
    const gameModule = await loadModule(
      async () => import('../game'),
      'game',
      { maxRetries: 3, timeout: 30000, onProgress }
    );

    // Step 5: Boot the game
    if (gameModule.boot) {
      onProgress('Initializing game...');
      await gameModule.boot();
      onProgress('Game ready! 🌤️');
    } else {
      throw new Error('Game module missing boot function');
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error('Boot failed:', errorMessage);
    onError(
      error instanceof Error
        ? error
        : new Error(`Boot failed: ${errorMessage}`)
    );

    // Display error to user
    const bootContainer = document.getElementById('boot-status');
    if (bootContainer) {
      bootContainer.innerHTML = `
        <div style="color: #d32f2f; font-weight: bold;">
          <p>❌ Boot failed</p>
          <p style="font-size: 0.9em; margin-top: 0.5em;">${errorMessage}</p>
          <button onclick="location.reload()" style="margin-top: 1em; padding: 0.5em 1em; background: #1976d2; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Try Again
          </button>
        </div>
      `;
    }

    throw error;
  }
}

// Auto-boot on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    boot().catch((error) => {
      console.error('Uncaught boot error:', error);
    });
  });
} else {
  boot().catch((error) => {
    console.error('Uncaught boot error:', error);
  });
}
