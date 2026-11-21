#!/bin/bash
# Archives the app and uploads it to App Store Connect, for TestFlight.
#
# Signs in with an App Store Connect API key when ASC_KEY_PATH (the .p8), ASC_KEY_ID and ASC_ISSUER_ID are set,
# otherwise with the Apple account signed in to Xcode on this Mac.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd .. && npm run build:native)
xcodegen generate

auth=()
if [[ -n "${ASC_KEY_PATH:-}" ]]; then
  auth=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi

# Every upload needs a new build number.
build=$(date -u +%Y%m%d%H%M)
rm -rf build/Tickle.xcarchive build/export
xcodebuild archive -project Tickle.xcodeproj -scheme Tickle -configuration Release \
  -destination 'generic/platform=iOS' -archivePath build/Tickle.xcarchive \
  CURRENT_PROJECT_VERSION="$build" -allowProvisioningUpdates ${auth[@]+"${auth[@]}"}
xcodebuild -exportArchive -archivePath build/Tickle.xcarchive -exportOptionsPlist ExportOptions.plist \
  -exportPath build/export -allowProvisioningUpdates ${auth[@]+"${auth[@]}"}
echo "Uploaded build $build. It shows in TestFlight once App Store Connect has processed it (a few minutes)."
