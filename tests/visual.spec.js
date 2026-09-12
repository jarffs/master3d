import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

const sizes = [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 390, height: 844 }];

test('center cap geometry and colored 3MF', async ({ page }) => {
  await page.goto('/tests/vectorization.html');
  const result = await page.evaluate(async () => {
    const { THREE } = window.testAPI;
    const { CenterCapEngine } = await import('/src/engines/CenterCapEngine.js');
    const { exportTo3MF } = await import('/node_modules/.vite/deps/three-3mf-exporter.js');
    const engine = new CenterCapEngine(new THREE.Scene());
    const measure = () => {
      let volume = 0;
      engine.group.traverse(mesh => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry;
        const position = geometry.attributes.position;
        const count = geometry.index ? geometry.index.count : position.count;
        for (let index = 0; index < count; index += 3) {
          const points = [0, 1, 2].map(offset => new THREE.Vector3().fromBufferAttribute(position, geometry.index ? geometry.index.getX(index + offset) : index + offset));
          volume += points[0].dot(points[1].cross(points[2])) / 6;
        }
      });
      const bounds = new THREE.Box3().setFromObject(engine.group);
      return { volume, size: bounds.getSize(new THREE.Vector3()).toArray(), minZ: bounds.min.z };
    };
    await engine.generate3DModel({ capDiameter: 60 });
    const plain = measure();
    const plainGroup = engine._flattenForExport();
    const plainBlob = await exportTo3MF(plainGroup);
    plainGroup.children.forEach(mesh => mesh.geometry.dispose());
    await engine.generate3DModel({ capDiameter: 75 });
    const resized = measure();
    engine.loadSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0H20V20H0Z M5 5V15H15V5Z" fill-rule="evenodd"/></svg>');
    await engine.generate3DModel({ logoMode: 'engrave', logoScale: 100 });
    const engrave = measure();
    const exportGroup = engine._flattenForExport();
    const colors = exportGroup.children.map(mesh => mesh.material.color.getHexString());
    const blob = await exportTo3MF(exportGroup);
    const archive = Array.from(new Uint8Array(await blob.arrayBuffer()));
    exportGroup.children.forEach(mesh => mesh.geometry.dispose());
    await engine.generate3DModel({ logoMode: 'emboss', logoScale: 100 });
    const emboss = measure();
    const stale = engine.generate3DModel({ capDiameter: 50 });
    const latest = engine.generate3DModel({ capDiameter: 75 });
    const generations = await Promise.all([stale, latest]);
    engine.dispose();
    return { plain, resized, emboss, engrave, colors, archive, generations, plainBytes: plainBlob.size };
  });
  expect(result.plain.size[0]).toBeCloseTo(60, 2);
  expect(result.resized.size[0]).toBeCloseTo(75, 2);
  expect(result.resized.size[2]).toBeCloseTo(result.plain.size[2], 5);
  expect(result.emboss.volume).toBeGreaterThan(result.plain.volume);
  expect(result.engrave.volume).toBeCloseTo(result.plain.volume, 0);
  expect(result.emboss.size[2]).toBeCloseTo(result.plain.size[2] + 0.8, 4);
  expect(result.engrave.size[2]).toBeCloseTo(result.plain.size[2], 4);
  expect(result.emboss.minZ).toBeCloseTo(0, 5);
  expect(result.colors).toEqual(['1a1a1a', 'c0c0c0']);
  const zip = await JSZip.loadAsync(Buffer.from(result.archive));
  const model = await zip.file('3D/3dmodel.model').async('string');
  expect(model).toContain('CenterCap_Logo');
  expect(result.plainBytes).toBeGreaterThan(1000);
  expect(result.generations).toEqual([false, true]);
});

test('center cap upload and responsive preview', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/app.html?tool=center_cap');
  await page.getByRole('button', { name: 'Dimensions', exact: true }).click();
  await expect(page.locator('#capDiameter-slider')).toBeVisible();
  await expect(page.locator('#model-loading')).toBeHidden();
  await expect(page.locator('#printer-profile')).toBeHidden();
  await expect(page.locator('#model-dimensions-section')).toBeHidden();
  await page.locator('#svg-upload').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0H20V5H5V20H0Z"/></svg>') });
  await expect(page.locator('#svg-editor-modal')).toBeVisible();
  await page.locator('#svg-editor-confirm').click();
  await expect(page.locator('#model-loading')).toBeHidden();
  await expect(page.locator('#model-dimensions-section')).toBeHidden();
  for (const size of [sizes[0], sizes[2]]) {
    await page.setViewportSize(size);
    const canvas = page.locator('#canvas-container > canvas').first();
    await canvas.scrollIntoViewIfNeeded();
    const pixels = await canvas.evaluate(async element => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const context = element.getContext('webgl2');
      const data = new Uint8Array(element.width * element.height * 4);
      context.readPixels(0, 0, element.width, element.height, context.RGBA, context.UNSIGNED_BYTE, data);
      let dark = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] < 80 && data[index + 1] < 80 && data[index + 2] < 80 && data[index + 3] > 0) dark++;
      }
      return dark;
    });
    expect(pixels).toBeGreaterThan(100);
    const before = await canvas.screenshot();
    await page.locator('#capDiameter-slider').evaluate(element => {
      element.value = element.value === '75' ? '50' : '75';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect.poll(async () => before.equals(await canvas.screenshot())).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`center-cap-${size.width}.png`), fullPage: true });
  }
  expect(errors).toEqual([]);
});

for (const source of ['text', 'svg', 'png']) {
  test(`split keychain generates from ${source}`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/app.html?tool=keychain_${source === 'text' ? 'text' : 'image'}`);
    await expect(page.locator('#dynamic-controls')).not.toBeEmpty();
    await expect.poll(() => page.locator('#tool-reference-image').evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    if (source === 'text') {
      await expect(page.locator('.upload-group')).toBeHidden();
      await page.locator('#textContent-text').fill('Ana, Bia');
    } else {
      await expect(page.locator('#textContent-text')).toHaveCount(0);
      let buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><path d="M5 5H35V35H5Z M15 15V25H25V15Z" fill-rule="evenodd"/></svg>');
      if (source === 'png') {
        const dataUrl = await page.evaluate(() => {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 100;
          const context = canvas.getContext('2d');
          context.fillStyle = 'white';
          context.fillRect(0, 0, 100, 100);
          context.fillStyle = 'black';
          context.fillRect(20, 20, 60, 60);
          return canvas.toDataURL();
        });
        buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
      }
      await page.locator('#svg-upload').setInputFiles({ name: `keychain.${source}`, mimeType: source === 'svg' ? 'image/svg+xml' : 'image/png', buffer });
      await expect(page.locator('#svg-editor-modal')).toBeVisible();
      await page.locator('#svg-editor-confirm').click();
    }
    await expect(page.locator('#download-btn')).toBeEnabled();
    for (const size of [sizes[0], sizes[2]]) {
      await page.setViewportSize(size);
      const canvas = page.locator('#canvas-container > canvas').first();
      await canvas.scrollIntoViewIfNeeded();
      const visiblePixels = await canvas.evaluate(async element => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const context = element.getContext('webgl2');
        const pixels = new Uint8Array(element.width * element.height * 4);
        context.readPixels(0, 0, element.width, element.height, context.RGBA, context.UNSIGNED_BYTE, pixels);
        let darkPixels = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] < 60 && pixels[index + 1] < 60 && pixels[index + 2] < 60 && pixels[index + 3] > 0) darkPixels++;
        }
        return darkPixels;
      });
      expect(visiblePixels).toBeGreaterThan(100);
      const before = await canvas.screenshot();
      await page.locator('#ringAngle-slider').evaluate(element => {
        element.value = element.value === '90' ? '270' : '90';
        element.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await expect.poll(async () => before.equals(await canvas.screenshot())).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`keychain-${source}-${size.width}.png`), fullPage: true });
    }
    expect(errors).toEqual([]);
  });
}

test('soft visual system is consistent across pages and generator panels', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('language', 'pt'));
  const routes = ['index.html', 'hub.html', ...['cookie_cutter', 'keychain', 'coloring', 'big_letters', 'stamp', 'thermoform', 'brigadeiro_ejector'].map(tool => `app.html?tool=${tool}`)];
  for (const route of routes) {
    await page.goto(`/${route}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(247, 249, 252)');
    if (route.startsWith('app')) await expect(page.locator('#dynamic-controls')).not.toBeEmpty();
    for (const size of sizes) {
      await page.setViewportSize(size);
      const result = await page.evaluate(() => {
        const header = document.querySelector('.navbar, .topbar, body > header');
        const body = getComputedStyle(document.body);
        const overlaps = [];
        const siblings = [...document.querySelectorAll('.sidebar > *')].filter(element => element.getBoundingClientRect().height > 0);
        for (let index = 1; index < siblings.length; index++) {
          if (siblings[index - 1].getBoundingClientRect().bottom > siblings[index].getBoundingClientRect().top + 1) overlaps.push(siblings[index].id || siblings[index].className);
        }
        return { overflow: document.documentElement.scrollWidth > innerWidth + 1,
          font: body.fontFamily, header: getComputedStyle(header).backgroundColor, overlaps };
      });
      expect(result.overflow, `${route}/${size.width}`).toBe(false);
      expect(result.overlaps, `${route}/${size.width}`).toEqual([]);
      expect(result.font).toContain('Manrope');
      expect(result.header).toBe('rgb(255, 255, 255)');
      if (route === 'index.html') {
        const image = page.locator('.tool-card-img').first();
        expect(await image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
        expect((await image.boundingBox()).y).toBeLessThan(size.height);
      }
      if (route.includes('big_letters')) {
        const fits = await page.locator('.fe-canvas-wrapper .canvas-container').evaluate(element => {
          const canvas = element.getBoundingClientRect();
          const wrapper = element.parentElement.getBoundingClientRect();
          return canvas.width > 50 && canvas.left >= wrapper.left && canvas.right <= wrapper.right + 1 && canvas.top >= wrapper.top && canvas.bottom <= wrapper.bottom + 1;
        });
        expect(fits, `Fabric canvas/${size.width}`).toBe(true);
        for (const selector of ['#fe-undo-btn', '#fe-redo-btn', '#fe-font-picker']) {
          const visible = await page.locator(selector).evaluate(element => {
            if (getComputedStyle(element).display === 'none') return true;
            const bounds = element.getBoundingClientRect();
            const toolbar = element.closest('.fe-top-toolbar').getBoundingClientRect();
            return bounds.left >= toolbar.left && bounds.right <= toolbar.right + 1;
          });
          expect(visible, `${selector}/${size.width}`).toBe(true);
        }
        const canvas = page.locator('.fe-canvas-wrapper .upper-canvas');
        const bounds = await canvas.boundingBox();
        await canvas.click({ position: { x: bounds.width / 2, y: bounds.height * 715 / 800 } });
        await expect(page.locator('.fe-layer-item').first()).toHaveClass('fe-layer-item active');
        await canvas.click({ position: { x: bounds.width * 0.05, y: bounds.height * 0.05 } });
        await expect(page.locator('.fe-layer-item.active')).toHaveCount(0);
      }
      await page.screenshot({ path: testInfo.outputPath(`${route.replace(/\W/g, '-')}-${size.width}.png`), fullPage: true, animations: 'disabled' });
    }
  }
  expect(errors).toEqual([]);
});

test('buttons and forms have accessible contrast focus and modal layouts', async ({ page }, testInfo) => {
  await page.goto('/index.html');
  await page.locator('[data-register-cta]').first().click();
  await expect(page.locator('#auth-modal')).toBeVisible();
  const contrast = await page.locator('#auth-submit-btn').evaluate(element => {
    const style = getComputedStyle(element);
    const luminance = color => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.locator('#auth-email').focus();
  await expect(page.locator('#auth-email')).toHaveCSS('border-color', 'rgb(99, 102, 241)');
  for (const size of sizes) {
    await page.setViewportSize(size);
    const fits = await page.locator('#auth-modal .modal-content').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight;
    });
    expect(fits).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`registration-${size.width}.png`) });
  }
});

test('stamp preview stays nonblank and interactive on the light workspace', async ({ page }, testInfo) => {
  await page.goto('/app.html?tool=stamp');
  await expect(page.locator('#dynamic-controls')).not.toBeEmpty();
  await page.locator('#svg-upload').setInputFiles({ name: 'reference.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0H20V20H0Z M5 5V15H15V5Z" fill-rule="evenodd"/></svg>') });
  await expect(page.locator('#svg-editor-modal')).toBeVisible();
  await page.locator('#svg-editor-confirm').click();
  await expect(page.locator('#download-btn')).toBeEnabled();
  for (const size of sizes) {
    await page.setViewportSize(size);
    const canvas = page.locator('#canvas-container > canvas').first();
    await canvas.scrollIntoViewIfNeeded();
    const pixels = await canvas.evaluate(async element => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const context = element.getContext('webgl2');
      const data = new Uint8Array(element.width * element.height * 4);
      context.readPixels(0, 0, element.width, element.height, context.RGBA, context.UNSIGNED_BYTE, data);
      let opaque = 0;
      let colored = 0;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] > 0) opaque++;
        if (data[index + 2] > data[index] + 30 && data[index + 3] > 0) colored++;
      }
      return { opaque: opaque / (element.width * element.height), colored };
    });
    expect(pixels.opaque).toBeGreaterThan(0.02);
    expect(pixels.colored).toBeGreaterThan(30);
    const before = await canvas.screenshot();
    const bounds = await canvas.boundingBox();
    await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + bounds.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.55, { steps: 12 });
    await page.mouse.up();
    const after = await canvas.screenshot();
    expect(before.equals(after)).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`stamp-generated-${size.width}.png`) });
  }
});

test('profile font picker and dialogs share the same light surfaces', async ({ page }, testInfo) => {
  await page.goto('/app.html?tool=stamp');
  await expect(page.locator('#dynamic-controls')).not.toBeEmpty();
  for (const size of sizes) {
    await page.setViewportSize(size);
    for (const id of ['profile-modal', 'text-to-svg-modal']) {
      await page.locator(`#${id}`).evaluate(element => {
        element.classList.remove('hidden');
        element.style.display = 'flex';
      });
      const modal = page.locator(`#${id} .modal-content`);
      await expect(modal).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      const bounds = await modal.boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1);
      expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`${id}-${size.width}.png`) });
      await page.locator(`#${id}`).evaluate(element => {
        element.classList.add('hidden');
        element.style.display = 'none';
      });
    }
    await page.evaluate(async () => {
      const { Dialog } = await import('/src/ui/Dialog.js');
      void Dialog.confirm('Confirmar alteração?');
    });
    await expect(page.locator('#custom-dialog-box')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.locator('#custom-dialog-cancel').click();
    await expect(page.locator('#custom-dialog-overlay')).toBeHidden();
  }
});