import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/vectorization.html');
  await page.waitForFunction(() => window.testAPI);
});

test('Potrace fidelity, complexity and exported examples versus ImageTracer', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const source = window.fixture();
    const output = {};
    for (const mode of ['standard', 'high_fidelity', 'line_art', '3d_print']) {
      output[mode] = await new window.testAPI.VectorizationPipeline(mode).processDetailed(source);
    }
    return output;
  });
  console.log('COMPARISON', JSON.stringify(Object.fromEntries(Object.entries(results).map(([mode, result]) => [mode, { ...result.metrics, ...result.stats }]))));
  for (const result of Object.values(results)) {
    expect(result.metrics.foregroundIoU).toBeGreaterThan(0.92);
    expect(result.stats.points).toBeLessThan(6000);
    expect(result.stats.bytes).toBeLessThan(50000);
    expect(result.svg).not.toMatch(/<image|NaN|Infinity/);
    expect((result.svg.match(/M/g) || []).length).toBe((result.svg.match(/Z/g) || []).length);
  }
  expect(results.high_fidelity.svg).toContain('C');
  expect(results.high_fidelity.stats.points).toBeLessThan(results.standard.stats.points);
  expect(results.high_fidelity.metrics.foregroundIoU).toBeGreaterThanOrEqual(results.standard.metrics.foregroundIoU - 0.005);
  const directory = 'docs/vectorization-examples';
  await mkdir(directory, { recursive: true });
  await writeFile(`${directory}/input.png`, Buffer.from(results.high_fidelity.original.split(',')[1], 'base64'));
  for (const [mode, result] of Object.entries(results)) {
    await writeFile(`${directory}/${mode}.svg`, result.svg);
    await writeFile(`${directory}/${mode}.png`, Buffer.from(result.rasterized.split(',')[1], 'base64'));
  }
  await writeFile(`${directory}/metrics.json`, JSON.stringify(Object.fromEntries(Object.entries(results).map(([mode, result]) => [mode, { metrics: result.metrics, stats: result.stats }])), null, 2));
});

test('PNG JPEG WebP, alpha and inversion preserve artwork', async ({ page }) => {
  for (const [kind, format, overrides] of [
    ['drawing', 'image/png', {}], ['drawing', 'image/jpeg', {}], ['drawing', 'image/webp', {}],
    ['transparent', 'image/png', {}], ['inverted', 'image/png', { blackOnWhite: false }],
  ]) {
    const metrics = await page.evaluate(async ({ kind, format, overrides }) => {
      return (await new window.testAPI.VectorizationPipeline('high_fidelity', overrides).processDetailed(window.fixture(kind, 384, format))).metrics;
    }, { kind, format, overrides });
    expect(metrics.foregroundIoU).toBeGreaterThan(0.95);
  }
});

test('nested contours and holes extrude through BaseEngine and export STL', async ({ page }) => {
  for (const mode of ['standard', 'high_fidelity', '3d_print']) {
    const result = await page.evaluate(async (mode) => {
      const { VectorizationPipeline, BaseEngine, THREE, STLExporter } = window.testAPI;
      const output = [];
      for (const kind of ['ring', 'nested']) {
        const svg = await new VectorizationPipeline(mode).process(window.fixture(kind));
        const engine = new BaseEngine(new THREE.Scene());
        const shapes = engine.parseSVG(svg);
        const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 2, bevelEnabled: false, curveSegments: 24 });
        const values = geometry.attributes.position.array;
        const mesh = new THREE.Mesh(geometry);
        const stl = new STLExporter().parse(mesh);
        const edges = new Map();
        const vertices = [];
        for (let index = 0; index < values.length; index += 3) vertices.push([values[index], values[index + 1], values[index + 2]].map(value => value.toFixed(4)).join(','));
        for (let index = 0; index < vertices.length; index += 3) {
          for (let edge = 0; edge < 3; edge++) {
            const key = [vertices[index + edge], vertices[index + (edge + 1) % 3]].sort().join('|');
            edges.set(key, (edges.get(key) || 0) + 1);
          }
        }
        output.push({ kind, shapes: shapes.length, holes: shapes.reduce((sum, shape) => sum + shape.holes.length, 0),
          finite: Array.from(values).every(Number.isFinite), triangles: values.length / 9,
          manifold: [...edges.values()].every(count => count === 2), stl: stl.startsWith('solid') });
        geometry.dispose(); engine.material.dispose();
      }
      return output;
    }, mode);
    for (const output of result) {
      expect(output.holes, `${mode}/${output.kind}`).toBe(1);
      expect(output.shapes).toBe(output.kind === 'nested' ? 2 : 1);
      expect(output.finite).toBe(true);
      expect(output.manifold).toBe(true);
      expect(output.stl).toBe(true);
      expect(output.triangles).toBeGreaterThan(10);
    }
  }
});

test('large raster runs off-thread and remains bounded', async ({ page }) => {
  const result = await page.evaluate(async () => {
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    const output = await new window.testAPI.VectorizationPipeline('high_fidelity').processDetailed(window.fixture('drawing', 3200));
    clearInterval(timer);
    return { ticks, stats: output.stats, metrics: output.metrics };
  });
  expect(result.ticks).toBeGreaterThan(2);
  expect(result.stats.width).toBe(1200);
  expect(result.stats.points).toBeLessThan(6000);
  expect(result.metrics.foregroundIoU).toBeGreaterThan(0.97);
});

test('cancel, invalid inputs, empty images and hard point budget fail explicitly', async ({ page }) => {
  const errors = await page.evaluate(async () => {
    const { VectorizationPipeline } = window.testAPI;
    const failures = [];
    const controller = new AbortController();
    controller.abort();
    const cases = [
      () => new VectorizationPipeline().process(window.fixture(), { signal: controller.signal }),
      () => new VectorizationPipeline().process('data:image/png;base64,broken'),
      () => new VectorizationPipeline().process(window.fixture('blank')),
      () => new VectorizationPipeline('high_fidelity', { maxPoints: 100 }).process(window.fixture()),
      () => new VectorizationPipeline('high_fidelity', { threshold: NaN }),
    ];
    for (const run of cases) {
      try { await run(); failures.push('NO ERROR'); } catch (error) { failures.push(`${error.name}: ${error.message}`); }
    }
    return failures;
  });
  expect(errors[0]).toContain('AbortError');
  expect(errors[1]).toContain('decode');
  expect(errors[2]).toContain('No printable contours');
  expect(errors[3]).toContain('limit exceeded');
  expect(errors[4]).toContain('Invalid threshold');
});

test('geometry detects crossing curves and preprocess preserves neutral contrast', async ({ page }) => {
  const result = await page.evaluate(() => {
    const { core } = window.testAPI;
    const params = core.resolveParams('high_fidelity', { minPathArea: 0 });
    const gray = { width: 1, height: 1, data: new Uint8ClampedArray([140, 140, 140, 255]) };
    const neutral = core.preprocess(gray, params).data[0];
    const crossing = core.hasIntersections([[{ X: 0, Y: 0 }, { X: 100, Y: 100 }, { X: 0, Y: 100 }, { X: 100, Y: 0 }]]);
    const simple = core.hasIntersections([[{ X: 0, Y: 0 }, { X: 100, Y: 0 }, { X: 100, Y: 100 }, { X: 0, Y: 100 }]]);
    return { neutral, crossing, simple };
  });
  expect(result).toEqual({ neutral: 255, crossing: true, simple: false });
});

test('duplicate contours, minimum thickness and in-flight cancellation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { core, VectorizationPipeline } = window.testAPI;
    const rectangle = (left, top, width, height) => [
      { type: 'POINT', x: left, y: top }, { type: 'POINT', x: left + width, y: top },
      { type: 'POINT', x: left + width, y: top + height }, { type: 'POINT', x: left, y: top + height },
    ];
    const shape = rectangle(20, 20, 100, 100);
    const deduplicated = core.cleanGeometry([shape, [...shape].reverse()], core.resolveParams('high_fidelity'), 200);
    const filtered = core.cleanGeometry([shape, rectangle(140, 20, 1, 100)], core.resolveParams('3d_print', { modelWidth: 121, minThickness: 2 }), 200);
    const pipeline = new VectorizationPipeline('high_fidelity');
    const originalTrace = pipeline._traceInWorker.bind(pipeline);
    pipeline._traceInWorker = (...args) => {
      const promise = originalTrace(...args);
      pipeline.cancel();
      return promise;
    };
    let cancelled = false;
    try { await pipeline.process(window.fixture()); } catch (error) { cancelled = error.name === 'AbortError'; }
    return { deduplicated: deduplicated.contours.length, filtered: filtered.contours.length, cancelled };
  });
  expect(result).toEqual({ deduplicated: 1, filtered: 1, cancelled: true });
});

test('a non-responsive worker is terminated by the time budget', async ({ page }) => {
  await page.route('**/vectorization.worker.js*', route => route.fulfill({
    contentType: 'application/javascript', body: 'self.onmessage = () => {};',
  }));
  const message = await page.evaluate(async () => {
    try {
      await new window.testAPI.VectorizationPipeline('high_fidelity', { timeoutMs: 100 }).process(window.fixture());
      return 'NO ERROR';
    } catch (error) { return error.message; }
  });
  expect(message).toContain('timed out');
});

test('comparison dialog works on desktop and mobile without overflow or stale apply', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => { window.testAPI.openVectorizationDialog(window.fixture()); });
    const dialog = page.locator('.vectorization-dialog');
    await expect(dialog.locator('[data-action="apply"]')).toBeEnabled();
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await dialog.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `test-results/vectorization-${viewport.width}.png`, fullPage: true });
    await dialog.locator('[name="threshold"]').fill('130');
    await expect(dialog.locator('[data-action="apply"]')).toBeDisabled();
    await dialog.locator('button[type="submit"]').click();
    await expect(dialog.locator('[data-action="apply"]')).toBeEnabled();
    await dialog.locator('[data-action="close"]').click();
    await expect(dialog).toHaveCount(0);
  }
});

test('benchmark VTracer spline and OpenCV contours with RDP', async ({ page }) => {
  const { vectorize, readImageSync, ColorMode, Hierarchical, PathSimplifyMode } = await import('@neplex/vectorizer');
  const source = await page.evaluate(() => window.fixture());
  const input = Buffer.from(source.split(',')[1], 'base64');
  const options = { colorMode: ColorMode.Binary, hierarchical: Hierarchical.Cutout,
    filterSpeckle: 1, colorPrecision: 6, layerDifference: 5, mode: PathSimplifyMode.Spline,
    cornerThreshold: 60, lengthThreshold: 3.5, maxIterations: 10, spliceThreshold: 45, pathPrecision: 3 };
  const started = performance.now();
  const vtracer = await vectorize(input, options);
  const vtracerMs = performance.now() - started;
  const cvModule = (await import('@techstark/opencv-js')).default;
  let cv;
  if (cvModule instanceof Promise) cv = await cvModule;
  else {
    if (!cvModule.Mat) await new Promise(resolve => { cvModule.onRuntimeInitialized = resolve; });
    cv = cvModule;
  }
  const image = readImageSync(input);
  const cvStarted = performance.now();
  const matrix = cv.matFromArray(image.height, image.width, cv.CV_8UC4, image.pixels);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  let path = '';
  try {
    cv.cvtColor(matrix, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(gray, binary, 128, 255, cv.THRESH_BINARY_INV);
    cv.findContours(binary, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
    for (let index = 0; index < contours.size(); index++) {
      const contour = contours.get(index);
      const simplified = new cv.Mat();
      try {
        cv.approxPolyDP(contour, simplified, 0.5, true);
        if (Math.abs(cv.contourArea(simplified)) < 1) continue;
        for (let offset = 0; offset < simplified.data32S.length; offset += 2) {
          path += `${offset ? 'L' : 'M'}${simplified.data32S[offset] + 0.5} ${simplified.data32S[offset + 1] + 0.5}`;
        }
        path += 'Z';
      } finally { simplified.delete(); contour.delete(); }
    }
  } finally {
    matrix.delete(); gray.delete(); binary.delete(); contours.delete(); hierarchy.delete();
  }
  const opencvMs = performance.now() - cvStarted;
  const opencv = `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384"><path fill="black" fill-rule="evenodd" d="${path}"/></svg>`;
  const results = await page.evaluate(async ({ source, vtracer, opencv }) => {
    const { SVGLoader } = window.testAPI;
    const pipeline = new window.testAPI.VectorizationPipeline('high_fidelity');
    const signal = new AbortController().signal;
    const original = await pipeline._loadAndNormalize(source, 384, signal);
    const results = {};
    for (const [name, svg] of Object.entries({ vtracer, opencv })) {
      const comparison = await pipeline._compare(original, svg, 128, pipeline.params, signal);
      const parsed = new SVGLoader().parse(svg);
      const subpaths = parsed.paths.flatMap(path => path.subPaths);
      const points = subpaths.reduce((sum, path) => sum + 1 + path.curves.reduce((count, curve) => count + (curve.isCubicBezierCurve ? 3 : curve.isQuadraticBezierCurve ? 2 : 1), 0), 0);
      results[name] = { svg, metrics: comparison.metrics, rasterized: comparison.rasterized, points, paths: subpaths.length, bytes: svg.length };
    }
    return results;
  }, { source, vtracer, opencv });
  results.vtracer.durationMs = vtracerMs;
  results.vtracer.params = options;
  results.opencv.durationMs = opencvMs;
  results.opencv.params = { threshold: 128, retrieval: 'RETR_TREE', epsilon: 0.5, closed: true };
  await mkdir('docs/vectorization-examples', { recursive: true });
  const report = {};
  for (const [name, result] of Object.entries(results)) {
    expect(result.metrics.foregroundIoU).toBeGreaterThan(0.8);
    expect(result.svg).not.toMatch(/<image|NaN|Infinity/);
    await writeFile(`docs/vectorization-examples/${name}.svg`, result.svg);
    await writeFile(`docs/vectorization-examples/${name}.png`, Buffer.from(result.rasterized.split(',')[1], 'base64'));
    report[name] = { metrics: result.metrics, points: result.points, paths: result.paths, bytes: result.bytes, durationMs: result.durationMs, params: result.params };
  }
  await writeFile('docs/vectorization-examples/alternatives.json', JSON.stringify(report, null, 2));
  console.log('ALTERNATIVES', JSON.stringify(report));
});