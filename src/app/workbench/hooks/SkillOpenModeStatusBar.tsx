import type { ReactElement } from "react";
import {
  AppWindow,
  ChevronDown,
  Code2,
  Command,
  FileCode2,
  FolderOpen,
  Hammer,
  Sparkles,
  Square,
  Terminal,
} from "lucide-react";

import type { SkillOpenMode } from "../../../shared/types";

function renderSkillOpenModeIcon(mode: SkillOpenMode): ReactElement {
  switch (mode) {
    case "vscode":
      return <FileCode2 className="h-4 w-4" />;
    case "cursor":
      return <Sparkles className="h-4 w-4" />;
    case "zed":
      return <Square className="h-4 w-4" />;
    case "finder":
      return <FolderOpen className="h-4 w-4" />;
    case "terminal":
      return <Terminal className="h-4 w-4" />;
    case "iterm2":
      return <Command className="h-4 w-4" />;
    case "xcode":
      return <Hammer className="h-4 w-4" />;
    case "goland":
      return <Code2 className="h-4 w-4" />;
    default:
      return <AppWindow className="h-4 w-4" />;
  }
}

type SkillOpenModeOption = {
  value: SkillOpenMode;
  label: string;
};

type SkillOpenModeStatusBarProps = {
  skillOpenMenuRef: React.MutableRefObject<HTMLDivElement | null>;
  skillOpenMenuOpen: boolean;
  setSkillOpenMenuOpen: (updater: boolean | ((prev: boolean) => boolean)) => void;
  skillOpenMode: SkillOpenMode;
  setSkillOpenMode: (value: SkillOpenMode) => void;
  skillOpenModeLabel: string;
  selectedSkillOpenModeOption: SkillOpenModeOption;
  skillOpenModeOptions: SkillOpenModeOption[];
};

export function SkillOpenModeStatusBar({
  skillOpenMenuRef,
  skillOpenMenuOpen,
  setSkillOpenMenuOpen,
  skillOpenMode,
  setSkillOpenMode,
  skillOpenModeLabel,
  selectedSkillOpenModeOption,
  skillOpenModeOptions,
}: SkillOpenModeStatusBarProps): ReactElement {
  return (
    <div ref={skillOpenMenuRef} className="relative">
      <button
        type="button"
        className="inline-flex h-8 items-center gap-2 rounded-2xl border border-border/70 bg-background/95 px-1.5 pl-2 shadow-sm backdrop-blur-md transition-colors hover:border-ring/60"
        onClick={() => setSkillOpenMenuOpen((prev) => !prev)}
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {renderSkillOpenModeIcon(selectedSkillOpenModeOption?.value ?? "vscode")}
        </span>
        <span className="text-xs font-medium text-foreground">{skillOpenModeLabel}</span>
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-xl border border-border/70 text-slate-500">
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
      {skillOpenMenuOpen ? (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-56 rounded-2xl border border-border/70 bg-card/95 p-2 shadow-xl backdrop-blur-xl">
          {skillOpenModeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-sm transition-colors ${
                option.value === skillOpenMode
                  ? "bg-primary/12 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
              onClick={() => {
                setSkillOpenMode(option.value);
                setSkillOpenMenuOpen(false);
              }}
            >
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                {renderSkillOpenModeIcon(option.value)}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
