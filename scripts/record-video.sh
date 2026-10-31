#!/usr/bin/env bash
# Record the demo video: screen-captures the main display while the scripted scene plays through the speakers.
# Put the dashboard full screen on the display you want recorded, start `npm run demo` (or demo:offline), then:
#   bash scripts/record-video.sh            # Ravi, Hindi
#   bash scripts/record-video.sh m002       # Lakshmi, Kannada
# Output: recordings/demo-<stamp>.mov (video + system audio is NOT captured by screencapture; the WAV sits next to it).
# To get narration and Saathi's voice in one file, record with QuickTime (File > New Screen Recording, mic on) instead.
set -euo pipefail
MERCHANT="${1:-m001}"
STAMP="$(date +%Y-%m-%dT%H-%M-%S)"
OUT="recordings/demo-${STAMP}-${MERCHANT}.mov"
mkdir -p recordings
echo "Recording the main display for up to 150 s to ${OUT}. Switch to the dashboard now."
sleep 3
screencapture -v -V 150 -x "${OUT}" &
CAP=$!
npx tsx scripts/record-demo.ts --merchant "${MERCHANT}" --ring-ms 4000 || true
sleep 2
kill -INT "${CAP}" 2>/dev/null || true
wait "${CAP}" 2>/dev/null || true
ls -la "${OUT}" 2>/dev/null && echo "Done. Trim in QuickTime if needed." || echo "No video written: macOS needs Screen Recording permission for your terminal (System Settings > Privacy & Security > Screen Recording)."
