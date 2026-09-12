import { test, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/vectorization.html');
  await page.waitForFunction(() => window.testAPI);
});

test('stamp walls avoid per-contour 3D booleans and release previous geometry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { StampEngine } = await import('/src/engines/StampEngine.js');
    const { THREE } = window.testAPI;
    const engine = new StampEngine(new THREE.Scene());
    const params = Object.fromEntries(engine.getControlSchema().map(control => [control.id, control.default]));
    engine.currentSvgShapes = Array.from({ length: 12 }, (_, index) => {
      const shape = new THREE.Shape();
      const centerX = (index % 4) * 10;
      const centerY = Math.floor(index / 4) * 10;
      shape.absarc(centerX, centerY, 3, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(centerX, centerY, 1, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      return shape;
    });
    const started = performance.now();
    await engine.generate3DModel(params);
    const durationMs = performance.now() - started;
    const oldGeometries = new Set();
    engine.group.traverse(object => {
      if (object.geometry) oldGeometries.add(object.geometry);
      for (const part of object.userData.exportParts || []) oldGeometries.add(part.geometry);
    });
    let disposed = 0;
    oldGeometries.forEach(geometry => geometry.addEventListener('dispose', () => disposed++));
    const top = engine.group.children[0].children[0];
    const finite = Array.from(top.geometry.attributes.position.array).every(Number.isFinite);
    const updateStarted = performance.now();
    await engine.generate3DModel({ ...params, wallThickness: 1.2 });
    const updateDurationMs = performance.now() - updateStarted;
    engine.clear();
    return { legacyCSG: Boolean(engine.evaluator), durationMs, updateDurationMs, finite, disposed, previousCount: oldGeometries.size };
  });
  console.log('STAMP', result);
  expect(result.legacyCSG).toBe(false);
  expect(result.durationMs).toBeLessThan(2000);
  expect(result.updateDurationMs).toBeLessThan(2000);
  expect(result.finite).toBe(true);
  expect(result.disposed).toBe(result.previousCount);
});

test('stamp walls preserve thickness and holes and union overlapping contours before extrusion', async ({ page }) => {
  const output = await page.evaluate(async () => {
    const { StampEngine } = await import('/src/engines/StampEngine.js');
    const { THREE, VectorizationPipeline, STLExporter } = window.testAPI;
    const engine = new StampEngine(new THREE.Scene());
    const rectangle = (left, bottom, right, top) => [
      new THREE.Vector2(left, bottom), new THREE.Vector2(right, bottom),
      new THREE.Vector2(right, top), new THREE.Vector2(left, top)
    ];
    const manifold = geometry => {
      const values = geometry.attributes.position.array;
      const edges = new Map();
      for (let offset = 0; offset < values.length; offset += 9) {
        const vertices = [0, 3, 6].map(delta => Array.from(values.slice(offset + delta, offset + delta + 3)).map(value => Number(value.toFixed(4))).join(','));
        for (let edge = 0; edge < 3; edge++) {
          const key = [vertices[edge], vertices[(edge + 1) % 3]].sort().join('|');
          edges.set(key, (edges.get(key) || 0) + 1);
        }
      }
      const invalid = [...edges.entries()].filter(([, count]) => count !== 2);
      if (invalid.length) console.log('STAMP INVALID EDGES', invalid.slice(0, 6));
      return invalid.length === 0;
    };
    const widths = [];
    for (const thickness of [0.2, 0.4, 1.2]) {
      const walls = engine._buildWallShapes([{ shape: rectangle(-10, -10, 10, 10), holes: [rectangle(-4, -4, 4, 4)] }], thickness);
      const outer = walls.reduce((selected, shape) => Math.abs(THREE.ShapeUtils.area(shape.getPoints())) > Math.abs(THREE.ShapeUtils.area(selected.getPoints())) ? shape : selected);
      const outerBox = new THREE.Box2().setFromPoints(outer.getPoints());
      const holeBox = new THREE.Box2().setFromPoints(outer.holes[0].getPoints());
      const geometry = await engine._extrudeWalls(walls, 2);
      geometry.computeBoundingBox();
      widths.push({ thickness: outerBox.max.x - holeBox.max.x - 6, holes: walls.reduce((count, shape) => count + shape.holes.length, 0),
        manifold: manifold(geometry), depth: geometry.boundingBox.max.z - geometry.boundingBox.min.z });
      geometry.dispose();
    }
    const solid = engine._buildWallShapes([{ shape: rectangle(-10, -10, 10, 10), holes: [] }], 0.4);
    const solidArea = solid.reduce((area, shape) => area + Math.abs(THREE.ShapeUtils.area(shape.getPoints())), 0);
    const overlapping = engine._buildWallShapes([
      { shape: rectangle(0, 0, 10, 10), holes: [] }, { shape: rectangle(10.2, 0, 20.2, 10), holes: [] }
    ], 0.4);
    const overlapGeometry = await engine._extrudeWalls(overlapping, 2);
    const overlapManifold = manifold(overlapGeometry);
    overlapGeometry.dispose();
    const svg = await new VectorizationPipeline('high_fidelity').process(window.fixture());
    engine.loadSVG(svg);
    const params = Object.fromEntries(engine.getControlSchema().map(control => [control.id, control.default]));
    const started = performance.now();
    await engine.generate3DModel(params);
    const generatedMs = performance.now() - started;
    const top = engine.group.children[0].children[0];
    const rasterManifold = manifold(top.geometry);
    const stl = new STLExporter().parse(engine.group);
    engine.clear();
    return { widths, solidArea, solidCount: solid.length, solidHoles: solid.reduce((count, shape) => count + shape.holes.length, 0),
      overlapCount: overlapping.length, overlapManifold, rasterManifold, generatedMs, stlValid: stl.startsWith('solid') && !/NaN|Infinity/.test(stl) };
  });
  console.log('STAMP GEOMETRY', output);
  for (const [index, result] of output.widths.entries()) {
    expect(result.thickness).toBeCloseTo([0.2, 0.4, 1.2][index], 3);
    expect(result.holes).toBe(1);
    expect(result.manifold).toBe(true);
    expect(result.depth).toBe(2);
  }
  expect(output.solidCount).toBe(1);
  expect(output.solidHoles).toBe(0);
  expect(output.solidArea).toBeGreaterThanOrEqual(400);
  expect(output.overlapCount).toBe(1);
  expect(output.overlapManifold).toBe(true);
  expect(output.rasterManifold).toBe(true);
  expect(output.stlValid).toBe(true);
  expect(output.generatedMs).toBeLessThan(2000);
});

test('stamp exported STL has closed consistently oriented non-degenerate parts', async ({ page }, testInfo) => {
  const results = await page.evaluate(async () => {
    const { StampEngine } = await import('/src/engines/StampEngine.js');
    const { STLLoader } = await import('/node_modules/three/examples/jsm/loaders/STLLoader.js');
    const { THREE, STLExporter, VectorizationPipeline } = window.testAPI;
    const engine = new StampEngine(new THREE.Scene());
    const reference = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H20V20H0Z M5 5V15H15V5Z" fill-rule="evenodd"/></svg>';
    const params = Object.fromEntries(engine.getControlSchema().map(control => [control.id, control.default]));
    const report = [];
    let lastSTL;
    const inspect = (object, label, binary = true) => {
      const serialized = new STLExporter().parse(object, { binary });
      if (binary) lastSTL = Array.from(new Uint8Array(serialized.buffer));
      const geometry = new STLLoader().parse(binary ? serialized.buffer : serialized);
      const positions = geometry.attributes.position;
      const edges = new Map();
      const faces = new Set();
      let degenerate = 0;
      let duplicateFaces = 0;
      let volume = 0;
      for (let index = 0; index < positions.count; index += 3) {
        const vertices = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(positions, index + offset));
        const keys = vertices.map(vertex => vertex.toArray().map(value => Math.round(value * 100000)).join(','));
        if (new Set(keys).size !== 3 || new THREE.Vector3().subVectors(vertices[1], vertices[0]).cross(new THREE.Vector3().subVectors(vertices[2], vertices[0])).lengthSq() < 1e-16) degenerate++;
        const face = [...keys].sort().join('|');
        if (faces.has(face)) duplicateFaces++;
        faces.add(face);
        volume += vertices[0].dot(new THREE.Vector3().crossVectors(vertices[1], vertices[2])) / 6;
        for (let edge = 0; edge < 3; edge++) {
          const start = keys[edge];
          const end = keys[(edge + 1) % 3];
          const key = [start, end].sort().join('|');
          const record = edges.get(key) || { count: 0, orientation: 0 };
          record.count++;
          record.orientation += start < end ? 1 : -1;
          edges.set(key, record);
        }
      }
      report.push({ part: label, badEdges: [...edges.values()].filter(edge => edge.count !== 2 || edge.orientation !== 0).length, degenerate, duplicateFaces, volume });
      geometry.dispose();
    };
    const raster = await new VectorizationPipeline('high_fidelity').process(window.fixture());
    for (const [name, source] of [['ring', reference], ['raster', raster]]) {
      engine.loadSVG(source);
      for (const thickness of [0.2, 0.4, 1.2]) {
        await engine.generate3DModel({ ...params, wallThickness: thickness, baseThickness: thickness === 0.2 ? 2 : 4 });
        engine.group.updateMatrixWorld(true);
        engine.group.traverse(object => {
          if (object.isMesh) inspect(object, `${name}/${thickness}/${object.name}`);
        });
        inspect(engine.group, `${name}/${thickness}/full`);
        inspect(engine.group, `${name}/${thickness}/ascii`, false);
        const colored = engine._flattenForExport();
        if (colored.children.length !== 4) throw new Error('Missing colored export part');
        if (colored.children[1].material.color.getHexString() !== params.colorTop) {
          if (`#${colored.children[1].material.color.getHexString()}` !== params.colorTop) throw new Error('Export relief color was lost');
        }
        for (const part of colored.children) {
          inspect(part, `${name}/${thickness}/colored/${part.name}`);
          part.geometry.dispose();
        }
        inspect(engine.group, `${name}/${thickness}/reference`);
      }
    }
    engine.clear();
    return { report, lastSTL };
  });
  await writeFile(testInfo.outputPath('stamp-manifold.stl'), Buffer.from(results.lastSTL));
  console.log('STAMP STL', results.report);
  for (const result of results.report) {
    expect(result.badEdges, `part ${result.part}`).toBe(0);
    expect(result.degenerate, `part ${result.part}`).toBe(0);
    expect(result.duplicateFaces, `part ${result.part}`).toBe(0);
    expect(result.volume, `part ${result.part}`).toBeGreaterThan(0);
  }
});

test('stamp preview renders the united solid and rejects stale generation', async ({ page }, testInfo) => {
  await page.evaluate(async () => {
    const { StampEngine } = await import('/src/engines/StampEngine.js');
    const { THREE } = window.testAPI;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eceff1');
    const engine = new StampEngine(scene);
    engine.loadSVG('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H20V20H0Z M5 5V15H15V5Z" fill-rule="evenodd"/></svg>');
    const params = Object.fromEntries(engine.getControlSchema().map(control => [control.id, control.default]));
    const first = engine.generate3DModel(params);
    const second = engine.generate3DModel({ ...params, wallThickness: 0.2 });
    if (await first) throw new Error('Stale generation was applied');
    if (!await second) throw new Error('Latest generation failed');
    const mesh = engine.group.children[0].children[0];
    if (!mesh.geometry.groups.some(group => group.materialIndex === 1)) throw new Error('Relief material was lost');
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    document.body.style.margin = '0';
    document.body.appendChild(renderer.domElement);
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-40, -60, 150);
    scene.add(light, new THREE.HemisphereLight(0xffffff, 0x666666, 2));
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
    const bounds = new THREE.Box3().setFromObject(engine.group);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    window.renderStamp = () => {
      renderer.setSize(innerWidth, innerHeight);
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      const distance = Math.max(size.x / camera.aspect, size.y, size.z) * 2.4;
      camera.position.copy(center).add(new THREE.Vector3(0, -0.7, 1).normalize().multiplyScalar(distance));
      camera.up.set(0, 0, 1);
      camera.lookAt(center);
      renderer.render(scene, camera);
      const pixels = new Uint8Array(innerWidth * innerHeight * 4);
      const context = renderer.getContext();
      context.readPixels(0, 0, innerWidth, innerHeight, context.RGBA, context.UNSIGNED_BYTE, pixels);
      let changed = 0;
      for (let index = 4; index < pixels.length; index += 4) {
        if (pixels[index] !== pixels[0] || pixels[index + 1] !== pixels[1] || pixels[index + 2] !== pixels[2]) changed++;
      }
      return changed / (innerWidth * innerHeight);
    };
  });
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => window.renderStamp())).toBeGreaterThan(0.005);
    await page.screenshot({ path: testInfo.outputPath(`stamp-${viewport.width}.png`) });
  }
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