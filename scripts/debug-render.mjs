// Renders the regional view layers for a UK/NL viewport to debug-render.png
import { readFile, writeFile } from 'node:fs/promises';
import { geoMercator, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import sharp from 'sharp';

const topo = JSON.parse(await readFile('public/countries-110m.json', 'utf8'));
const region = JSON.parse(await readFile('public/regions/region-map.json', 'utf8'));

const countries = feature(topo, topo.objects.countries);

const W = 900;
const H = 900;
const viewport = {
  type: 'Polygon',
  coordinates: [[[-12, 48], [8, 48], [8, 60], [-12, 60], [-12, 48]]],
};

const projection = geoMercator().rotate([-10, 0]).fitExtent(
  [[0, 0], [W, H]],
  viewport,
);
const path = geoPath(projection);

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
svg += `<rect width="${W}" height="${H}" fill="#222"/>`;

svg += '<defs><clipPath id="cc">';
for (const f of countries.features) {
  const d = path(f);
  if (d) svg += `<path d="${d}"/>`;
}
svg += '</clipPath></defs>';

// base country fills
for (const f of countries.features) {
  const d = path(f);
  if (d) svg += `<path d="${d}" fill="#2a2a2a" stroke="none"/>`;
}

// inner region borders (clipped)
svg += '<g clip-path="url(#cc)">';
const ibd = path(region.innerBorders);
if (ibd) svg += `<path d="${ibd}" fill="none" stroke="#f5c518" stroke-width="0.5" stroke-opacity="0.8"/>`;
svg += '</g>';

// city outlines (clipped)
svg += '<g clip-path="url(#cc)">';
for (const f of region.topCities.features) {
  if (f.geometry.type === 'Point') continue;
  const d = path(f);
  if (d) svg += `<path d="${d}" fill="none" stroke="#00e0ff" stroke-width="1.2" stroke-opacity="0.9"/>`;
}
svg += '</g>';

// country borders
for (const f of countries.features) {
  const d = path(f);
  if (d) svg += `<path d="${d}" fill="none" stroke="#f5c518" stroke-width="0.8"/>`;
}

svg += '</svg>';

const png = await sharp(Buffer.from(svg)).png().toBuffer();
await writeFile('debug-render.png', png);
console.log('wrote debug-render.png');
