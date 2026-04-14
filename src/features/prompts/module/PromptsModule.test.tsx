import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PromptsModule } from "./PromptsModule";

describe("PromptsModule", () => {
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

  it("list 视图渲染 center + dialogs", () => {
    act(() => {
      root.render(
        <PromptsModule
          promptDetailView="list"
          promptCenter={<div>center</div>}
          promptDetail={<div>detail</div>}
          createPromptDialog={<div>create-dialog</div>}
          promptRunDialog={<div>run-dialog</div>}
          promptVersionDialog={<div>version-dialog</div>}
        />,
      );
    });

    expect(container.textContent).toContain("center");
    expect(container.textContent).not.toContain("detail");
    expect(container.textContent).toContain("create-dialog");
    expect(container.textContent).toContain("run-dialog");
    expect(container.textContent).toContain("version-dialog");
  });

  it("detail 视图渲染 detail + dialogs", () => {
    act(() => {
      root.render(
        <PromptsModule
          promptDetailView="detail"
          promptCenter={<div>center</div>}
          promptDetail={<div>detail</div>}
          createPromptDialog={<div>create-dialog</div>}
          promptRunDialog={<div>run-dialog</div>}
          promptVersionDialog={<div>version-dialog</div>}
        />,
      );
    });

    expect(container.textContent).not.toContain("center");
    expect(container.textContent).toContain("detail");
    expect(container.textContent).toContain("create-dialog");
    expect(container.textContent).toContain("run-dialog");
    expect(container.textContent).toContain("version-dialog");
  });
});
