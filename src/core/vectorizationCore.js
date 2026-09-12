import { imageDataToBitmap, traceBitmap, getPaths, calculateAutoThreshold } from '@cadit-app/potrace-ts';
import ImageTracer from 'imagetracerjs';
import ClipperLib from 'clipper-lib';

const COMMON = {
  maxSize: 900, threshold: 128, contrast: 1, blur: 0, noiseRemoval: 0,
  turdSize: 2, alphaMax: 1, optTolerance: 0.15, optCurve: true,
  turnPolicy: 'minority', blackOnWhite: true, minPathArea: 2,
  maxPoints: 6000, maxPaths: 300, curvePrecision: 3, geometryTolerance: 0.15,
  minThickness: 0, modelWidth: 80, timeoutMs: 20000,
};

export const PRESETS = {
  standard: { ...COMMON, maxSize: 600, optTolerance: 0.5, turdSize: 4 },
  high_fidelity: { ...COMMON, maxSize: 1200, optTolerance: 0.08, minPathArea: 1, turdSize: 1 },
  line_art: { ...COMMON, maxSize: 1200, threshold: 140, optTolerance: 0.1 },
  '3d_print': { ...COMMON, minPathArea: 4, minThickness: 0.2 },
};

export function resolveParams(mode, overrides = {}) {
  if (!PRESETS[mode]) throw new Error(`Unknown vectorization mode: ${mode}`);
  const params = { ...PRESETS[mode], ...overrides };
  const ranges = {
    maxSize: [64, 2048], threshold: [-1, 255], contrast: [0.1, 3], blur: [0, 3],
    noiseRemoval: [0, 1], turdSize: [0, 1000], alphaMax: [0, 1.33],
    optTolerance: [0.01, 2], minPathArea: [0, 10000], maxPoints: [100, 12000],
    maxPaths: [1, 500], curvePrecision: [3, 5], geometryTolerance: [0.05, 0.5],
    minThickness: [0, 5], modelWidth: [1, 2000], timeoutMs: [100, 60000],
  };
  for (const [key, [minimum, maximum]] of Object.entries(ranges)) {
    if (!Number.isFinite(params[key]) || params[key] < minimum || params[key] > maximum) {
      throw new Error(`Invalid ${key}: expected ${minimum}..${maximum}`);
    }
  }
  for (const key of ['maxSize', 'maxPoints', 'maxPaths', 'curvePrecision']) {
    if (!Number.isInteger(params[key])) throw new Error(`${key} must be an integer`);
  }
  for (const key of ['blackOnWhite', 'optCurve']) {
    if (typeof params[key] !== 'boolean') throw new Error(`${key} must be boolean`);
  }
  if (!['minority', 'majority', 'black', 'white', 'right'].includes(params.turnPolicy)) {
    throw new Error('Invalid turnPolicy');
  }
  return params;
}

export function preprocess(image, params) {
  const { width, height } = image;
  const gray = new Uint8ClampedArray(width * height);
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    const alpha = image.data[offset + 3] / 255;
    const luminance = 0.2126 * image.data[offset] + 0.7152 * image.data[offset + 1] + 0.0722 * image.data[offset + 2];
    gray[index] = (255 + (luminance - 255) * alpha - 128) * params.contrast + 128;
  }
  let filtered = gray;
  if (params.noiseRemoval || params.blur) {
    filtered = gray.slice();
    const radius = params.noiseRemoval ? 1 : Math.ceil(params.blur);
    const neighbors = [];
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        neighbors.length = 0;
        for (let deltaY = -radius; deltaY <= radius; deltaY++) {
          for (let deltaX = -radius; deltaX <= radius; deltaX++) {
            const sampleY = Math.max(0, Math.min(height - 1, row + deltaY));
            const sampleX = Math.max(0, Math.min(width - 1, column + deltaX));
            neighbors.push(gray[sampleY * width + sampleX]);
          }
        }
        filtered[row * width + column] = params.noiseRemoval
          ? neighbors.sort((first, second) => first - second)[4]
          : neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length;
      }
    }
  }
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < filtered.length; index++) {
    rgba.fill(filtered[index], index * 4, index * 4 + 3);
    rgba[index * 4 + 3] = 255;
  }
  const threshold = params.threshold === -1 ? calculateAutoThreshold({ data: rgba, width, height }) : params.threshold;
  let transitions = 0;
  for (let index = 0; index < filtered.length; index++) {
    const dark = filtered[index] <= threshold;
    const value = dark === params.blackOnWhite ? 0 : 255;
    rgba.fill(value, index * 4, index * 4 + 3);
    if (index % width && value !== rgba[(index - 1) * 4]) transitions++;
  }
  if (transitions > 80000) throw new Error('Image too complex. Reduce resolution or increase noise removal.');
  return { data: rgba, width, height, threshold };
}

const SCALE = 10000;
const point = (value) => ({ X: Math.round(value.x * SCALE), Y: Math.round(value.y * SCALE) });
const same = (first, second) => first.X === second.X && first.Y === second.Y;
const midpoint = (first, second) => ({ x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 });

function distanceToSegment(value, start, end) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = deltaX * deltaX + deltaY * deltaY;
  const ratio = length ? Math.max(0, Math.min(1, ((value.x - start.x) * deltaX + (value.y - start.y) * deltaY) / length)) : 0;
  return Math.hypot(value.x - start.x - ratio * deltaX, value.y - start.y - ratio * deltaY);
}

export function flattenContour(commands, tolerance) {
  const polygon = [point(commands[0])];
  const append = (value) => {
    const next = point(value);
    if (!same(polygon[polygon.length - 1], next)) polygon.push(next);
    if (polygon.length > 30000) throw new Error('Contour exceeds geometry validation budget');
  };
  const cubic = (start, first, second, end, depth = 0) => {
    if (Math.max(distanceToSegment(first, start, end), distanceToSegment(second, start, end)) <= tolerance) {
      append(end);
      return;
    }
    if (depth >= 16) throw new Error('Curve cannot be validated at this precision');
    const firstHalf = midpoint(start, first);
    const middle = midpoint(first, second);
    const lastHalf = midpoint(second, end);
    const left = midpoint(firstHalf, middle);
    const right = midpoint(middle, lastHalf);
    const center = midpoint(left, right);
    cubic(start, firstHalf, left, center, depth + 1);
    cubic(center, right, lastHalf, end, depth + 1);
  };
  let previous = commands[0];
  for (const command of commands.slice(1)) {
    if (command.type === 'CURVE') cubic(previous, { x: command.x1, y: command.y1 }, { x: command.x2, y: command.y2 }, command);
    else append(command);
    previous = command;
  }
  if (polygon.length > 1 && same(polygon[0], polygon[polygon.length - 1])) polygon.pop();
  return polygon;
}

export function hasIntersections(polygons) {
  const edges = [];
  polygons.forEach((polygon, contour) => polygon.forEach((start, index) => {
    const end = polygon[(index + 1) % polygon.length];
    edges.push({ start, end, contour, index, count: polygon.length,
      minX: Math.min(start.X, end.X), maxX: Math.max(start.X, end.X),
      minY: Math.min(start.Y, end.Y), maxY: Math.max(start.Y, end.Y) });
  }));
  edges.sort((first, second) => first.minX - second.minX);
  const cross = (start, end, value) => (end.X - start.X) * (value.Y - start.Y) - (end.Y - start.Y) * (value.X - start.X);
  let checks = 0;
  for (let index = 0; index < edges.length; index++) {
    const first = edges[index];
    for (let next = index + 1; next < edges.length && edges[next].minX <= first.maxX; next++) {
      if (++checks > 2000000) throw new Error('Geometry validation budget exceeded. Reduce resolution.');
      const second = edges[next];
      if (first.maxY < second.minY || second.maxY < first.minY) continue;
      if (first.contour === second.contour && (Math.abs(first.index - second.index) === 1 || Math.abs(first.index - second.index) === first.count - 1)) continue;
      const sideA = Math.sign(cross(first.start, first.end, second.start));
      const sideB = Math.sign(cross(first.start, first.end, second.end));
      const sideC = Math.sign(cross(second.start, second.end, first.start));
      const sideD = Math.sign(cross(second.start, second.end, first.end));
      if (sideA * sideB <= 0 && sideC * sideD <= 0) return true;
    }
  }
  return false;
}

function union(polygons) {
  const clipper = new ClipperLib.Clipper();
  clipper.StrictlySimple = true;
  clipper.AddPaths(polygons, ClipperLib.PolyType.ptSubject, true);
  const result = new ClipperLib.Paths();
  clipper.Execute(ClipperLib.ClipType.ctUnion, result, ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
  return result;
}

function offset(polygons, delta, tolerance) {
  const offsetter = new ClipperLib.ClipperOffset(2, tolerance * SCALE);
  offsetter.AddPaths(polygons, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const result = new ClipperLib.Paths();
  offsetter.Execute(result, delta * SCALE);
  return result;
}

const countPoints = (contours) => contours.reduce((sum, commands) => sum + commands.reduce((count, command) => count + (command.type === 'CURVE' ? 3 : 1), 0), 0);

export function cleanGeometry(input, params, width) {
  const warnings = [];
  let rounded = input.filter(commands => commands.length).map(commands => commands.map(command => Object.fromEntries(Object.entries(command).map(([key, value]) => {
    if (key === 'type') return [key, value];
    if (!Number.isFinite(value)) throw new Error('Non-finite path coordinate');
    return [key, Number(value.toFixed(params.curvePrecision))];
  }))));
  rounded = rounded.map(commands => commands.filter((command, index) => {
    if (!index) return true;
    const previous = commands[index - 1];
    if (command.x !== previous.x || command.y !== previous.y) return true;
    return command.type === 'CURVE' && (command.x1 !== command.x || command.y1 !== command.y || command.x2 !== command.x || command.y2 !== command.y);
  }));
  let polygons = rounded.map(commands => flattenContour(commands, params.geometryTolerance));
  if (polygons.reduce((sum, polygon) => sum + polygon.length, 0) > 30000) throw new Error('Too many geometry samples');
  const seen = new Set();
  const keep = polygons.map(polygon => {
    if (polygon.length < 3) return false;
    let firstIndex = 0;
    polygon.forEach((value, index) => {
      const first = polygon[firstIndex];
      if (value.X < first.X || (value.X === first.X && value.Y < first.Y)) firstIndex = index;
    });
    const forward = polygon.map((value, index) => polygon[(firstIndex + index) % polygon.length]).map(value => `${value.X},${value.Y}`).join(';');
    const backward = polygon.map((value, index) => polygon[(firstIndex - index + polygon.length) % polygon.length]).map(value => `${value.X},${value.Y}`).join(';');
    const key = forward < backward ? forward : backward;
    if (seen.has(key)) return false;
    seen.add(key);
    return Math.abs(ClipperLib.Clipper.Area(polygon)) >= params.minPathArea * SCALE * SCALE || hasIntersections([polygon]);
  });
  let contours = rounded.filter((commands, index) => keep[index]);
  polygons = polygons.filter((polygon, index) => keep[index]);
  if (keep.some(value => !value)) warnings.push('Small, duplicate or degenerate contours removed');
  const intersections = hasIntersections(polygons);
  let minimumX = Infinity;
  let maximumX = -Infinity;
  for (const polygon of polygons) for (const value of polygon) {
    minimumX = Math.min(minimumX, value.X / SCALE);
    maximumX = Math.max(maximumX, value.X / SCALE);
  }
  const drawingWidth = Number.isFinite(maximumX - minimumX) ? maximumX - minimumX : width;
  const thickness = params.minThickness * drawingWidth / params.modelWidth;
  if (intersections || thickness > 0) {
    polygons = union(polygons);
    if (thickness > 0) {
      polygons = offset(offset(polygons, -thickness / 2, params.geometryTolerance), thickness / 2, params.geometryTolerance);
      warnings.push('Minimum thickness filter applied; narrow details may be removed');
    }
    polygons = union(polygons).map(polygon => ClipperLib.Clipper.CleanPolygon(polygon, 0.01 * SCALE))
      .filter(polygon => polygon.length >= 3 && Math.abs(ClipperLib.Clipper.Area(polygon)) >= params.minPathArea * SCALE * SCALE);
    contours = polygons.map(polygon => polygon.map(value => ({ type: 'POINT',
      x: Number((value.X / SCALE).toFixed(params.curvePrecision)), y: Number((value.Y / SCALE).toFixed(params.curvePrecision)) })));
    polygons = contours.map(commands => flattenContour(commands, params.geometryTolerance));
    warnings.push(intersections ? 'Intersecting contours repaired with Clipper' : 'Print contours flattened within geometry tolerance');
  }
  if (hasIntersections(polygons)) throw new Error('Touching or intersecting contours remain. Adjust threshold or minimum thickness.');
  if (!contours.length) throw new Error('No printable contours found. Adjust threshold or minimum detail size.');
  const points = countPoints(contours);
  if (contours.length > params.maxPaths || points > params.maxPoints) throw new Error('Point/path limit exceeded. Increase simplification or remove noise.');
  return { contours, warnings, points, drawingWidth, samples: polygons.reduce((sum, polygon) => sum + polygon.length, 0) };
}

export function serializeSVG(contours, width, height, precision = 3) {
  const number = value => Number(value.toFixed(precision));
  const coordinate = value => `${number(value.x)} ${number(value.y)}`;
  const paths = contours.map(commands => {
    let result = `M${coordinate(commands[0])}`;
    let previous = commands[0];
    for (const command of commands.slice(1)) {
      if (command.type === 'CURVE') {
        result += `C${number(command.x1)} ${number(command.y1)} ${number(command.x2)} ${number(command.y2)} ${coordinate(command)}`;
      } else if (command.x !== previous.x || command.y !== previous.y) result += `L${coordinate(command)}`;
      previous = command;
    }
    return `${result}Z`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><path fill="#000000" fill-rule="evenodd" d="${paths}"/></svg>`;
}

function traceStandard(image, params) {
  const traced = ImageTracer.imagedataToTracedata(image, {
    ltres: params.optTolerance, qtres: params.optTolerance, pathomit: params.turdSize,
    rightangleenhance: true, colorsampling: 0, numberofcolors: 2,
    pal: [{ r: 0, g: 0, b: 0, a: 255 }, { r: 255, g: 255, b: 255, a: 255 }],
  });
  return traced.layers[0].filter(path => path.segments.length).map(path => {
    const first = path.segments[0];
    const commands = [{ type: 'POINT', x: first.x1, y: first.y1 }];
    for (const segment of path.segments) {
      if (segment.type === 'Q') commands.push({ type: 'CURVE',
        x1: segment.x1 + (segment.x2 - segment.x1) * 2 / 3,
        y1: segment.y1 + (segment.y2 - segment.y1) * 2 / 3,
        x2: segment.x3 + (segment.x2 - segment.x3) * 2 / 3,
        y2: segment.y3 + (segment.y2 - segment.y3) * 2 / 3,
        x: segment.x3, y: segment.y3 });
      else commands.push({ type: 'POINT', x: segment.x2, y: segment.y2 });
    }
    return commands;
  });
}

export function vectorize(image, mode, overrides = {}) {
  const started = performance.now();
  const params = resolveParams(mode, overrides);
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 ||
      image.width > params.maxSize || image.height > params.maxSize || image.data.length !== image.width * image.height * 4) {
    throw new Error('Invalid image dimensions or pixel buffer');
  }
  const binary = preprocess(image, params);
  let contours;
  if (mode === 'standard') contours = traceStandard(binary, params);
  else contours = getPaths(traceBitmap(imageDataToBitmap(binary, 128), {
    turnpolicy: params.turnPolicy, turdsize: params.turdSize, alphamax: params.alphaMax,
    optcurve: params.optCurve, opttolerance: params.optTolerance,
  }));
  if (countPoints(contours) > 50000 || contours.length > 2000) throw new Error('Trace too complex. Reduce resolution or remove noise.');
  const geometry = cleanGeometry(contours, params, image.width);
  const svg = serializeSVG(geometry.contours, image.width, image.height, params.curvePrecision);
  if (svg.length > 500000) throw new Error('SVG exceeds 500 KB limit');
  return { svg, binary: binary.data.buffer, stats: {
    algorithm: mode === 'standard' ? 'ImageTracer' : 'Potrace', mode, width: image.width, height: image.height,
    threshold: binary.threshold, points: geometry.points, paths: geometry.contours.length,
    samples: geometry.samples, drawingWidth: geometry.drawingWidth, bytes: svg.length, durationMs: performance.now() - started,
    warnings: geometry.warnings, geometryTolerance: params.geometryTolerance, params,
  } };
}