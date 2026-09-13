#!/bin/bash
# Per-portal build script for Sunbird
# Usage:
#   ./scripts/build-portal.sh poki       → dist/ with Poki SDK
#   ./scripts/build-portal.sh crazy      → dist/ with CrazyGames SDK
#   ./scripts/build-portal.sh standalone → dist/ with no portal SDK (Vercel/Web)

set -euo pipefail
cd "$(dirname "$0")/.."

PLATFORM="${1:-standalone}"

echo "🔨 Building for: $PLATFORM"

# Backup original index.html
cp index.html index.html.bak

case "$PLATFORM" in
  poki)
    sed -i '' 's|</body>|<script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>\n  </body>|' index.html
    ;;
  crazy)
    sed -i '' 's|</body>|<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n  </body>|' index.html
    ;;
  standalone)
    # No SDK injection needed
    ;;
  *)
    echo "Unknown platform: $PLATFORM"
    echo "Usage: $0 [poki|crazy|standalone]"
    rm index.html.bak
    exit 1
    ;;
esac

# Build
npm run build

# Restore original index.html
mv index.html.bak index.html

echo "✅ Build complete: dist/ ($PLATFORM)"
echo "   Upload dist/index.html to the portal dashboard."
