// Register one <Composition> per short. New shorts: copy src/videos/bridge/ to src/videos/<name>/ and add it here
// (see .claude/skills/cartoon-3d-short/SKILL.md, step 4).
import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { FrostShort, FROST_FRAMES } from "./videos/frost/Frost";

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="FrostShort" component={FrostShort} durationInFrames={FROST_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
