import { beforeEach, describe, expect, it } from "vitest";

import { useShellStore } from "./shellStore";

const STORAGE_KEY = "agentnexus-shell-store";

describe("useShellStore persist", () => {
  beforeEach(() => {
    localStorage.clear();
    useShellStore.setState({
      activeModule: "prompts",
      query: "",
      selectedIds: [],
      mobilePaneState: "list",
      featureFlags: {},
      mobileSidebarOpen: false,
      mobileDetailOpen: false,
      promptViewMode: "list",
      skillDetailTab: "overview",
      settingsCategory: "general",
      searchHits: [],
    });
  });

  it("partialize 仅持久化关键字段", () => {
    useShellStore.getState().setActiveModule("skills");
    useShellStore.getState().setPromptViewMode("gallery");
    useShellStore.getState().setSkillDetailTab("files");
    useShellStore.getState().setSettingsCategory("security");

    useShellStore.getState().setQuery("query-should-not-persist");
    useShellStore.getState().setSelectedIds(["a", "b"]);
    useShellStore.getState().setMobileDetailOpen(true);
    useShellStore.getState().setSearchHits([
      { module: "prompts", id: "1", title: "t", subtitle: "s" },
    ]);

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();

    const payload = JSON.parse(raw ?? "{}");

    expect(payload.state).toEqual({
      activeModule: "skills",
      promptViewMode: "gallery",
      skillDetailTab: "files",
      settingsCategory: "security",
    });
    expect(Object.keys(payload.state)).toEqual([
      "activeModule",
      "promptViewMode",
      "skillDetailTab",
      "settingsCategory",
    ]);
  });
});
