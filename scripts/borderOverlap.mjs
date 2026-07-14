/**
 * Border segment overlap detection for region-map build.
 * Each segment gets overlap: 0 (clean) or 1 (crosses another segment).
 */

const ENDPOINT_EPS = 2 / 1e4; // match coordinate rounding (~2 units at 1e4 precision)

export function pointsEqual(a, b) {
  return Math.abs(a[0] - b[0]) < ENDPOINT_EPS && Math.abs(a[1] - b[1]) < ENDPOINT_EPS;
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, c) {
  return (
    Math.min(a[0], b[0]) - ENDPOINT_EPS <= c[0] &&
    c[0] <= Math.max(a[0], b[0]) + ENDPOINT_EPS &&
    Math.min(a[1], b[1]) - ENDPOINT_EPS <= c[1] &&
    c[1] <= Math.max(a[1], b[1]) + ENDPOINT_EPS
  );
}

/** True only when segments cross at an interior point on both (X-shaped). */
function segmentsCrossAtInterior(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

export function segmentsProperlyIntersect(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < 1e-12 && onSegment(a, b, c)) return true;
  if (Math.abs(o2) < 1e-12 && onSegment(a, b, d)) return true;
  if (Math.abs(o3) < 1e-12 && onSegment(c, d, a)) return true;
  if (Math.abs(o4) < 1e-12 && onSegment(c, d, b)) return true;
  return false;
}

function segmentEndpoints(s) {
  return [s.a, s.b];
}

function segmentsShareEndpoint(s1, s2) {
  const e1 = segmentEndpoints(s1);
  const e2 = segmentEndpoints(s2);
  for (const p of e1) {
    for (const q of e2) {
      if (pointsEqual(p, q)) return true;
    }
  }
  return false;
}

function isSameUndirectedSegment(s1, s2) {
  return (
    (pointsEqual(s1.a, s2.a) && pointsEqual(s1.b, s2.b)) ||
    (pointsEqual(s1.a, s2.b) && pointsEqual(s1.b, s2.a))
  );
}

function getOuterRings(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates[0]];
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.map((polygon) => polygon[0]);
  }
  return [];
}

/**
 * Extract directed boundary segments from region features.
 * Each segment: { id, regionId, ringIndex, segIndex, overlap, a, b }
 */
export function extractBoundarySegments(regionFeatures) {
  const segments = [];
  let id = 0;

  for (const feature of regionFeatures) {
    const regionId = feature.properties?.region_id ?? 'unknown';
    const adm0_a3 = feature.properties?.adm0_a3 ?? null;
    const rings = getOuterRings(feature.geometry);

    rings.forEach((ring, ringIndex) => {
      for (let i = 0; i < ring.length - 1; i++) {
        segments.push({
          id: id++,
          regionId,
          adm0_a3,
          ringIndex,
          segIndex: i,
          overlap: 0,
          a: ring[i],
          b: ring[i + 1],
        });
      }
    });
  }

  return segments;
}

function segmentBounds(segment) {
  const a = segment.a ?? segment.coordinates[0];
  const b = segment.b ?? segment.coordinates[1];
  return {
    minX: Math.min(a[0], b[0]),
    minY: Math.min(a[1], b[1]),
    maxX: Math.max(a[0], b[0]),
    maxY: Math.max(a[1], b[1]),
  };
}

function boundsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function addSegmentToGrid(grid, segment, cellSize = 2) {
  const bounds = segmentBounds(segment);
  const minCellX = Math.floor(bounds.minX / cellSize);
  const maxCellX = Math.floor(bounds.maxX / cellSize);
  const minCellY = Math.floor(bounds.minY / cellSize);
  const maxCellY = Math.floor(bounds.maxY / cellSize);

  for (let x = minCellX; x <= maxCellX; x++) {
    for (let y = minCellY; y <= maxCellY; y++) {
      const key = `${x},${y}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(segment);
      else grid.set(key, [segment]);
    }
  }
}

function gridNeighborKeys(bounds, cellSize = 2) {
  const keys = new Set();
  const minCellX = Math.floor(bounds.minX / cellSize) - 1;
  const maxCellX = Math.floor(bounds.maxX / cellSize) + 1;
  const minCellY = Math.floor(bounds.minY / cellSize) - 1;
  const maxCellY = Math.floor(bounds.maxY / cellSize) + 1;

  for (let x = minCellX; x <= maxCellX; x++) {
    for (let y = minCellY; y <= maxCellY; y++) {
      keys.add(`${x},${y}`);
    }
  }
  return keys;
}

function collinearOverlapping(a, b, c, d) {
  if (Math.abs(orient(a, b, c)) > 1e-8 || Math.abs(orient(a, b, d)) > 1e-8) {
    return false;
  }

  const useX = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]);
  const proj = (p) => (useX ? p[0] : p[1]);
  const min1 = Math.min(proj(a), proj(b));
  const max1 = Math.max(proj(a), proj(b));
  const min2 = Math.min(proj(c), proj(d));
  const max2 = Math.max(proj(c), proj(d));
  return min1 <= max2 + ENDPOINT_EPS && min2 <= max1 + ENDPOINT_EPS;
}

function segmentEndpointsFromAny(s) {
  if (s.a && s.b) return [s.a, s.b];
  return [s.coordinates[0], s.coordinates[1]];
}

function findSegmentOverlaps(segments, cellSize = 2) {
  const grid = new Map();
  const affectedRegions = new Set();
  let overlapPairs = 0;
  const checkedPairs = new Set();

  for (const segment of segments) {
    addSegmentToGrid(grid, segment, cellSize);
  }

  for (const segment of segments) {
    const [a1, b1] = segmentEndpointsFromAny(segment);
    const bounds = segmentBounds(segment);
    const neighborKeys = gridNeighborKeys(bounds, cellSize);
    const candidates = new Set();

    for (const key of neighborKeys) {
      const bucket = grid.get(key);
      if (!bucket) continue;
      for (const candidate of bucket) {
        candidates.add(candidate);
      }
    }

    for (const other of candidates) {
      if (other.id >= segment.id) continue;

      const pairKey = `${other.id}:${segment.id}`;
      if (checkedPairs.has(pairKey)) continue;
      checkedPairs.add(pairKey);

      const [a2, b2] = segmentEndpointsFromAny(other);

      if (isSameUndirectedSegment({ a: a1, b: b1 }, { a: a2, b: b2 })) continue;
      if (segmentsShareEndpoint({ a: a1, b: b1 }, { a: a2, b: b2 })) continue;
      if (collinearOverlapping(a1, b1, a2, b2)) continue;
      if (
        segment.adm0_a3 &&
        other.adm0_a3 &&
        segment.adm0_a3 !== other.adm0_a3
      ) {
        continue;
      }

      if (
        segment.regionId === other.regionId &&
        segment.ringIndex === other.ringIndex &&
        Math.abs(segment.segIndex - other.segIndex) <= 1
      ) {
        continue;
      }

      if (segmentsCrossAtInterior(a1, b1, a2, b2)) {
        if (segment.overlap === 0) segment.overlap = 1;
        if (other.overlap === 0) other.overlap = 1;
        overlapPairs++;
        if (segment.regionId) affectedRegions.add(segment.regionId);
        if (other.regionId) affectedRegions.add(other.regionId);
      }
    }
  }

  const overlappingSegments = segments.filter((s) => s.overlap === 1);

  return {
    segments,
    overlapPairs,
    overlappingSegmentCount: overlappingSegments.length,
    affectedRegionIds: [...affectedRegions],
    overlappingSegments: overlappingSegments.map((s) => ({
      id: s.id,
      regionId: s.regionId,
      ringIndex: s.ringIndex,
      segIndex: s.segIndex,
      overlap: s.overlap,
    })),
  };
}

/**
 * Mark segments whose interiors cross another segment (overlap = 1).
 * Shared endpoints and duplicate edges are not overlaps.
 */
export function detectSegmentOverlaps(segments) {
  return findSegmentOverlaps(segments);
}

/**
 * Build render-ready border segments from a validated mesh (each arc once).
 */
export function meshToBorderSegments(innerBorders, overlapByMeshIndex = new Map()) {
  const segments = [];
  let id = 0;

  for (let lineIndex = 0; lineIndex < innerBorders.coordinates.length; lineIndex++) {
    const line = innerBorders.coordinates[lineIndex];
    for (let i = 0; i < line.length - 1; i++) {
      segments.push({
        id: id++,
        meshLineIndex: lineIndex,
        segIndex: i,
        overlap: overlapByMeshIndex.get(`${lineIndex}:${i}`) ?? 0,
        coordinates: [line[i], line[i + 1]],
      });
    }
  }

  return segments;
}

export function detectMeshOverlaps(innerBorders) {
  const segments = meshToBorderSegments(innerBorders);
  const overlapByMeshIndex = new Map();
  const result = findSegmentOverlaps(
    segments.map((s) => ({
      ...s,
      regionId: `mesh-${s.meshLineIndex}`,
      ringIndex: 0,
    })),
  );

  for (const segment of result.segments) {
    if (segment.overlap === 1) {
      overlapByMeshIndex.set(`${segment.meshLineIndex}:${segment.segIndex}`, 1);
    }
  }

  return {
    segments: result.segments,
    overlapPairs: result.overlapPairs,
    overlappingSegmentCount: result.overlappingSegmentCount,
    overlapByMeshIndex,
  };
}

/** Remove mesh lines that contain any overlapping segment. */
export function filterMeshByOverlap(innerBorders, overlapByMeshIndex) {
  const cleanCoordinates = innerBorders.coordinates.filter((line, lineIndex) => {
    for (let i = 0; i < line.length - 1; i++) {
      if (overlapByMeshIndex.get(`${lineIndex}:${i}`) === 1) {
        return false;
      }
    }
    return true;
  });

  return {
    type: 'MultiLineString',
    coordinates: cleanCoordinates,
  };
}

export function summarizeOverlapReport(regionResult, meshResult) {
  return {
    regionBoundaryOverlaps: regionResult.overlappingSegmentCount,
    regionOverlapPairs: regionResult.overlapPairs,
    meshOverlaps: meshResult.overlappingSegmentCount,
    meshOverlapPairs: meshResult.overlapPairs,
    affectedRegions: regionResult.affectedRegionIds,
    renderClean: meshResult.overlappingSegmentCount === 0,
    geometryClean: regionResult.overlappingSegmentCount === 0,
    clean:
      regionResult.overlappingSegmentCount === 0 &&
      meshResult.overlappingSegmentCount === 0,
  };
}
