// Register one <Composition> per short. New shorts: copy src/videos/bridge/ to src/videos/<name>/ and add it here
// (see .claude/skills/cartoon-3d-short/SKILL.md, step 4).
import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
