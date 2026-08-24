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
- [ ] Integrar autenticação Google OAuth no Supabase.
- [x] Adicionar fluxo de "Esqueci a minha senha" (Recuperação de Senha).
- [x] Controlar o estado global de Auth (Saber se o usuário está logado ou não e alterar a UI do topo do site).
- [x] Bloquear o botão "Exportar STL" para usuários não autenticados ou sem créditos.

## FASE 3: Perfil do Usuário
- [x] Criar aba "Meu Perfil" na interface.
- [x] Adicionar fluxo para o usuário fazer upload de uma foto, que será salva no Supabase Storage e o link salvo na tabela `profiles`.
- [x] Criar interface para o usuário cadastrar novas mesas (`custom_build_plates`).
- [x] Integrar a lista de mesas customizadas ao dropdown da aplicação (combinando com o `printers.json`).

## FASE 4: Landing Page, Monetização (Stripe) e Economia de Créditos
- [x] **Landing Page:** Criar uma página inicial (`index.html`) para apresentar o produto.
- [ ] **Nova Estrutura de Preços (Créditos):** Reformular o `index.html` para exibir a venda de Pacotes de Créditos avulsos (Pay-As-You-Go) e um Plano Anual.
- [x] **Configuração de Build:** Configurar `vite.config.js` para múltiplas páginas (`index.html` e `app.html`).
- [ ] **Tabela Profiles (Créditos):** Adicionar coluna `credits` à tabela `profiles` no Supabase (com default 3 para novos usuários).
- [ ] **Integração Stripe:** Configurar Stripe Checkout (Payment Links) para a venda dos pacotes de créditos e plano anual.
- [ ] **Supabase Edge Function (Webhook do Stripe):** Criar e hospedar uma Edge Function (`stripe-webhook`) para escutar compras de créditos e usar o *Service Role* para somá-los de forma segura na tabela `profiles`.
- [ ] **Débito Seguro de Créditos:** Criar uma RPC (Remote Procedure Call) no Supabase para deduzir 1 crédito de forma segura sempre que um utilizador solicitar um download de STL.

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


