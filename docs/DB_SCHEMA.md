# DB_SCHEMA

Este documento define a estrutura do banco de dados relacional (focado em PostgreSQL/Supabase) para o sistema.

## Tabelas

### 1. `users` (Gerenciado pelo sistema de Auth do BaaS)
Tabela principal do sistema de autenticação.
- `id` (UUID, Primary Key)
- `email` (String, Unique)
- `created_at` (Timestampz)

### 2. `profiles`
Estende as informações públicas e privadas do usuário.
- `id` (UUID, Primary Key, Foreign Key -> `users.id`)
- `username` (String, Unique, Nullable)
- `avatar_url` (String, Nullable) - Caminho para a imagem no Storage
- `updated_at` (Timestampz)

### 3. `saved_designs`
Armazena os projetos gerados pelos usuários.
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key -> `users.id`)
- `name` (String) - Nome do projeto (Ex: "Cortador de Estrela")
- `svg_data` (Text) - Código do SVG original para recriar o cortador
- `settings` (JSONB) - Objeto contendo os parâmetros (`height`, `wallThickness`, `baseWidth`, `baseHeight`)
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

## Políticas de Segurança (Row Level Security - RLS)
- `profiles`: Leitura pública, Escrita apenas pelo próprio `user_id`.
- `saved_designs`: Leitura e Escrita apenas pelo próprio `user_id`.
- `custom_build_plates`: Leitura e Escrita apenas pelo próprio `user_id`.
