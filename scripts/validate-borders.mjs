// Validates border overlap flags on an existing region-map.json.
// Run with: npm run validate:borders
import { readFile } from 'node:fs/promises';
import {
  detectMeshOverlaps,
  detectSegmentOverlaps,
  extractBoundarySegments,
} from './borderOverlap.mjs';

const mapPath = new URL('../public/regions/region-map.json', import.meta.url);
const raw = JSON.parse(await readFile(mapPath, 'utf8'));

const regionSegments = extractBoundarySegments(raw.regions.features);
const regionOverlap = detectSegmentOverlaps(regionSegments);
const meshOverlap = detectMeshOverlaps(raw.innerBorders);

const renderedClean = meshOverlap.overlappingSegmentCount === 0;

console.log('Border overlap validation');
console.log('  rendered segments:', meshOverlap.segments.length);
console.log('  rendered overlap=1:', meshOverlap.overlappingSegmentCount);
console.log('  geometry overlap=1:', regionOverlap.overlappingSegmentCount);
console.log(
  '  guarantee:',
  renderedClean
    ? 'PASS — every drawn border segment has overlap=0'
    : 'FAIL — overlapping rendered segments remain',
);

if (!renderedClean) {
  for (const segment of meshOverlap.segments.filter((s) => s.overlap === 1)) {
    console.log(
      '    mesh',
      segment.meshLineIndex,
      'seg',
      segment.segIndex,
      segment.coordinates,
    );
  }
  process.exitCode = 1;
}
