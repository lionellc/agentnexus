import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DataTable, type Column } from "./DataTable";

type DemoRow = {
  id: string;
  name: string;
  age: number;
};

const rows: DemoRow[] = [
  { id: "u1", name: "Alice", age: 20 },
  { id: "u2", name: "Bob", age: 30 },
];

const columns: Column<DemoRow>[] = [
  { key: "name", title: "姓名", render: (row) => row.name },
  { key: "age", title: "年龄", render: (row) => String(row.age) },
];

describe("DataTable", () => {
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

  it("支持行多选并处理表头全选和半选", () => {
    const onSelectionChange = vi.fn();

    act(() => {
      root.render(
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          rowSelection={{ selectedRowKeys: [], onChange: onSelectionChange }}
        />,
      );
    });

    const selectAll = container.querySelector('input[aria-label="全选"]') as HTMLInputElement;
    expect(selectAll).toBeTruthy();
    expect(selectAll.checked).toBe(false);
    expect(selectAll.indeterminate).toBe(false);

    act(() => {
      selectAll.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectionChange).toHaveBeenCalledWith(["u1", "u2"]);

    act(() => {
      root.render(
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          rowSelection={{ selectedRowKeys: ["u1"], onChange: onSelectionChange }}
        />,
      );
    });

    const halfSelected = container.querySelector('input[aria-label="全选"]') as HTMLInputElement;
    expect(halfSelected.checked).toBe(false);
    expect(halfSelected.indeterminate).toBe(true);
  });

  it("支持列显隐、顺序调整和恢复默认，并持久化", () => {
    const key = "datatable-columns-test";

    act(() => {
      root.render(<DataTable columns={columns} rows={rows} rowKey={(row) => row.id} columnSettingsKey={key} />);
    });

    const openButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("列设置"));
    expect(openButton).toBeTruthy();

    act(() => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const ageVisibleCheckbox = container.querySelector('input[aria-label="显示列-年龄"]') as HTMLInputElement;
    expect(ageVisibleCheckbox.checked).toBe(true);

    act(() => {
      ageVisibleCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const headersWithoutAge = Array.from(container.querySelectorAll("thead th")).map((node) => node.textContent?.trim() ?? "");
    expect(headersWithoutAge).toEqual(["姓名"]);

    const moveDownName = container.querySelector('button[aria-label="下移-姓名"]') as HTMLButtonElement;
    act(() => {
      moveDownName.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      ageVisibleCheckbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const headersAfterMove = Array.from(container.querySelectorAll("thead th")).map((node) => node.textContent?.trim() ?? "");
    expect(headersAfterMove).toEqual(["年龄", "姓名"]);

    const stored = localStorage.getItem(key);
    expect(stored).toBeTruthy();
    expect(stored).toContain('"order":["age","name"]');

    const resetButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("恢复默认"));
    expect(resetButton).toBeTruthy();
    act(() => {
      resetButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const headersAfterReset = Array.from(container.querySelectorAll("thead th")).map((node) => node.textContent?.trim() ?? "");
    expect(headersAfterReset).toEqual(["姓名", "年龄"]);
  });

  it("行级快捷操作点击不触发行点击", () => {
    const onRowClick = vi.fn();
    const onQuickAction = vi.fn();

    act(() => {
      root.render(
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClick={onRowClick}
          renderRowActions={(row) => (
            <button
              type="button"
              onClick={() => {
                onQuickAction(row.id);
              }}
            >
              快捷操作
            </button>
          )}
        />,
      );
    });

    const actionButton = container.querySelector("tbody button") as HTMLButtonElement;
    expect(actionButton).toBeTruthy();
    act(() => {
      actionButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onQuickAction).toHaveBeenCalledWith("u1");
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
