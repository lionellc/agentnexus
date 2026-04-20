import { useState } from "react";

import ampIcon from "../../../../assets/platforms/amp.png";
import claudeIcon from "../../../../assets/platforms/claude.png";
import codexIcon from "../../../../assets/platforms/codex.png";
import codebuddyDarkIcon from "../../../../assets/platforms/codebuddy-dark.svg";
import codebuddyLightIcon from "../../../../assets/platforms/codebuddy-light.svg";
import copilotIcon from "../../../../assets/platforms/copilot.png";
import cursorIcon from "../../../../assets/platforms/cursor.png";
import geminiIcon from "../../../../assets/platforms/gemini.png";
import kiroIcon from "../../../../assets/platforms/kiro.png";
import opencodeIcon from "../../../../assets/platforms/opencode.png";
import openclawIcon from "../../../../assets/platforms/openclaw.png";
import qoderIcon from "../../../../assets/platforms/qoder.png";
import rooIcon from "../../../../assets/platforms/roo.png";
import traeIcon from "../../../../assets/platforms/trae.png";
import windsurfIcon from "../../../../assets/platforms/windsurf.png";

type IconSource = string | { light: string; dark: string };

const PLATFORM_ICONS: Record<string, IconSource> = {
  claude: claudeIcon,
  copilot: copilotIcon,
  cursor: cursorIcon,
  windsurf: windsurfIcon,
  kiro: kiroIcon,
  gemini: geminiIcon,
  trae: traeIcon,
  opencode: opencodeIcon,
  codex: codexIcon,
  roo: rooIcon,
  amp: ampIcon,
  openclaw: openclawIcon,
  qoder: qoderIcon,
  codebuddy: {
    light: codebuddyLightIcon,
    dark: codebuddyDarkIcon,
  },
};

export type PlatformPresetIconProps = {
  platformId: string;
  size?: number;
  className?: string;
};

export function PlatformPresetIcon({
  platformId,
  size = 20,
  className = "",
}: PlatformPresetIconProps) {
  const [imageError, setImageError] = useState(false);
  const icon = PLATFORM_ICONS[platformId];

  if (!icon || imageError) {
    const fallbackText = platformId.trim().slice(0, 2).toUpperCase() || "?";
    return (
      <span
        className={`inline-flex items-center justify-center rounded-md bg-slate-200 text-[10px] font-semibold text-slate-700 ${className}`}
        style={{ width: size, height: size }}
      >
        {fallbackText}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden rounded-md ${className}`}
      style={{ width: size, height: size }}
    >
      {typeof icon === "string" ? (
        <img
          src={icon}
          alt={`${platformId} icon`}
          width={size}
          height={size}
          className={`object-contain ${platformId === "copilot" ? "brightness-0 dark:invert" : ""}`}
          onError={() => setImageError(true)}
          loading="lazy"
        />
      ) : (
        <>
          <img
            src={icon.light}
            alt={`${platformId} icon`}
            width={size}
            height={size}
            className="object-contain dark:hidden"
            onError={() => setImageError(true)}
            loading="lazy"
          />
          <img
            src={icon.dark}
            alt={`${platformId} icon`}
            width={size}
            height={size}
            className="hidden object-contain dark:block"
            onError={() => setImageError(true)}
            loading="lazy"
          />
        </>
      )}
    </span>
  );
}
