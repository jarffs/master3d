# ROADMAP DE IMPLEMENTAÇÃO (FULL-STACK)

Este roadmap define as etapas para evoluir a aplicação estática (Vanilla HTML/JS) para uma aplicação conectada a um BaaS (Supabase) e, futuramente, para uma plataforma multi-ferramentas.

## FASE 1: Setup e Configuração do Backend
- [x] Definir e criar o projeto no Supabase.
- [x] Criar as tabelas base seguindo o `DB_SCHEMA.md` (`profiles`, `saved_designs`, `custom_build_plates`).
- [x] Configurar as políticas RLS (Row Level Security) para cada tabela, garantindo segurança de dados.
- [x] Criar o bucket no Storage para as fotos de perfil (Avatares) e Thumbnails dos modelos.
- [x] Adicionar o SDK do Supabase ao frontend (`@supabase/supabase-js`).

## FASE 2: Sistema de Autenticação (Auth)
- [x] Implementar Modal / Página de Login e Registro.
- [x] Integrar a autenticação de E-mail/Senha com o Supabase Auth.
- [x] Adicionar fluxo de "Esqueci a minha senha" (Recuperação de Senha).
- [x] Controlar o estado global de Auth (Saber se o usuário está logado ou não e alterar a UI do topo do site).
- [x] Bloquear o botão "Exportar STL" para usuários não autenticados (conforme regra de negócio).

## FASE 3: Perfil do Usuário
- [x] Criar aba "Meu Perfil" na interface.
- [x] Adicionar fluxo para o usuário fazer upload de uma foto, que será salva no Supabase Storage e o link salvo na tabela `profiles`.
- [x] Criar interface para o usuário cadastrar novas mesas (`custom_build_plates`).
- [x] Integrar a lista de mesas customizadas ao dropdown da aplicação (combinando com o `printers.json`).

## FASE 4: Landing Page, Monetização (Stripe) e Limites
- [x] **Landing Page:** Criar uma página inicial (`index.html`) para apresentar o produto, benefícios e tabela de preços.
- [x] **Configuração de Build:** Configurar `vite.config.js` para múltiplas páginas (`index.html` e `app.html`).
- [x] **Integração Stripe:** Configurar Stripe Checkout para permitir que os usuários assinem planos.
- [x] **Webhook do Stripe:** Criar uma Supabase Edge Function para escutar os pagamentos do Stripe e atualizar o status do usuário na tabela `profiles`.
- [x] **Limites de Exportação (Free Tier):** Bloqueio para usuários gratuitos que excedem o limite semanal de exportações (tabela `export_logs`).
- [x] **Portal do Cliente:** Integrar o Stripe Customer Portal para o usuário poder cancelar ou alterar a assinatura.

## FASE 5: Integração Principal (Salvar Designs)
- [x] Adicionar botão "Salvar Design".
- [x] Agrupar os dados do gerador (SVG e valores dos Sliders) em um objeto JSON.
- [x] Implementar a lógica de inserção na tabela `saved_designs` (incluindo upload de screenshot em Base64 para o Storage).
- [x] Construir o painel "Meus Projetos", onde o usuário lista seus arquivos salvos.
- [x] Programar a função de carregar, excluir e sobrescrever designs.
- [x] **Melhorias de UX:** Adicionar ViewCube e botão "Home" para melhorar a navegação 3D no editor.

## FASE 6: Plataforma Reutilizável (Multi-ferramentas)
A aplicação evoluirá de um "Gerador de Cortadores de Biscoito" para uma plataforma hub de modelagem paramétrica 3D com diversas ferramentas integradas.
- [ ] **Desacoplamento do Motor (Engine):** Refatorar o `CookieCutterEngine.js` para uma estrutura genérica de `ToolEngine`, permitindo plugar novos geradores.
- [ ] **Novas Ferramentas:** Implementar suporte para carimbos independentes, chaveiros litofânicos, caixas paramétricas, moldes de silicone, etc.
- [ ] **Hub/Dashboard:** Atualizar a interface (`app.html` ou criar um `dashboard.html`) para um menu onde o usuário escolhe a ferramenta desejada antes de entrar no modo de edição.
- [ ] **Revisão de Estado e UI:** Adotar um padrão de gerenciamento de estado mais robusto (ou migração para React/Vue via Vite) para facilitar a criação de novos painéis de controle dinâmicos para cada ferramenta.
- [ ] **Extensão do Banco de Dados:** Adicionar coluna `tool_type` na tabela `saved_designs` para identificar qual motor deve ser carregado ao abrir um projeto.

---

## Estrutura Atual (Workflow e Banco de Dados)

### Workflow (Fluxo do Usuário)
1. **Acesso:** O usuário entra em `index.html` (Landing Page). Se logado, é redirecionado ou clica para ir para o app.
2. **Editor (`app.html`):**
   - O usuário faz upload de um SVG ou imagem.
   - O `ImageTracer` vetoriza as imagens e o `CookieCutterEngine` (Three.js) gera o modelo 3D em tempo real.
   - Ajustes paramétricos ocorrem no painel esquerdo (altura, espessura, mesa de impressão).
3. **Gestão de Projetos:** O usuário salva o projeto no Supabase (SVG + Parâmetros + Screenshot) ou carrega projetos antigos pela aba "Meus Projetos".
4. **Exportação:** A exportação STL requer conta logada e valida limites via banco de dados (Stripe Paywall).

### DB Schema Resumido (Supabase)
- **`users`**: Tabela Auth nativa do Supabase.
- **`profiles`**: Nome, Avatar URL, Status do plano (Free/Pro).
- **`saved_designs`**: Projetos salvos contendo:
  - `name`: Nome dado pelo usuário.
  - `svg_data`: O texto/código do arquivo.
  - `settings`: JSON com valores dos sliders.
  - `thumbnail_url`: Link da imagem salva no bucket `thumbnails`.
- **`custom_build_plates`**: Mesas criadas pelo usuário.
- **`export_logs`**: Tabela para controle e limitação de uso da versão gratuita.
