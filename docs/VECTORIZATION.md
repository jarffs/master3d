# Raster para SVG

## Uso

O upload de PNG/JPG/WebP abre o painel **Vetorizar imagem** antes do editor existente. Escolha um modo, ajuste os parametros, compare e use **Aplicar no editor**. SVGs enviados diretamente continuam no fluxo anterior.

- `standard`: ImageTracer, preservado como alternativa explicita.
- `high_fidelity`: Potrace, prioridade para curvas e detalhes. Padrao do painel.
- `line_art`: Potrace, linhas representadas como areas preenchidas, incluindo sua espessura. Nao faz centerline tracing.
- `3d_print`: Potrace + limpeza Clipper + filtro de espessura em mm. Prioriza extrusao.

O painel mostra a imagem normalizada, o SVG vetorial e sua rasterizacao na mesma escala. O original recebido nao e alterado. Imagens coloridas sao convertidas para monocromatico com aviso; nao ha vetorizacao multicolor neste pipeline.

## Implementacao

1. Decodificacao nativa do navegador (PNG/JPG/WebP), composicao do alpha sobre branco e redimensionamento proporcional, sem ampliar entradas pequenas.
2. Transferencia do buffer RGBA para um Web Worker dedicado e terminavel.
3. Luminancia, contraste linear em torno de 128, mediana 3x3 opcional ou blur de caixa opcional; threshold manual ou Otsu. Contraste 1 e neutro.
4. Potrace via API publica de `@cadit-app/potrace-ts` 1.3.0: bitmap, contornos, aproximacao poligonal otimizada, ajuste de curvas cubicas e otimizacao de segmentos. A aproximacao do Potrace cumpre o papel da simplificacao; nao aplicamos RDP sobre as curvas ja ajustadas.
5. Arredondamento de coordenadas, descarte de duplicatas/degeneracoes/manchas, amostragem adaptativa das curvas e deteccao de intersecoes entre segmentos de todos os contornos, inclusive entre furos e areas externas.
6. Quando necessario, uniao even-odd com Clipper (`StrictlySimple`), preservando furos. Para espessura minima, abertura morfologica vetorial: offset negativo seguido de positivo.
7. Revalidacao das coordenadas exportadas, fechamento `Z` de **cada** contorno e SVG compacto com paths reais. Nunca incorpora `<image>`.

Curvas validas permanecem cubicas. Geometrias reparadas ou submetidas ao filtro de espessura sao exportadas como poligonos dentro da tolerancia de amostragem. Nao reajustamos splines nesses poligonos: isso poderia reintroduzir intersecoes. Para manter curvas no modo 3D, use `minThickness: 0` quando o desenho ja tiver a espessura necessaria.

O antigo `setTimeout` nao tirava o processamento da thread principal. Tambem foram removidos o acesso privado ao bitmap de `image-vectorizer` e o fallback automatico que podia bloquear novamente a interface. A dependencia antiga permanece no manifesto para preservar o estado do projeto; nao e importada pelo novo pipeline.

## Parametros

Todos podem ser definidos no construtor ou com `setParam`, sem editar o nucleo. As configuracoes atuais sao obtidas com `getParams`; `setMode` restaura o preset.

| Parametro | Alta fidelidade | Unidade / efeito |
| --- | ---: | --- |
| `maxSize` | 1200 | Maior lado em pixels; limite absoluto 2048 |
| `threshold` | 128 | 0..255; -1 usa Otsu; pixels <= threshold sao escuros |
| `contrast` | 1 | Fator linear, 0.1..3 |
| `noiseRemoval` | 0 | 1 ativa mediana 3x3; pode apagar linhas de 1 pixel |
| `blur` | 0 | Raio de caixa arredondado para cima, 0..3; mediana tem precedencia |
| `turdSize` | 1 | Area de manchas descartadas pelo tracer, em pixels quadrados |
| `minPathArea` | 1 | Area absoluta minima de cada contorno, incluindo furos, em px2 |
| `optTolerance` | 0.08 | Tolerancia do ajuste/otimizacao de curvas; maior reduz detalhes |
| `optCurve` | true | Otimizacao de curvas Potrace |
| `alphaMax` | 1 | Sensibilidade a cantos; 0 favorece poligonos, maior suaviza |
| `turnPolicy` | minority | Resolucao de ambiguidades diagonais no Potrace |
| `maxPoints` | 6000 | Total de ancoras e controles; maximo permitido 12000 |
| `maxPaths` | 300 | Numero de subcontornos, incluindo furos; maximo 500 |
| `curvePrecision` | 3 | Casas decimais, 3..5 |
| `geometryTolerance` | 0.15 | Erro de amostragem das curvas em pixels normalizados |
| `blackOnWhite` | true | false seleciona a regiao clara da imagem |
| `modelWidth` | 80 | Largura do desenho para calculo fisico, em mm, sem margens da imagem |
| `minThickness` | 0 | Espessura de abertura morfologica, em mm; preset 3D: 0.2 |
| `timeoutMs` | 20000 | Prazo do Worker; falha explicita, sem fallback oculto |

O modo standard usa a tolerancia para `ltres`/`qtres` do ImageTracer e nao aplica `alphaMax`, `optCurve` ou `turnPolicy`. `line_art` usa threshold 140 e tolerancia 0.1. O preset 3D usa resolucao 900, area minima 4 e tolerancia 0.15. O standard usa resolucao 600 e tolerancia 0.5.

Limites adicionais: upload de 30 MB, imagem decodificada de 40 megapixels, 80000 transicoes horizontais na mascara, 30000 amostras geometricas, 2 milhoes de comparacoes por validacao e SVG de ate 500 KB. Entradas que excedem os limites falham com uma mensagem para ajustar resolucao/ruido; nao sao truncadas silenciosamente.

```js
import { VectorizationPipeline } from './src/core/VectorizationPipeline.js';

const pipeline = new VectorizationPipeline('high_fidelity', {
  maxSize: 1200, threshold: 128, optTolerance: 0.08,
  minPathArea: 1, maxPoints: 6000,
});
const result = await pipeline.processDetailed(dataUrl, { signal });
// result.svg, stats, metrics, original, rasterized, suggestions
// process(dataUrl) continua retornando apenas a string SVG.
pipeline.cancel();
```

## Comparacao Executada

Fixture deterministica de 384 x 384: curva em S, elipse vazada inclinada, quadrado com cantos e detalhe circular de raio 4 px. Entrada e saidas reais estao em [vectorization-examples](vectorization-examples/input.png). Os testes regeneram os arquivos e os relatorios JSON.

| Algoritmo / modo | IoU de tinta | Erro tonal medio | Pontos* | SVG |
| --- | ---: | ---: | ---: | ---: |
| ImageTracer / standard | 97.06% | 0.303% | 296 | 3162 bytes |
| Potrace / high_fidelity | 96.70% | 0.269% | 232 | 3519 bytes |
| Potrace / line_art | 95.72% | 0.298% | 220 | 3350 bytes |
| Potrace + Clipper / 3d_print | 95.82% | 0.308% | 414 | 6490 bytes |
| VTracer / spline | 87.69% | 0.873% | 257 | 3996 bytes |
| OpenCV contours + RDP | 93.02% | 0.699% | 458 | 5488 bytes |

*Ancoras e controles, nao pixels de contorno. Para as alternativas a contagem e feita pelo SVGLoader, que tambem pode materializar o segmento de fechamento. Tempos ficam nos JSON; Potrace/ImageTracer foram executados no Worker do Chromium, VTracer nativo e OpenCV WASM no Node. Tempos entre esses ambientes **nao sao um benchmark direto de velocidade no navegador**.

Potrace foi escolhido por reduzir pontos em aproximadamente 22% frente ao standard nesta fixture, reduzir o erro tonal em aproximadamente 11%, preservar curvas cubicas/furos e oferecer API publica de Worker com pequena dependencia. Nao venceu em todas as metricas: o ImageTracer teve IoU binaria um pouco melhor e SVG menor. Por isso o modo standard continua disponivel.

Alternativas efetivamente testadas:

- ImageTracer.js 1.2.6: duas cores fixas, `ltres=qtres=0.5`, `pathomit=4`; quadratica convertida exatamente em cubica para compartilhar a validacao.
- VTracer via `@neplex/vectorizer` 0.1.0: binary, spline, speckle 1, corner 60, length 3.5, iterations 10, splice 45, precision 3. Neste ensaio deformou mais a linha fina. Nao houve busca exaustiva de parametros nem benchmark do port WASM no browser.
- OpenCV.js 5.0: threshold 128, `RETR_TREE`, `CHAIN_APPROX_SIMPLE`, `approxPolyDP` fechado com epsilon 0.5. Preserva hierarquia, mas a saida poligonal necessitaria de outro ajuste de curvas e nova validacao. Coordenadas foram deslocadas 0.5 px para centros de pixels.
- Potrace: simplificacao poligonal e ajuste Bezier integrados; Clipper 6.4.2 para reparo/offset. Evita manter dois ajustadores geometricos independentes no caminho principal.

Os pacotes VTracer/OpenCV sao dependencias de desenvolvimento para repetir o benchmark. Nao entram no bundle de producao.

## Ajuste de Qualidade

IoU compara a intersecao/uniao dos pixels de tinta do SVG renderizado contra a luminancia original no threshold escolhido. O erro tonal medio compara luminancia original (invertida quando solicitado) com o SVG rasterizado, normalizado por 255. O percentual de pixels diferentes tambem esta na API. As metricas usam a imagem **normalizada**, nao a resolucao original descartada; nao medem manifoldness nem garantem semelhanca perceptual em fotografias.

Quando IoU < 98%, o painel sugere experimentar Otsu ou menor tolerancia. Proximo do limite de pontos, sugere maior tolerancia. As sugestoes sao heuristicas e so sao aplicadas por clique; a nova comparacao mostra se melhoraram. Nao existe ajuste automatico oculto que destrua detalhes.

Para linhas finas: alta fidelidade, blur/mediana desligados, area minima 1 e mais resolucao. Ajuste threshold antes de aumentar contraste. Para excesso de pontos: aumente `optTolerance` gradualmente (0.08, 0.15, 0.3); depois use filtro de ruido/manchas. Para impressao: escolha largura fisica e espessura compativeis com o bico/processo e confira os detalhes removidos na comparacao.

## Validacao e Limites

```sh
npm install
npx playwright install chromium
npm run test:vectorization
npm run build
```

A suite cobre PNG/JPG/WebP, alpha, inversao, entrada 3200 x 3200 limitada a 1200, atividade da interface durante o Worker, cancelamento ativo, timeout, entradas invalidas, limite de pontos, contornos duplicados, espessura minima, formas aninhadas, furos, comparacao responsiva e benchmark das alternativas.

SVGs de anel e ilha aninhada passam pelo `BaseEngine.parseSVG`, `THREE.ExtrudeGeometry` e `STLExporter`. Os testes verificam coordenadas finitas e cada aresta da malha soldada compartilhada por duas faces. Isso comprova extrusao fechada **nessas fixtures**, nao em qualquer operacao booleana futura.

Limitacoes conhecidas:

- Nao foi fornecida a imagem real que travava. As evidencias sao de fixtures sinteticas; valide o material real no painel.
- Intersecoes de curvas sao verificadas por amostragem adaptativa, nao por prova analitica exata. Problemas menores que a tolerancia podem nao ser detectados. Reduza `geometryTolerance` para requisitos mais finos.
- A abertura morfologica remove detalhes estreitos, mas nao certifica espessura local minima em cada canto nem preenche automaticamente frestas pequenas. Pode arredondar cantos e separar ligacoes finas.
- Contornos ainda tangentes/intersectantes apos reparo sao recusados, nao enviados ao 3D. Nenhuma curva e suavizada depois do reparo para evitar reintroduzir loops.
- Alterar o desenho no editor, reduzir a escala posteriormente ou aplicar offsets/booleanos pode invalidar o resultado geometricamente ou alterar a espessura fisica. Revalide no slicer. O painel transmite a largura selecionada ao modelo ao aplicar.
- A decodificacao e o canvas de normalizacao/comparacao ainda passam pelo navegador na thread principal. O tracing, filtros e validacao pesada ficam no Worker. O limite de megapixels e verificado depois da decodificacao; nao e uma protecao completa contra imagens maliciosas.
- APIs exigem navegador moderno com Workers de modulo, Canvas e dialog. URLs externas precisam permitir CORS.
- Configuracoes sao da conversao atual; nao sao persistidas em perfil/projeto. Textura/coloracao e funcionalidades independentes existentes nao foram substituidas.

O build mantem avisos anteriores de bundle grande e script Fabric sem `type=module`. A instalacao tambem reporta vulnerabilidades no grafo de dependencias existente; nao foi executado `npm audit fix --force`.