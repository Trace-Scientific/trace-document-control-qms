export type DiffLine = { kind: "equal" | "added" | "removed"; text: string };
export function diffLines(before: string, after: string): DiffLine[] {
  const left = before.split("\n"),
    right = after.split("\n"),
    matrix = Array.from({ length: left.length + 1 }, () =>
      Array<number>(right.length + 1).fill(0),
    );
  for (let i = left.length - 1; i >= 0; i--)
    for (let j = right.length - 1; j >= 0; j--)
      matrix[i]![j] =
        left[i] === right[j]
          ? matrix[i + 1]![j + 1]! + 1
          : Math.max(matrix[i + 1]![j]!, matrix[i]![j + 1]!);
  const result: DiffLine[] = [];
  let i = 0,
    j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push({ kind: "equal", text: left[i]! });
      i++;
      j++;
    } else if (matrix[i + 1]![j]! >= matrix[i]![j + 1]!) {
      result.push({ kind: "removed", text: left[i++]! });
    } else result.push({ kind: "added", text: right[j++]! });
  }
  while (i < left.length) result.push({ kind: "removed", text: left[i++]! });
  while (j < right.length) result.push({ kind: "added", text: right[j++]! });
  return result;
}
