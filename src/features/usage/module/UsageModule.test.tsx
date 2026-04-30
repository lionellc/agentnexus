import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UsageModule } from "./UsageModule";

const l = (zh: string) => zh;

describe("UsageModule", () => {
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

  it("workspace 未激活时展示提示", () => {
    act(() => {
      root.render(<UsageModule l={l} workspaceId={null} />);
    });
    expect(document.body.textContent).toContain("请先创建并激活工作区后再查看模型使用看板");
  });
});
