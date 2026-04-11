import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type Column<T> = {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  className?: string;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  rowSelection?: {
    selectedRowKeys: string[];
    onChange: (keys: string[]) => void;
  };
  columnSettingsKey?: string;
  renderRowActions?: (row: T) => ReactNode;
};

type ColumnSettingsState = {
  order: string[];
  hiddenKeys: string[];
};

const buildDefaultColumnSettings = <T,>(columns: Column<T>[]): ColumnSettingsState => ({
  order: columns.map((column) => column.key),
  hiddenKeys: [],
});

const sanitizeColumnSettings = <T,>(value: ColumnSettingsState | null, columns: Column<T>[]): ColumnSettingsState => {
  const keys = columns.map((column) => column.key);
  const keySet = new Set(keys);
  const defaultValue = buildDefaultColumnSettings(columns);
  if (!value) {
    return defaultValue;
  }

  const order = value.order.filter((key) => keySet.has(key));
  for (const key of keys) {
    if (!order.includes(key)) {
      order.push(key);
    }
  }

  return {
    order,
    hiddenKeys: value.hiddenKeys.filter((key) => keySet.has(key)),
  };
};

const readStoredColumnSettings = <T,>(key: string, columns: Column<T>[]): ColumnSettingsState => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return buildDefaultColumnSettings(columns);
    }
    const parsed = JSON.parse(raw) as ColumnSettingsState;
    if (!Array.isArray(parsed.order) || !Array.isArray(parsed.hiddenKeys)) {
      return buildDefaultColumnSettings(columns);
    }
    return sanitizeColumnSettings(parsed, columns);
  } catch {
    return buildDefaultColumnSettings(columns);
  }
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowSelection,
  columnSettingsKey,
  renderRowActions,
}: DataTableProps<T>) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [columnSettings, setColumnSettings] = useState<ColumnSettingsState>(() =>
    columnSettingsKey ? readStoredColumnSettings(columnSettingsKey, columns) : buildDefaultColumnSettings(columns),
  );
  const headerCheckboxRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setColumnSettings((previous) => sanitizeColumnSettings(previous, columns));
  }, [columns]);

  useEffect(() => {
    if (!columnSettingsKey) {
      return;
    }
    localStorage.setItem(columnSettingsKey, JSON.stringify(columnSettings));
  }, [columnSettings, columnSettingsKey]);

  const visibleColumns = useMemo(() => {
    const hiddenSet = new Set(columnSettings.hiddenKeys);
    const byKey = new Map(columns.map((column) => [column.key, column] as const));
    const orderedColumns = columnSettings.order.map((key) => byKey.get(key)).filter((column): column is Column<T> => Boolean(column));
    return orderedColumns.filter((column) => !hiddenSet.has(column.key));
  }, [columnSettings.hiddenKeys, columnSettings.order, columns]);

  const allRowKeys = useMemo(() => rows.map((row) => rowKey(row)), [rowKey, rows]);
  const selectedRowKeysSet = useMemo(() => new Set(rowSelection?.selectedRowKeys ?? []), [rowSelection?.selectedRowKeys]);
  const selectedVisibleCount = useMemo(
    () => allRowKeys.filter((key) => selectedRowKeysSet.has(key)).length,
    [allRowKeys, selectedRowKeysSet],
  );
  const isAllSelected = allRowKeys.length > 0 && selectedVisibleCount === allRowKeys.length;
  const isPartiallySelected = selectedVisibleCount > 0 && selectedVisibleCount < allRowKeys.length;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isPartiallySelected;
    }
  }, [isPartiallySelected]);

  const moveColumn = (columnKey: string, direction: -1 | 1) => {
    setColumnSettings((previous) => {
      const index = previous.order.indexOf(columnKey);
      if (index < 0) {
        return previous;
      }
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= previous.order.length) {
        return previous;
      }
      const order = [...previous.order];
      const [item] = order.splice(index, 1);
      order.splice(targetIndex, 0, item);
      return { ...previous, order };
    });
  };

  const toggleColumnVisibility = (columnKey: string) => {
    setColumnSettings((previous) => {
      const hiddenSet = new Set(previous.hiddenKeys);
      if (hiddenSet.has(columnKey)) {
        hiddenSet.delete(columnKey);
      } else {
        hiddenSet.add(columnKey);
      }
      return { ...previous, hiddenKeys: Array.from(hiddenSet) };
    });
  };

  const resetColumnSettings = () => {
    setColumnSettings(buildDefaultColumnSettings(columns));
  };

  const handleToggleAllRows = (checked: boolean) => {
    if (!rowSelection) {
      return;
    }
    if (checked) {
      rowSelection.onChange(allRowKeys);
      return;
    }
    rowSelection.onChange([]);
  };

  const handleToggleSingleRow = (rowId: string, checked: boolean) => {
    if (!rowSelection) {
      return;
    }
    const nextKeys = new Set(rowSelection.selectedRowKeys);
    if (checked) {
      nextKeys.add(rowId);
    } else {
      nextKeys.delete(rowId);
    }
    rowSelection.onChange(Array.from(nextKeys));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {columnSettingsKey ? (
        <div className="border-b border-border px-3 py-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 text-xs"
            onClick={() => setIsSettingsOpen((prev) => !prev)}
          >
            列设置
          </button>
          {isSettingsOpen ? (
            <div className="mt-2 rounded-md border border-border bg-background p-2 text-xs">
              <div className="space-y-2">
                {columnSettings.order.map((columnKey, index) => {
                  const column = columns.find((item) => item.key === columnKey);
                  if (!column) {
                    return null;
                  }
                  const checked = !columnSettings.hiddenKeys.includes(columnKey);
                  return (
                    <div key={columnKey} className="flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleColumnVisibility(columnKey)}
                          aria-label={`显示列-${column.title}`}
                        />
                        <span>{column.title}</span>
                      </label>
                      <button
                        type="button"
                        className="rounded border border-border px-1"
                        onClick={() => moveColumn(columnKey, -1)}
                        disabled={index === 0}
                        aria-label={`上移-${column.title}`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="rounded border border-border px-1"
                        onClick={() => moveColumn(columnKey, 1)}
                        disabled={index === columnSettings.order.length - 1}
                        aria-label={`下移-${column.title}`}
                      >
                        ↓
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2">
                <button type="button" className="rounded border border-border px-2 py-1" onClick={resetColumnSettings}>
                  恢复默认
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {rowSelection ? (
                <th className="border-b border-border px-3 py-2 font-semibold">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="全选"
                    checked={isAllSelected}
                    onChange={(event) => handleToggleAllRows(event.target.checked)}
                  />
                </th>
              ) : null}
              {visibleColumns.map((column) => (
                <th key={column.key} className={`border-b border-border px-3 py-2 font-semibold ${column.className ?? ""}`}>
                  {column.title}
                </th>
              ))}
              {renderRowActions ? <th className="border-b border-border px-3 py-2 font-semibold">操作</th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`group hover:bg-muted/60 ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {rowSelection ? (
                  <td className="border-b border-border px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      aria-label={`选择-${rowKey(row)}`}
                      checked={selectedRowKeysSet.has(rowKey(row))}
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => handleToggleSingleRow(rowKey(row), event.target.checked)}
                    />
                  </td>
                ) : null}
                {visibleColumns.map((column) => (
                  <td key={`${rowKey(row)}-${column.key}`} className={`border-b border-border px-3 py-2 align-top ${column.className ?? ""}`}>
                    {column.render(row)}
                  </td>
                ))}
                {renderRowActions ? (
                  <td className="border-b border-border px-3 py-2 align-top" onClick={(event) => event.stopPropagation()}>
                    {renderRowActions(row)}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
