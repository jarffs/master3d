# CookieMaker 3D

O **CookieMaker 3D** é uma aplicação web interativa e paramétrica que permite transformar arquivos SVG 2D (vetores) em modelos 3D de cortadores de biscoito (ou massa de modelar/playdoh), prontos para impressão 3D (formato STL).

## 🚀 Funcionalidades

- **Upload de SVG:** Carregue qualquer arquivo SVG contendo formas preenchidas ou apenas contornos (strokes). A aplicação extrai as linhas automaticamente.
- **Preview 3D em Tempo Real:** Visualize o seu cortador de biscoito instantaneamente no navegador usando a engine renderizadora Three.js.
- **Paramétrico (Totalmente Customizável):**
  - **Altura do Cortador (Z):** Defina a altura total do cortador (ex: 15mm).
  - **Espessura da Parede:** Ajuste a espessura da lâmina de corte para ser mais fina e afiada ou mais grossa e resistente.
  - **Largura da Borda (Flange):** Adicione uma base na extremidade para dar suporte, estabilidade e conforto aos dedos na hora de cortar a massa.
  - **Altura da Borda:** Determine a espessura da base de suporte.
- **Exportação para STL:** Com um clique, baixe o arquivo `.stl` pronto para ser fatiado e impresso em qualquer impressora 3D.
- **Auto-Scale Inteligente:** O aplicativo redimensiona automaticamente SVGs muito grandes ou muito pequenos para um tamanho padrão de cortador de biscoitos (~80mm).

## 🛠️ Tecnologias Utilizadas

- **Vite:** Ferramenta de build extremamente rápida.
- **Three.js:** Biblioteca JavaScript 3D para renderização no canvas.
- **ClipperLib:** Biblioteca de operações com polígonos (booleanas e offsets) para criar as paredes do cortador baseadas nos caminhos do SVG.
- **Vanilla JS & CSS:** Construído sem frameworks pesados, garantindo alta performance e um design "Glassmorphism" elegante.

## 📦 Como rodar o projeto localmente

1. Certifique-se de ter o **Node.js** instalado em seu computador.
2. Clone o repositório e navegue até a pasta do projeto.
3. Instale as dependências:
   ```bash
   npm install
   ```
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
5. Abra o link gerado no terminal (normalmente `http://localhost:5173`) no seu navegador.

## 📝 Dicas para os SVGs

- Para obter os melhores resultados, o arquivo SVG deve conter a **silhueta** simples do que você deseja cortar.
- Antes de exportar do seu software de desenho (Illustrator, Inkscape, etc.), certifique-se de excluir quaisquer grades (grids), textos isolados, fundos ou camadas bloqueadas, pois o motor lerá *todas* as linhas presentes no arquivo.
- O motor resolve automaticamente arquivos salvos sem preenchimento (`fill="none"`).

---
*Desenvolvido com 💙 para impressão 3D e culinária criativa.*
