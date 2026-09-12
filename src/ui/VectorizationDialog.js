import { VectorizationPipeline, PRESETS } from '../core/VectorizationPipeline.js';
import './vectorization.css';

const FIELDS = [
  ['maxSize', 'Resolucao maxima (px)', 64, 2048, 1],
  ['threshold', 'Threshold (-1 = auto)', -1, 255, 1],
  ['contrast', 'Contraste', 0.1, 3, 0.1],
  ['optTolerance', 'Simplificacao (px)', 0.01, 2, 0.01],
  ['alphaMax', 'Suavizacao', 0, 1.33, 0.05],
  ['maxPoints', 'Limite de pontos', 100, 12000, 100],
  ['minPathArea', 'Area minima (px2)', 0, 10000, 1],
  ['turdSize', 'Remover manchas (px2)', 0, 1000, 1],
  ['geometryTolerance', 'Tolerancia geometrica (px)', 0.05, 0.5, 0.05],
  ['curvePrecision', 'Casas decimais', 3, 5, 1],
  ['modelWidth', 'Largura de impressao (mm)', 1, 2000, 1],
  ['minThickness', 'Espessura minima (mm)', 0, 5, 0.05],
];

export function openVectorizationDialog(source, { modelWidth = 80, onApply } = {}) {
  const existing = document.querySelector('.vectorization-dialog');
  existing?.dispatchEvent(new Event('cancel', { cancelable: true }));
  const dialog = document.createElement('dialog');
  dialog.className = 'vectorization-dialog';
  dialog.setAttribute('aria-labelledby', 'vectorization-title');
  dialog.innerHTML = `
    <header><h2 id="vectorization-title">Vetorizar imagem</h2><button type="button" data-action="close" aria-label="Fechar" title="Fechar">&#215;</button></header>
    <form class="vectorization-settings">
      <label>Modo<select name="mode"><option value="standard">Standard / ImageTracer</option><option value="high_fidelity" selected>Alta fidelidade</option><option value="line_art">Line art</option><option value="3d_print">Impressao 3D</option></select></label>
      ${FIELDS.map(([key, label, min, max, step]) => `<label>${label}<input name="${key}" type="number" min="${min}" max="${max}" step="${step}" required></label>`).join('')}
      <label class="vectorization-check"><input name="noiseRemoval" type="checkbox">Filtro de ruido</label>
      <label class="vectorization-check"><input name="invert" type="checkbox">Inverter preto/branco</label>
      <button type="submit">Comparar</button>
    </form>
    <section class="vectorization-comparison" aria-label="Comparacao">
      <figure><figcaption>Original</figcaption><div><img data-preview="original" alt="Imagem original"></div></figure>
      <figure><figcaption>SVG vetorial</figcaption><div><img data-preview="vector" alt="SVG vetorizado"></div></figure>
      <figure><figcaption>SVG rasterizado</figcaption><div><img data-preview="raster" alt="SVG renderizado como raster"></div></figure>
    </section>
    <p class="vectorization-status" role="status" aria-live="polite"></p>
    <p class="vectorization-warnings"></p>
    <div class="vectorization-suggestions"></div>
    <footer><button type="button" data-action="cancel" hidden>Interromper</button><a data-action="download" download="vectorized.svg" hidden>Baixar SVG</a><button type="button" data-action="apply" disabled>Aplicar no editor</button></footer>`;
  document.body.appendChild(dialog);
  const form = dialog.querySelector('form');
  const status = dialog.querySelector('[role="status"]');
  const warnings = dialog.querySelector('.vectorization-warnings');
  const suggestions = dialog.querySelector('.vectorization-suggestions');
  const apply = dialog.querySelector('[data-action="apply"]');
  const download = dialog.querySelector('[data-action="download"]');
  const cancel = dialog.querySelector('[data-action="cancel"]');
  const submit = form.querySelector('button');
  const previousFocus = document.activeElement;
  let pipeline;
  let result;
  let vectorUrl;
  let generation = 0;
  let closed = false;
  const revoke = () => {
    if (vectorUrl) URL.revokeObjectURL(vectorUrl);
    vectorUrl = null;
  };
  const invalidate = () => {
    generation++;
    pipeline?.cancel();
    result = null;
    apply.disabled = true;
    download.hidden = true;
    cancel.hidden = true;
    submit.disabled = false;
    suggestions.replaceChildren();
    for (const name of ['vector', 'raster']) dialog.querySelector(`[data-preview="${name}"]`).removeAttribute('src');
    revoke();
    status.textContent = 'Parametros alterados';
    warnings.textContent = '';
  };
  const setFields = (params) => {
    for (const [key] of FIELDS) form.elements[key].value = params[key];
    form.elements.noiseRemoval.checked = Boolean(params.noiseRemoval);
    form.elements.invert.checked = !params.blackOnWhite;
  };
  const resetMode = () => {
    setFields({ ...PRESETS[form.elements.mode.value], modelWidth });
    invalidate();
  };
  resetMode();
  dialog.querySelector('[data-preview="original"]').src = source;
  form.elements.mode.addEventListener('change', resetMode);
  form.addEventListener('input', invalidate);
  const run = async () => {
    if (!form.reportValidity()) return;
    invalidate();
    const current = generation;
    const params = Object.fromEntries(FIELDS.map(([key]) => [key, Number(form.elements[key].value)]));
    params.noiseRemoval = form.elements.noiseRemoval.checked ? 1 : 0;
    params.blackOnWhite = !form.elements.invert.checked;
    status.textContent = 'Processando...';
    submit.disabled = true;
    cancel.hidden = false;
    try {
      pipeline = new VectorizationPipeline(form.elements.mode.value, params);
      const next = await pipeline.processDetailed(source);
      if (closed || current !== generation) return;
      result = next;
      vectorUrl = URL.createObjectURL(new Blob([next.svg], { type: 'image/svg+xml' }));
      dialog.querySelector('[data-preview="original"]').src = next.original;
      dialog.querySelector('[data-preview="vector"]').src = vectorUrl;
      dialog.querySelector('[data-preview="raster"]').src = next.rasterized;
      download.href = vectorUrl;
      download.hidden = false;
      apply.disabled = false;
      status.textContent = `IoU ${(next.metrics.foregroundIoU * 100).toFixed(2)}% | Erro ${(next.metrics.meanAbsoluteError * 100).toFixed(2)}% | ${next.stats.points} pontos | ${next.stats.paths} contornos | ${(next.stats.bytes / 1024).toFixed(1)} KB | ${Math.round(next.stats.durationMs)} ms`;
      warnings.textContent = [...(next.isColor ? ['Imagem colorida convertida para monocromatico.'] : []), ...next.stats.warnings].join(' ');
      for (const suggestion of next.suggestions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = suggestion.label;
        button.onclick = () => {
          for (const [key, value] of Object.entries(suggestion.params)) form.elements[key].value = value;
          run();
        };
        suggestions.appendChild(button);
      }
    } catch (error) {
      if (!closed && current === generation) status.textContent = error.name === 'AbortError' ? 'Conversao interrompida' : error.message;
    } finally {
      if (!closed && current === generation) {
        submit.disabled = false;
        cancel.hidden = true;
      }
    }
  };
  form.onsubmit = event => { event.preventDefault(); run(); };
  cancel.onclick = () => pipeline?.cancel();
  dialog.showModal();
  run();
  return new Promise(resolve => {
    const finish = value => {
      if (closed) return;
      closed = true;
      generation++;
      pipeline?.cancel();
      revoke();
      dialog.close();
      dialog.remove();
      previousFocus?.focus();
      resolve(value);
    };
    dialog.querySelector('[data-action="close"]').onclick = () => finish(null);
    dialog.oncancel = event => { event.preventDefault(); finish(null); };
    apply.onclick = () => {
      if (result) {
        onApply?.(result);
        finish(result.svg);
      }
    };
  });
}