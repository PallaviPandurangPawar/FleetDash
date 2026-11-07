// Frontend/src/canvas/geometry.ts
// Small geometry helpers for the geofence drawing.
type Point = [number, number];

// Which side of the line a-b the point c is on (positive, negative or zero)
function orientation(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/** True when two edges of the closed outline cross each other (a "bow tie" shape). */
export function hasSelfIntersection(points: Point[]): boolean {
  const n = points.length;
  if (n < 4) return false; // a triangle cannot cross itself

  for (let i = 0; i < n; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % n];
    for (let j = i + 1; j < n; j += 1) {
      // edges that share a corner cannot cross
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (a && b && c && d && segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}