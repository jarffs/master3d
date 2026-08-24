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

## 3. Autenticação e Onboarding
- **Registro/Login:** O usuário pode se cadastrar a qualquer momento clicando no botão "Login" no topo da tela, que abre um modal limpo e responsivo.
- **Integração com Supabase:** O sistema utiliza Supabase Auth. Após o login, a página não precisa recarregar completamente (SPA mindset), atualizando apenas o estado dos botões.
- **Perfil do Usuário:** Uma vez logado, a foto de perfil (ou avatar padrão) e o menu de usuário aparecem no cabeçalho.
- **Recuperação:** Fluxo padrão de "Esqueci minha senha" está disponível no modal.

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

## 6. Exportação e Modelo de Negócios (Free vs PRO)

O sistema verifica os limites através da tabela `profiles` no Supabase antes de permitir downloads.

### Usuário Free (Conta Gratuita)
- **Criação e Salvamento:** Ilimitado na nuvem. O usuário pode criar dezenas de designs.
- **Exportação STL:** Restrito por cotas semanais (ex: 1 a 3 downloads por semana).
- **Paywall Inteligente:** Se a cota semanal for esgotada, ao clicar em "Baixar STL", o sistema bloqueia o download e abre um modal sugerindo o upgrade para o plano PRO via Stripe.

### Usuário PRO (Assinante Stripe)
- **Desbloqueio Total:** O sistema identifica o status `plan_type = 'pro'` e remove qualquer trava de exportação.
- **Downloads Ilimitados:** Arquivos STL podem ser exportados sem contadores.
- **Gerenciamento de Assinatura:** Pelo menu do usuário, é possível acessar o "Portal do Cliente Stripe" para gerenciar o cartão de crédito, baixar faturas ou cancelar a assinatura de forma self-service.
