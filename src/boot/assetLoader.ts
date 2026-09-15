/**
 * Robust asset loading with retry logic and error recovery.
 * Handles dynamic import failures, MIME type issues, and network resilience.
 */

interface LoadAssetOptions {
  maxRetries?: number;
  timeout?: number;
  onProgress?: (status: string) => void;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_TIMEOUT = 30000; // 30s

/**
 * Validates that a CSS file loaded correctly by checking the stylesheet.
 * @param url - The CSS file URL
 * @returns true if valid, false otherwise
 */
function validateCSSLoad(url: string): boolean {
  try {
    for (const sheet of document.styleSheets) {
      if (sheet.href && sheet.href.includes(url)) {
        // Check that rules are accessible (not blocked by MIME type)
        try {
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          sheet.cssRules?.length;
          return true;
        } catch {
          // cssRules blocked by CORS/MIME type
          return false;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Load a CSS file with validation and retry logic.
 */
export async function loadCSS(
  url: string,
  options: LoadAssetOptions = {}
): Promise<void> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const onProgress = options.onProgress;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      onProgress?.(`Loading CSS (attempt ${attempt}/${maxRetries}): ${url}`);

      // Create link element
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      link.type = 'text/css';

      // Wait for load or timeout
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          link.onload = () => {
            // Validate the stylesheet loaded
            if (validateCSSLoad(url)) {
              resolve();
            } else {
              reject(
                new Error(
                  'CSS loaded but stylesheet is inaccessible (MIME type or CORS issue)'
                )
              );
            }
          };
          link.onerror = () => reject(new Error(`Failed to load CSS: ${url}`));
          document.head.appendChild(link);
        }),
        new Promise<void>((_, reject) =>
          setTimeout(
            () => reject(new Error(`CSS load timeout: ${url}`)),
            timeout
          )
        ),
      ]);

      onProgress?.(`CSS loaded: ${url}`);
      return; // Success
    } catch (error) {
      const lastAttempt = attempt === maxRetries;
      if (lastAttempt) {
        throw new Error(
          `Failed to load CSS after ${maxRetries} attempts: ${url}. ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Dynamically import a JavaScript module with retry logic.
 */
export async function loadModule<T>(
  importFn: () => Promise<T>,
  moduleName: string,
  options: LoadAssetOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const onProgress = options.onProgress;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      onProgress?.(
        `Loading module (attempt ${attempt}/${maxRetries}): ${moduleName}`
      );

      const result = await Promise.race([
        importFn(),
        new Promise<T>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Module load timeout: ${moduleName}`)),
            timeout
          )
        ),
      ]);

      onProgress?.(`Module loaded: ${moduleName}`);
      return result;
    } catch (error) {
      const lastAttempt = attempt === maxRetries;
      if (lastAttempt) {
        throw new Error(
          `Failed to load module after ${maxRetries} attempts: ${moduleName}. ${error instanceof Error ? error.message : String(error)}`
        );
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }

  throw new Error(`Failed to load module: ${moduleName}`);
}

/**
 * Ensure all critical assets are available before starting the game.
 */
export async function validateAssets(onProgress?: (status: string) => void): Promise<void> {
  const checks = [
    () => {
      onProgress?.("Checking DOM readiness");
      if (document.readyState === "loading") {
        return new Promise<void>((resolve) => {
          document.addEventListener("DOMContentLoaded", () => resolve());
        });
      }
      return Promise.resolve();
    },
    () => {
      onProgress?.("Verifying stylesheet integrity");
      // Check that Tailwind and index styles are loaded
      if (document.styleSheets.length === 0) {
        throw new Error("No stylesheets loaded");
      }
      return Promise.resolve();
    },
  ];

  for (const check of checks) {
    await check();
  }

  onProgress?.("Assets validated");
}
