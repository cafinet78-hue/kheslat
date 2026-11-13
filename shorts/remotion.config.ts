import { Config } from "@remotion/cli/config";

// Rendering in a cloud container: use the pre-installed Chromium and software WebGL (no GPU).
// Override with REMOTION_BROWSER / REMOTION_GL (e.g. REMOTION_GL=angle on a desktop with a GPU).
Config.setBrowserExecutable(process.env.REMOTION_BROWSER ?? "/opt/pw-browsers/chromium");
Config.setChromiumOpenGlRenderer((process.env.REMOTION_GL as "swangle" | "angle" | "egl" | undefined) ?? "swangle");
Config.setVideoImageFormat("jpeg");
// Software WebGL is slow (tens of seconds for the first frame): give each frame time.
Config.setDelayRenderTimeoutInMilliseconds(180000);
