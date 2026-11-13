# shorts

Remotion project for the `cartoon-3d-short` Claude skill (`../.claude/skills/cartoon-3d-short/SKILL.md`).
It starts with the example short, `BridgeShort` (`src/videos/bridge/`, 1080x1920, 30 fps).

## Setup
```bash
cd shorts
npm ci
pip install numpy scipy pillow   # for the audio and QA scripts
```
Also needed: Node 20+, Python 3, ffmpeg.

Optional: the Kenney CC0 models (Nature Kit + Fantasy Town Kit from kenney.nl) as `public/bridge/kenney/<name>.glb`,
names listed in `KENNEY` in `src/videos/bridge/world.ts`. Without them the scene renders with fewer props.

## Commands
```bash
node scripts/bridge-stills.mjs out/bridge/x_ 100,1200 0.5   # test stills
npm run studio                                               # preview in the browser
npx remotion render src/index.ts BridgeShort out/bridge/video.mp4 --codec h264 --crf 16 --scale 1.3333   # final 2K
```

Defaults are set for a cloud container with no GPU: the pre-installed Chromium and software WebGL. That's fine for
stills and short clips (~14 s per frame at half size), far too slow for a full 2K render. On a computer with a GPU:
```bash
export REMOTION_BROWSER="/path/to/chrome" REMOTION_GL=angle
```

To make a new short, ask Claude: "use the cartoon short skill and make a short about …".
