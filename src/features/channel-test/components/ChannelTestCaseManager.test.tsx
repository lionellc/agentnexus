import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChannelApiTestCase } from "../../../shared/types";
import { ChannelTestCaseManager } from "./ChannelTestCaseManager";

const cases: ChannelApiTestCase[] = Array.from({ length: 11 }, (_, index) => ({
  id: `case-${index + 1}`,
  workspaceId: "workspace-1",
  category: "small",
  label: `题目-${String(index + 1).padStart(2, "0")}`,
  messages: [{ role: "user", content: `prompt-${index + 1}` }],
}));

describe("ChannelTestCaseManager", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    vi.clearAllMocks();
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("分页时只展示当前页题目", async () => {
    await act(async () => {
      root.render(
        <ChannelTestCaseManager
          cases={cases}
          loading={false}
          l={(zh) => zh}
          onBack={vi.fn()}
          onSave={vi.fn()}
          onDelete={vi.fn()}
        />,
      );
    });

    expect(document.body.textContent).toContain("题目-01");
    expect(document.body.textContent).not.toContain("题目-11");

    const nextButton = document.body.querySelector(".semi-page-next") as HTMLButtonElement | null;
    await act(async () => {
      nextButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("题目-01");
    expect(document.body.textContent).toContain("题目-11");
  });
});
