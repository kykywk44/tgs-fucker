// Plane homographies: fitting one to point correspondences and applying it.
//
// A homography is a 3x3 matrix H, row-major, acting on homogeneous points:
// [x', y', w] = H [x, y, 1], the image being (x'/w, y'/w). The inscription of
// the Cool sticker turns in 3D; one homography per keyframe maps the flat
// letters at keyframe 0 onto that keyframe (verified on the sample to ~0.1 px),
// so new letters can replay the same motion.
// Pure TS: no DOM, never mutates its inputs.

export type Mat3 = [number, number, number, number, number, number, number, number, number]

type Pt = [number, number]

// Points of a fit that make the problem degenerate: a smallest-but-one
// eigenvalue of AᵀA below this share of the largest means more than one
// homography (up to scale) fits the points (collinear points, ...).
const DEGENERATE = 1e-12
// A fitted matrix (unit norm, normalised coordinates) with a smaller
// determinant maps the plane onto (nearly) a line: no usable homography.
const SINGULAR = 1e-9

// Hartley normalisation: moves the centroid to the origin and scales the
// points so that their mean distance from it is √2. Returns the scale and the
// centroid; throws when the points all coincide.
function normalisation(points: Pt[]): { s: number; cx: number; cy: number } {
  let cx = 0
  let cy = 0
  for (const [x, y] of points) {
    cx += x
    cy += y
  }
  cx /= points.length
  cy /= points.length
  let mean = 0
  for (const [x, y] of points) mean += Math.hypot(x - cx, y - cy)
  mean /= points.length
  if (!(mean > 0) || !Number.isFinite(mean)) throw new RangeError('fitHomography: the points all coincide')
  return { s: Math.SQRT2 / mean, cx, cy }
}

// Eigen decomposition of a symmetric n×n matrix (row-major, overwritten) by
// cyclic Jacobi rotations. Returns the eigenvalues and the eigenvectors as the
// columns of a row-major matrix.
function jacobiEigen(a: number[], n: number): { values: number[]; vectors: number[] } {
  const v = Array.from({ length: n * n }, (_, k): number => (k % (n + 1) === 0 ? 1 : 0))
  let scale = 0
  for (const x of a) scale = Math.max(scale, Math.abs(x))
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off = Math.max(off, Math.abs(a[p * n + q]))
    if (off <= 1e-300 || off <= scale * 1e-17) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]
        if (apq === 0) continue
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq)
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        // A <- Pᵀ A P with P = rotation in the (p, q) plane: columns, then rows.
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p]
          const akq = a[k * n + q]
          a[k * n + p] = c * akp - s * akq
          a[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k]
          const aqk = a[q * n + k]
          a[p * n + k] = c * apk - s * aqk
          a[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]
          const vkq = v[k * n + q]
          v[k * n + p] = c * vkp - s * vkq
          v[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }
  return { values: Array.from({ length: n }, (_, k) => a[k * n + k]), vectors: v }
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out = new Array<number>(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
    }
  }
  return out as Mat3
}

function determinant(h: Mat3): number {
  return (
    h[0] * (h[4] * h[8] - h[5] * h[7]) - h[1] * (h[3] * h[8] - h[5] * h[6]) + h[2] * (h[3] * h[7] - h[4] * h[6])
  )
}

/**
 * Least-squares homography mapping `src[n]` onto `dst[n]` (direct linear
 * transform with Hartley normalisation; the solution is the eigenvector of AᵀA
 * with the smallest eigenvalue). Scaled so that h[8] = 1 when it is not near 0,
 * signed so that w > 0 at the source points on average.
 *
 * Throws on fewer than 4 points, lists of different lengths, non-finite
 * coordinates, or a degenerate set (coincident or collinear points, or a fit
 * that collapses the plane).
 */
export function fitHomography(src: [number, number][], dst: [number, number][]): Mat3 {
  if (src.length !== dst.length) {
    throw new RangeError(`fitHomography: ${src.length} source points but ${dst.length} target points`)
  }
  if (src.length < 4) throw new RangeError(`fitHomography: need at least 4 points, got ${src.length}`)
  for (const [x, y] of [...src, ...dst]) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('fitHomography: non-finite coordinate')
  }

  const ns = normalisation(src)
  const nd = normalisation(dst)

  // AᵀA accumulated row by row; every correspondence gives two rows of A.
  const ata = new Array<number>(81).fill(0)
  const addRow = (row: number[]): void => {
    for (let r = 0; r < 9; r++) {
      if (row[r] === 0) continue
      for (let c = 0; c < 9; c++) ata[r * 9 + c] += row[r] * row[c]
    }
  }
  for (let n = 0; n < src.length; n++) {
    const x = (src[n][0] - ns.cx) * ns.s
    const y = (src[n][1] - ns.cy) * ns.s
    const u = (dst[n][0] - nd.cx) * nd.s
    const v = (dst[n][1] - nd.cy) * nd.s
    addRow([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
    addRow([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
  }

  const { values, vectors } = jacobiEigen(ata, 9)
  const order = values.map((_, k) => k).sort((a, b) => values[a] - values[b])
  const largest = Math.max(Math.abs(values[order[8]]), Number.MIN_VALUE)
  if (values[order[1]] < DEGENERATE * largest) {
    throw new RangeError('fitHomography: degenerate point set (collinear points?)')
  }
  const k = order[0]
  const normalised = Array.from({ length: 9 }, (_, r) => vectors[r * 9 + k]) as Mat3
  // A unit-norm matrix in normalised coordinates: the identity has |det| = 3^-1.5 ≈ 0.19.
  if (!(Math.abs(determinant(normalised)) > SINGULAR)) {
    throw new RangeError('fitHomography: degenerate point set (the fit collapses the plane)')
  }

  // H = T_dst⁻¹ · Hn · T_src
  const tSrc: Mat3 = [ns.s, 0, -ns.s * ns.cx, 0, ns.s, -ns.s * ns.cy, 0, 0, 1]
  const tDstInv: Mat3 = [1 / nd.s, 0, nd.cx, 0, 1 / nd.s, nd.cy, 0, 0, 1]
  let h = multiply(tDstInv, multiply(normalised, tSrc))

  const norm = Math.hypot(...h)
  let w = 0
  for (const [x, y] of src) w += h[6] * x + h[7] * y + h[8]
  const sign = w < 0 ? -1 : 1
  const by = sign * h[8] > 1e-12 * norm ? sign * h[8] : norm
  h = h.map((value) => (sign * value) / by) as Mat3
  return h
}

/** Image of `p` under `h`. Throws a RangeError when w ≤ 0 (the point maps to or past infinity). */
export function applyHomography(h: Mat3, p: [number, number]): [number, number] {
  const [x, y] = p
  const w = h[6] * x + h[7] * y + h[8]
  if (!(w > 0)) throw new RangeError(`applyHomography: w = ${w} at (${x}, ${y})`)
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w]
}
