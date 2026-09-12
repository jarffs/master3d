# Geometria do Carimbo

## Correcao de STL nao manifold

As subtracoes dos encaixes usando `three-bvh-csg` produziam juncoes em T e triangulos degenerados. Na referencia retangular com furo, o STL tinha 176 arestas invalidas na base e 247 no cabo. O relevo isolado passava nos testes anteriores, mas isso nao validava o conjunto exportado.

O StampEngine agora usa `manifold-3d` 3.5.3 (WASM):

- Cilindro da base menos o encaixe inferior.
- Extrusao do desenho preenchido e uniao com a base em um unico solido, sem tampas internas coincidentes.
- Revolucao do perfil do cabo e subtracao do encaixe.
- Pino como cilindro separado.

Os tres solidos sao os mesmos na visualizacao e na exportacao. Base e relevo usam grupos de material na mesma malha para preservar as cores. Os objetos WASM temporarios sao liberados em `finally`; as malhas Three.js antigas sao descartadas ao regenerar.

Na exportacao 3MF, base e relevo sao volumes fechados separados para preservar suas cores, pois o exportador aceita apenas um material por malha. O STL permanece unido.

`generate3DModel` agora e assincrono: chamadas devem usar `await`. O carregamento do WASM e compartilhado e ocorre apenas na primeira utilizacao. Geracoes substituidas ou canceladas por `clear()` nao aplicam resultados antigos. Os pontos de chamada do aplicativo ja aguardam a geracao.

O reforco continua de 0.2 a 1.2 mm, padrao 0.4 mm, adicionado metade para cada lado dos tracos. Furos pequenos podem fechar quando o reforco excede sua largura; nao e criada uma parede externa independente.

## Validacao

Execute `npm run test:vectorization -- --grep stamp` e `npm run build`.

Os testes exportam e reimportam STL binario e ASCII (formato usado pelo botao de exportacao), verificando:

- Cada aresta compartilhada por exatamente duas faces com sentidos opostos.
- Ausencia de triangulos degenerados e faces duplicadas.
- Volume orientado positivo.
- Base, cabo, pino e conjunto completo em 0.2, 0.4 e 1.2 mm.
- Entrada SVG vazada e imagem raster convertida com alta fidelidade.
- Tempo de geracao, descarte de recursos, atualizacoes concorrentes e renderizacao desktop/mobile.

O teste salva um STL de referencia em sua pasta de resultados Playwright. A contagem usa coordenadas soldadas com precisao de 0.00001 mm. Nos casos testados, o resultado e zero arestas invalidas em todas as pecas e no conjunto.

Esses testes nao executam o OrcaSlicer nem comprovam o resultado para todo arquivo de entrada possivel. O STL original que apresentou 206 arestas invalidas nao foi fornecido. E necessario gerar e exportar um novo STL; arquivos ja exportados nao sao modificados pela correcao.