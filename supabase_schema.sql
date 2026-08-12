-- Habilita extensão para UUID
create extension if not exists "uuid-ossp";

-- Criação da tabela de Perfis
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  username text unique,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilita RLS na tabela profiles
alter table public.profiles enable row level security;

create policy "Perfis são públicos para visualização."
  on profiles for select
  using ( true );

create policy "Usuários podem atualizar seus próprios perfis."
  on profiles for update
  using ( auth.uid() = id );

create policy "Usuários podem inserir seus próprios perfis."
  on profiles for insert
  with check ( auth.uid() = id );

-- Criação da tabela de Designs Salvos
create table public.saved_designs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  svg_data text not null,
  settings jsonb not null,
  thumbnail_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilita RLS em saved_designs
alter table public.saved_designs enable row level security;

create policy "Usuários podem ver seus próprios designs."
  on saved_designs for select
  using ( auth.uid() = user_id );

create policy "Usuários podem inserir seus próprios designs."
  on saved_designs for insert
  with check ( auth.uid() = user_id );

create policy "Usuários podem atualizar seus próprios designs."
  on saved_designs for update
  using ( auth.uid() = user_id );

create policy "Usuários podem deletar seus próprios designs."
  on saved_designs for delete
  using ( auth.uid() = user_id );

-- Criação da tabela de Mesas Customizadas
create table public.custom_build_plates (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  width integer not null,
  depth integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilita RLS em custom_build_plates
alter table public.custom_build_plates enable row level security;

create policy "Usuários podem ver suas próprias mesas."
  on custom_build_plates for select
  using ( auth.uid() = user_id );

create policy "Usuários podem inserir suas próprias mesas."
  on custom_build_plates for insert
  with check ( auth.uid() = user_id );

create policy "Usuários podem atualizar suas próprias mesas."
  on custom_build_plates for update
  using ( auth.uid() = user_id );

create policy "Usuários podem deletar suas próprias mesas."
  on custom_build_plates for delete
  using ( auth.uid() = user_id );

-- Criação do Bucket de Storage
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);
insert into storage.buckets (id, name, public) values ('thumbnails', 'thumbnails', true);

-- Políticas de Storage (Avatars)
create policy "Avatar images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'avatars' );

create policy "Anyone can upload an avatar."
  on storage.objects for insert
  with check ( bucket_id = 'avatars' );

create policy "Anyone can update their own avatar."
  on storage.objects for update
  using ( bucket_id = 'avatars' );

-- Políticas de Storage (Thumbnails)
create policy "Thumbnail images are publicly accessible."
  on storage.objects for select
  using ( bucket_id = 'thumbnails' );

create policy "Users can upload their own thumbnails."
  on storage.objects for insert
  with check ( bucket_id = 'thumbnails' );
