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
- [x] **Nova Estrutura de Preços (Créditos):** Reformular o `index.html` para exibir a venda de Pacotes de Créditos avulsos (Pay-As-You-Go) e um Plano Anual.
- [x] **Configuração de Build:** Configurar `vite.config.js` para múltiplas páginas (`index.html` e `app.html`).
- [x] **Tabela Profiles (Créditos):** Adicionar coluna `credits` à tabela `profiles` no Supabase (com default 3 para novos usuários).
- [x] **Integração Stripe:** Configurar Stripe Checkout com Edge Functions para venda de assinaturas recorrentes.
- [x] **Supabase Edge Function (create-checkout-session):** Criar Edge Function para gerar sessões de checkout do Stripe.
- [x] **Supabase Edge Function (stripe-webhook):** Criar Edge Function para escutar eventos do Stripe e adicionar créditos ao perfil.
- [x] **Débito Seguro de Créditos:** Criar uma RPC (Remote Procedure Call) no Supabase para deduzir 1 crédito de forma segura sempre que um utilizador solicitar um download de STL.
- [x] **Auto-Checkout da Landing Page:** Implementar redirecionamento automático com `?buy=` param e fluxo login → checkout.

## FASE 5: Integração Principal (Salvar Designs)
- [x] Adicionar botão "Salvar Design".
- [x] Agrupar os dados do gerador (SVG e valores dos Sliders) em um objeto JSON.
- [x] Implementar a lógica de inserção na tabela `saved_designs` (incluindo upload de screenshot em Base64 para o Storage).
- [x] Construir o painel "Meus Projetos", onde o usuário lista seus arquivos salvos.
- [x] Programar a função de carregar, excluir e sobrescrever designs.
- [x] **Melhorias de UX:** Adicionar ViewCube e botão "Home" para melhorar a navegação 3D no editor.

## FASE 6: Redesign da Landing Page (Marketplace Style)
- [x] **Redesign completo:** Reescrever `index.html` com design dark mode, marketplace style inspirado no MakerWorld.
- [x] **Unificação Hub + Landing:** Eliminar `hub.html` e absorver funcionalidade na nova landing page.
- [x] **Grid de Ferramentas:** Cards fotorealistas para cada ferramenta (disponível e "Em Breve").
- [x] **Rebranding:** Migrar de "CutterMaker3D" para "MasterWorld" como marca oficial.
- [x] **Imagens de ferramentas:** Gerar thumbnails fotorealistas para os cards das ferramentas.

## FASE 7: Plataforma Multi-Ferramentas (Roadmap Futuro)
A aplicação evolui para uma plataforma hub de modelagem paramétrica 3D com diversas ferramentas.

### 7.1 Arquitetura Base
- [ ] **Desacoplamento do Motor (Engine):** Refatorar o `CookieCutterEngine.js` para uma estrutura genérica de `ToolEngine`, permitindo plugar novos geradores.
- [ ] **Extensão do Banco de Dados:** Garantir que a coluna `tool_type` na tabela `saved_designs` identifica qual motor carregar.

### 7.2 Novas Ferramentas (por ordem de prioridade)
- [ ] **🔑 Chaveiro 3D:** Gerador de chaveiros personalizados a partir de imagens e texto. Engine: `KeychainEngine`.
- [ ] **📌 Carimbo de Brigadeiro:** Gerador de carimbos circulares a partir de imagens vetorizadas. Engine: `StampEngine`.
- [ ] **🍫 Ejetor de Brigadeiro:** Moldes paramétricos com sistema de ejeção para doces. Engine: `CandyMoldEngine`.
- [ ] **🎨 Colorir com Bordas em Relevo:** Conversor de imagens para placas com bordas elevadas para colorir. Engine: `ColoringEngine`.
- [ ] **🔤 Letras Grandes / Nomes 3D:** Gerador de letras decorativas 3D para festas e eventos. Engine: `BigLetterEngine`.

### 7.3 Infraestrutura Futura
- [ ] **Sistema de plugins:** Arquitetura que permite adicionar novas ferramentas sem alterar o core.
- [ ] **Galeria comunitária:** Permitir que utilizadores partilhem designs públicos.
- [ ] **Revisão de Estado e UI:** Considerar migração para React/Vue para escalabilidade.


