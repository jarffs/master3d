# WORKFLOW DO USUÁRIO - CutterMaker3D

Este documento detalha o fluxo de interação ponta a ponta dos usuários com a plataforma CutterMaker3D, abrangendo desde o primeiro acesso até a exportação final de modelos e gerenciamento de planos.

## 1. Visão Geral da Arquitetura
A plataforma adota uma abordagem Multi-Ferramentas. O ecossistema é dividido em:
- **Landing Page (`index.html`)**: Vitrine do produto, com apelo de vendas e marketing.
- **Hub de Ferramentas (`hub.html`)**: Central de seleção de ferramentas (Cortadores, Chaveiros, etc).
- **Workspace/Gerador (`app.html`)**: A área de trabalho dinâmica que se adapta à ferramenta escolhida, onde a mágica 3D acontece.

---

## 2. Jornada do Visitante (Não Autenticado)
- **Acesso à Landing Page:** O visitante chega pela URL raiz (`index.html`). Ele pode explorar os benefícios, ver exemplos e visualizar a tabela de preços.
- **Acesso ao Hub:** Ao clicar em "Ir para o Hub" ou "Começar a Criar Grátis", o usuário é direcionado para a página `hub.html`.
- **Seleção de Ferramenta:** No Hub, ele pode visualizar todas as ferramentas disponíveis (ex: Cortador de Biscoito) e as futuras (Chaveiro 3D). Ao clicar em uma ferramenta ativa, é redirecionado para o Workspace (`app.html?tool=nome_da_ferramenta`).
- **Uso do Gerador (Workspace):** O visitante pode fazer upload de um SVG ou imagem, ajustar as barras deslizantes dinâmicas, visualizar a mesa de impressão e ver a prévia em 3D de forma totalmente gratuita e sem cadastro.
- **Restrições:** 
  - **Exportação:** O botão "Baixar STL" fica **bloqueado**. Ao tentar clicar, um aviso instrui o usuário a fazer login.
  - **Salvamento:** O botão "Salvar Design" também exige login.
  - **Histórico:** Não tem acesso a "Meus Projetos".

---

## 3. Autenticação e Onboarding (Email & Google Auth)
- **Registro/Login:** O usuário pode se cadastrar clicando no botão "Login" no topo da tela, que abre um modal limpo e responsivo.
- **Autenticação via Google (OAuth):** 
  - Ao clicar em "Entrar com Google", o frontend chama a função `signInWithOAuth` do Supabase.
  - O utilizador é redirecionado para a página segura de login da Google, onde autoriza a aplicação.
  - Após a autorização, a Google redireciona de volta para a nossa plataforma com um token seguro.
  - O Supabase captura o token, cria a sessão na base de dados e, através de um *Trigger* SQL, cria automaticamente uma linha na tabela `profiles` com os dados do utilizador (nome, email, avatar da Google) e com um saldo inicial de 3 Créditos.
- **Email e Senha:** Continua disponível com fluxo tradicional e recuperação de senha.
- **Integração SPA:** Após o login, a página atualiza apenas o estado dos botões e exibe o saldo de créditos no cabeçalho.

---

## 4. O Workspace de Criação (`app.html`)
O coração do aplicativo. O fluxo de criação de um modelo segue as seguintes etapas:

1. **Inicialização Dinâmica:** O `main.js` lê o parâmetro `?tool=` da URL, instancia o Motor (`Engine`) correto e constrói dinamicamente a barra lateral esquerda com os controles específicos daquela ferramenta.
2. **Upload da Imagem:** O usuário arrasta ou seleciona uma imagem (SVG, PNG, JPG). Se for raster (PNG/JPG), o sistema utiliza o `ImageTracer.js` para vetorizar automaticamente a imagem em tons de preto e branco.
3. **Ajuste de Parâmetros:** O usuário interage com os controles (Altura, Espessura, Contorno). A cada alteração, a Engine recalcula a geometria 3D e atualiza a cena em tempo real, sem travamentos (graças à otimização do Three.js e ClipperLib).
4. **Validação na Mesa de Impressão (Build Plate):** O usuário seleciona sua impressora (ex: Ender 3). O modelo 3D é sobreposto à mesa virtual. Se o modelo for maior que a mesa, um alerta visual (`bp-warning`) é disparado.

---

## 5. Gerenciamento de Projetos e Salvamento
- **Salvamento na Nuvem:** O usuário clica em "Salvar". Um prompt solicita o nome do projeto.
- **Processamento:** O sistema:
  1. Renderiza a cena atual em uma imagem 2D oculta e gera um "Thumbnail" (JPEG).
  2. Faz o upload deste Thumbnail para o Supabase Storage.
  3. Salva o SVG vetorizado, os valores das configurações (`settings`), o nome da ferramenta (`tool_type`) e a URL do Thumbnail na tabela `saved_designs`.
- **Meus Projetos:** Ao acessar o modal "Meus Projetos", o usuário vê uma galeria visual com os Thumbnails. Ao clicar em um card:
  1. O sistema verifica o `tool_type`. Se for diferente da ferramenta atual, recarrega a Engine correta.
  2. Injeta o SVG e aplica as configurações exatas nos sliders, restaurando o estado perfeito do projeto.

---

## 6. Exportação e Economia de Créditos (Pay-As-You-Go)

O sistema verifica o saldo de créditos do utilizador na tabela `profiles` do Supabase antes de permitir downloads de ficheiros STL. O modelo de negócios baseia-se na venda de pacotes de créditos.

### Usuário Starter (Conta Gratuita)
- **Créditos Iniciais:** Ao criar a conta (via Google ou Email), o utilizador recebe automaticamente 3 Créditos grátis.
- **Criação Visual:** Ilimitada no navegador. O utilizador pode gerar e visualizar em 3D dezenas de designs.
- **Salvar na Nuvem:** Liberado.
- **Paywall Inteligente:** Quando o saldo atinge `0`, o botão "Exportar STL" é bloqueado e o utilizador é convidado a visitar a página de preços para comprar um novo pacote.

### Transações e Débito de Créditos (Stripe & Supabase)
1. **Compra de Pacote:** O utilizador compra um pacote (ex: 50 STLs por €15) via *Stripe Payment Links*.
2. **Webhook Seguro:** O Stripe dispara um evento para a nossa *Supabase Edge Function* (`stripe-webhook`). A função valida a compra e injeta `+50` créditos na tabela `profiles` do utilizador.
3. **Débito Seguro (RPC):** Quando o utilizador clica em "Exportar STL", o frontend chama uma *Stored Procedure* (RPC) no Supabase. Esta função verifica se `credits > 0`. Se for verdade, a função subtrai `1` crédito na base de dados e devolve `true` ao frontend, permitindo finalmente a geração e download do ficheiro. Caso contrário, devolve `false` e bloqueia a ação. Isto impede qualquer manipulação via consola do navegador.
