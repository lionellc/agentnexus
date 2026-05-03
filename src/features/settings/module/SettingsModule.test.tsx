import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsModule } from "./SettingsModule";

describe("SettingsModule", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("根据 settingsCategory 渲染 general panel", () => {
    act(() => {
      root.render(
        <SettingsModule
          l={(zh) => zh}
          settingCategories={[
            { key: "general", label: "通用设置" },
            { key: "data", label: "基础设置" },
            { key: "model", label: "AI 模型" },
            { key: "about", label: "关于" },
          ]}
          settingsCategory="general"
          settingsLoading={false}
          onChangeSettingsCategory={vi.fn()}
          generalPanel={<div>general-panel</div>}
          dataPanel={<div>data-panel</div>}
          modelPanel={<div>model-panel</div>}
          aboutPanel={<div>about-panel</div>}
        />,
      );
    });

    expect(container.textContent).toContain("general-panel");
    expect(container.textContent).not.toContain("data-panel");
    expect(container.textContent).not.toContain("model-panel");
    expect(container.textContent).not.toContain("about-panel");
    const selectedTab = container.querySelector('button[role="tab"][aria-selected="true"]');
    expect(selectedTab?.textContent).toContain("通用设置");
  });

  it("根据 settingsCategory 渲染 data / model panel", () => {
    const onChangeSettingsCategory = vi.fn();

    act(() => {
      root.render(
        <SettingsModule
          l={(zh) => zh}
          settingCategories={[
            { key: "general", label: "通用设置" },
            { key: "data", label: "基础设置" },
            { key: "model", label: "AI 模型" },
            { key: "about", label: "关于" },
          ]}
          settingsCategory="data"
          settingsLoading={false}
          onChangeSettingsCategory={onChangeSettingsCategory}
          generalPanel={<div>general-panel</div>}
          dataPanel={<div>data-panel</div>}
          modelPanel={<div>model-panel</div>}
          aboutPanel={<div>about-panel</div>}
        />,
      );
    });

    expect(container.textContent).toContain("data-panel");

    act(() => {
      root.render(
        <SettingsModule
          l={(zh) => zh}
          settingCategories={[
            { key: "general", label: "通用设置" },
            { key: "data", label: "基础设置" },
            { key: "model", label: "AI 模型" },
            { key: "about", label: "关于" },
          ]}
          settingsCategory="model"
          settingsLoading={false}
          onChangeSettingsCategory={onChangeSettingsCategory}
          generalPanel={<div>general-panel</div>}
          dataPanel={<div>data-panel</div>}
          modelPanel={<div>model-panel</div>}
          aboutPanel={<div>about-panel</div>}
        />,
      );
    });

    expect(container.textContent).toContain("model-panel");
  });

  it("根据 settingsCategory 渲染 about panel", () => {
    act(() => {
      root.render(
        <SettingsModule
          l={(zh) => zh}
          settingCategories={[
            { key: "general", label: "通用设置" },
            { key: "data", label: "基础设置" },
            { key: "model", label: "AI 模型" },
            { key: "about", label: "关于" },
          ]}
          settingsCategory="about"
          settingsLoading={false}
          onChangeSettingsCategory={vi.fn()}
          generalPanel={<div>general-panel</div>}
          dataPanel={<div>data-panel</div>}
          modelPanel={<div>model-panel</div>}
          aboutPanel={<div>about-panel</div>}
        />,
      );
    });

    expect(container.textContent).toContain("about-panel");
    expect(container.textContent).not.toContain("general-panel");
    expect(container.textContent).not.toContain("data-panel");
    expect(container.textContent).not.toContain("model-panel");
  });
});
