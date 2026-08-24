# DB_SCHEMA

Este documento define a estrutura do banco de dados relacional (focado em PostgreSQL/Supabase) para o sistema.

## Tabelas

### 1. `users` (Gerenciado pelo sistema de Auth do BaaS)
Tabela principal do sistema de autenticação.
- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `created_at` (Timestampz)

### 2. `profiles`
Estende as informações públicas e privadas do usuário, incluindo status de assinatura.
- `id` (UUID, Primary Key, Foreign Key -> `users.id`)
- `username` (String, Unique, Nullable)
- `avatar_url` (String, Nullable) - Caminho para a imagem no Storage
- `plan_type` (String) - Define o nível de acesso do usuário (ex: 'free', 'pro'). Atualizado via Stripe Webhooks.
- `stripe_customer_id` (String, Nullable) - ID do cliente no Stripe
- `updated_at` (Timestampz)

### 3. `saved_designs`
Armazena os projetos gerados pelos usuários.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key -> `users.id`)
- `name` (String) - Nome do projeto (Ex: "Cortador de Estrela")
- `tool_type` (String) - Identifica a ferramenta usada (Ex: 'cookie_cutter', 'keychain')
- `svg_data` (Text) - Código do SVG original para recriar a geometria
- `settings` (JSONB) - Objeto contendo os parâmetros específicos da ferramenta (ex: `height`, `wallThickness`)
- `thumbnail_url` (String, Nullable) - Caminho para a screenshot no Storage
- `created_at` (Timestampz)
- `updated_at` (Timestampz)

### 4. `custom_build_plates`
Armazena as dimensões das mesas cadastradas pelos usuários.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key -> `users.id`)
- `name` (String) - Nome da mesa (Ex: "Voron 2.4")
- `width` (Integer) - Dimensão X em mm
- `depth` (Integer) - Dimensão Y em mm
- `created_at` (Timestampz)

### 5. `export_logs`
Registra a cota de uso da plataforma (usado para controlar o Free Tier).
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key -> `users.id`)
- `action` (String) - Ação executada (ex: 'export_stl')
- `tool_type` (String) - Ferramenta onde a ação ocorreu (ex: 'cookie_cutter')
- `created_at` (Timestampz)

## Políticas de Segurança (Row Level Security - RLS)
- `profiles`: Leitura pública, Escrita apenas pelo próprio `user_id` (ou serviço backend para os campos do Stripe).
- `saved_designs`: Leitura e Escrita apenas pelo próprio `user_id`.
- `custom_build_plates`: Leitura e Escrita apenas pelo próprio `user_id`.
- `export_logs`: Leitura pelo usuário (para consultar sua cota), Inserção permitida autenticada, Atualização bloqueada.
