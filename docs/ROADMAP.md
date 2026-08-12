# ROADMAP DE IMPLEMENTAÇÃO (FULL-STACK)

Este roadmap define as etapas para evoluir a aplicação estática (Vanilla HTML/JS) para uma aplicação conectada a um BaaS (Backend as a Service), preferencialmente Supabase.

## FASE 1: Setup e Configuração do Backend
- [ ] Definir e criar o projeto no Supabase.
- [ ] Criar as tabelas base seguindo o `DB_SCHEMA.md` (`profiles`, `saved_designs`, `custom_build_plates`).
- [ ] Configurar as políticas RLS (Row Level Security) para cada tabela, garantindo segurança de dados.
- [ ] Criar o bucket no Storage para as fotos de perfil (Avatares) e Thumbnails dos modelos.
- [ ] Adicionar o SDK do Supabase ao frontend (`@supabase/supabase-js`).

## FASE 2: Sistema de Autenticação (Auth)
- [ ] Implementar Modal / Página de Login e Registro.
- [ ] Integrar a autenticação de E-mail/Senha com o Supabase Auth.
- [ ] Controlar o estado global de Auth (Saber se o usuário está logado ou não e alterar a UI do topo do site).
- [ ] Bloquear o botão "Exportar STL" para usuários não autenticados (conforme regra de negócio).

## FASE 3: Perfil do Usuário
- [ ] Criar aba "Meu Perfil" na interface.
- [ ] Adicionar fluxo para o usuário fazer upload de uma foto, que será salva no Supabase Storage e o link salvo na tabela `profiles`.
- [ ] Criar interface para o usuário cadastrar novas mesas (`custom_build_plates`).
- [ ] Integrar a lista de mesas customizadas ao dropdown da aplicação (combinando com o `printers.json`).

## FASE 4: Integração Principal (Salvar Designs)
- [ ] Adicionar botão "Salvar Design".
- [ ] Agrupar os dados do gerador (SVG e valores dos Sliders) em um objeto JSON.
- [ ] Implementar a lógica de inserção na tabela `saved_designs`.
- [ ] Construir o painel lateral ou página "Meus Designs", onde o usuário lista seus arquivos salvos.
- [ ] Programar a função de carregar um design: Ao clicar em um projeto na lista, a aplicação injeta o SVG e os parâmetros de volta no visualizador e renderiza o 3D salvo.

## FASE 5: Polimento e Migração Estrutural (Opcional)
- [ ] Caso a aplicação Vanilla JS comece a ficar muito complexa com estado, avaliar a migração do frontend para um framework (React via Vite ou Next.js), visando manutenção de longo prazo e componentes reutilizáveis.
