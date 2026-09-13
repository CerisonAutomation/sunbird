#!/bin/bash
# Build all portal versions for Sunbird
# Usage: ./scripts/build-all.sh

set -euo pipefail
cd "$(dirname "$0")/.."

echo "🐦 Building Sunbird for all platforms..."
echo ""

# Backup original index.html
cp index.html index.html.bak

build_portal() {
  local PLATFORM="$1"
  local SDK_TAG="$2"
  local OUTPUT="dist-${PLATFORM}"
  
  echo "🔨 Building for: $PLATFORM"
  
  # Inject SDK if needed
  if [ -n "$SDK_TAG" ]; then
    sed -i '' "s|</body>|${SDK_TAG}\n  </body>|" index.html
  fi
  
  # Build
  npx vite build --outDir "$OUTPUT"
  
  # Restore original index.html
  cp index.html.bak index.html
  
  echo "✅ $PLATFORM: $OUTPUT/"
  echo ""
}

# 1. Poki
build_portal "poki" '<script src="//game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>'

# 2. CrazyGames
build_portal "crazy" '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'

# 3. GamePix
build_portal "gamepix" '<script src="https://gamepix.com/sdk/v2/GamePixSDK.min.js"></script>'

# 4. Y8
build_portal "y8" '<script src="https://sdk.y8.com/html5/y8-sdk.js"></script>'

# 5. Newgrounds
build_portal "newgrounds" '<script src="https://newgrounds.com/portal/api/sdk.js"></script>'

# 6. itch.io (no SDK needed, just standalone)
build_portal "itch" ''

# 7. Standalone (Vercel/custom domain)
build_portal "standalone" ''

# 8. GitHub Pages
build_portal "ghpages" ''

rm -f index.html.bak

echo "🎉 All builds complete!"
echo ""
echo "📁 Build folders:"
ls -la dist-*/
