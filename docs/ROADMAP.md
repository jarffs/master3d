# ROADMAP DE IMPLEMENTAÇÃO (FULL-STACK)

Este roadmap define as etapas para evoluir a aplicação estática (Vanilla HTML/JS) para uma aplicação conectada a um BaaS (Backend as a Service), preferencialmente Supabase.

## FASE 1: Setup e Configuração do Backend
- [x] Definir e criar o projeto no Supabase.
- [x] Criar as tabelas base seguindo o `DB_SCHEMA.md` (`profiles`, `saved_designs`, `custom_build_plates`).
- [x] Configurar as políticas RLS (Row Level Security) para cada tabela, garantindo segurança de dados.
- [x] Criar o bucket no Storage para as fotos de perfil (Avatares) e Thumbnails dos modelos.
- [x] Adicionar o SDK do Supabase ao frontend (`@supabase/supabase-js`).

## FASE 2: Sistema de Autenticação (Auth)
- [x] Implementar Modal / Página de Login e Registro.
- [x] Integrar a autenticação de E-mail/Senha com o Supabase Auth.
- [x] **NOVO:** Adicionar fluxo de "Esqueci a minha senha" (Recuperação de Senha).
- [x] Controlar o estado global de Auth (Saber se o usuário está logado ou não e alterar a UI do topo do site).
- [x] Bloquear o botão "Exportar STL" para usuários não autenticados (conforme regra de negócio).

## FASE 3: Perfil do Usuário
- [x] Criar aba "Meu Perfil" na interface.
- [x] Adicionar fluxo para o usuário fazer upload de uma foto, que será salva no Supabase Storage e o link salvo na tabela `profiles`.
- [x] Criar interface para o usuário cadastrar novas mesas (`custom_build_plates`).
- [x] Integrar a lista de mesas customizadas ao dropdown da aplicação (combinando com o `printers.json`).

## NOVA FASE 4: Landing Page, Monetização (Stripe) e Limites
- [x] **Landing Page:** Criar uma página inicial (`index.html`) para apresentar o produto, benefícios e tabela de preços (Planos). A ferramenta de edição passará para uma rota separada (ex: `app.html`).
- [x] **Integração Stripe:** Configurar Stripe Checkout para permitir que os usuários assinem planos.
- [x] **Webhook do Stripe:** Criar uma Supabase Edge Function para escutar os pagamentos do Stripe e atualizar o status do usuário na tabela `profiles` (`plan_type`).
- [x] **Limites de Exportação (Free Tier):** Criar uma tabela de logs de exportação no Supabase (`export_logs`). Quando um usuário Free tentar exportar, a aplicação verifica e regista a exportação. Se já exportou na última semana, o download é bloqueado com um aviso para fazer upgrade.
- [x] **Portal do Cliente:** Integrar o Stripe Customer Portal para o usuário poder cancelar ou alterar a assinatura.

## FASE 5: Integração Principal (Salvar Designs)
- [ ] Adicionar botão "Salvar Design".
- [ ] Agrupar os dados do gerador (SVG e valores dos Sliders) em um objeto JSON.
- [ ] Implementar a lógica de inserção na tabela `saved_designs`.
- [ ] Construir o painel lateral ou página "Meus Designs", onde o usuário lista seus arquivos salvos.
- [ ] Programar a função de carregar um design: Ao clicar em um projeto na lista, a aplicação injeta o SVG e os parâmetros de volta no visualizador e renderiza o 3D salvo.

## FASE 6: Polimento e Migração Estrutural (Opcional)
- [ ] Caso a aplicação Vanilla JS comece a ficar muito complexa com estado, avaliar a migração do frontend para um framework (React via Vite ou Next.js), visando manutenção de longo prazo e componentes reutilizáveis.
