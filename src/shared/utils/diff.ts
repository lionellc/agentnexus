export type DiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
};

export function buildLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const max = Math.max(a.length, b.length);
  const result: DiffLine[] = [];

  for (let index = 0; index < max; index += 1) {
    const left = a[index];
    const right = b[index];

    if (left === right) {
      result.push({ type: "unchanged", text: left ?? "" });
      continue;
    }
    if (left !== undefined) {
      result.push({ type: "removed", text: left });
    }
    if (right !== undefined) {
      result.push({ type: "added", text: right });
    }
  }

  return result;
}
