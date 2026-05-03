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

  it("不需要工作区即可渲染模块内容", () => {
    act(() => {
      root.render(<UsageModule l={l} dashboard={<div>usage dashboard</div>} />);
    });
    expect(document.body.textContent).toContain("usage dashboard");
  });
});
