import type { ReactNode } from "react";

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
};

export function DataTable<T>({ columns, rows, rowKey, onRowClick }: DataTableProps<T>) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-auto">
        <table className="min-w-full border-collapse text-left text-sm">
          <thead className="bg-muted text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={`border-b border-border px-3 py-2 font-semibold ${column.className ?? ""}`}>
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={`group hover:bg-muted/60 ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={`${rowKey(row)}-${column.key}`} className={`border-b border-border px-3 py-2 align-top ${column.className ?? ""}`}>
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
