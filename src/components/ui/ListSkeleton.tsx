export function ListRowSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-14 rounded-xl bg-[linear-gradient(90deg,rgba(241,245,249,0.8)_0%,rgba(226,232,240,0.95)_50%,rgba(241,245,249,0.8)_100%)] bg-[length:200%_100%] animate-pulse"
        />
      ))}
    </div>
  );
}

export function TableRowsSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <td key={columnIndex} className="px-4 py-3">
              <div
                className="h-4 rounded bg-[linear-gradient(90deg,rgba(241,245,249,0.8)_0%,rgba(226,232,240,0.95)_50%,rgba(241,245,249,0.8)_100%)] bg-[length:200%_100%] animate-pulse"
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
