import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

import { TauriClientError, invokeRaw, toTauriClientError } from "./tauriClient";

describe("toTauriClientError", () => {
  it("映射 string 错误", () => {
    const error = toTauriClientError("network down");

    expect(error).toBeInstanceOf(TauriClientError);
    expect(error.code).toBe("TAURI_INVOKE_ERROR");
    expect(error.message).toBe("network down");
  });

  it("映射嵌套 cause 错误", () => {
    const outer = new Error("outer") as Error & { cause?: unknown };
    outer.cause = { code: "E_CAUSE", message: "bad request" };
    const error = toTauriClientError(outer);

    expect(error.code).toBe("E_CAUSE");
    expect(error.message).toBe("bad request");
  });

  it("映射对象中的 error payload", () => {
    const error = toTauriClientError({ error: { code: "E_INNER", message: "inner failed" } });

    expect(error.code).toBe("E_INNER");
    expect(error.message).toBe("inner failed");
  });

  it("未知结构降级为默认错误", () => {
    const error = toTauriClientError({ foo: "bar" });

    expect(error.code).toBe("TAURI_INVOKE_ERROR");
    expect(error.message).toBe("Tauri invoke failed");
  });
});

describe("invokeRaw", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("透传 invoke 返回值", async () => {
    invokeMock.mockResolvedValueOnce({ ok: true });

    await expect(invokeRaw("cmd", { a: 1 })).resolves.toEqual({ ok: true });
    expect(invokeMock).toHaveBeenCalledWith("cmd", { a: 1 });
  });

  it("抛出映射后的 TauriClientError", async () => {
    invokeMock.mockRejectedValueOnce({ code: "E_RPC", message: "rpc failed" });

    await expect(invokeRaw("cmd")).rejects.toMatchObject({
      name: "TauriClientError",
      code: "E_RPC",
      message: "rpc failed",
    });
  });
});
