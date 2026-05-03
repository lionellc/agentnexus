import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

const { toastInfoMock, toastErrorMock, toastCloseMock } = vi.hoisted(() => ({
  toastInfoMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastCloseMock: vi.fn(),
}));

vi.mock("@douyinfe/semi-ui-19", () => ({
  Toast: {
    info: toastInfoMock,
    error: toastErrorMock,
    close: toastCloseMock,
  },
}));

import { useToast } from "./toast";

function ToastTrigger() {
  const { toast } = useToast();
  return (
    <button onClick={() => toast({ title: "Saved" })} type="button">
      Show
    </button>
  );
}

describe("useToast", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("默认 3 秒自动关闭", async () => {
    await act(async () => {
      root.render(<ToastTrigger />);
    });

    await act(async () => {
      container
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(toastInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "Saved",
        duration: 3,
      }),
    );
  });
});
