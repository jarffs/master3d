-- Criação da tabela de mesas padrão (somente leitura para o frontend)
create table if not exists public.default_build_plates (
  id uuid default uuid_generate_v4() primary key,
  brand text not null,
  name text not null unique,
  width integer not null,
  depth integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Habilita RLS na nova tabela
alter table public.default_build_plates enable row level security;

-- Política: Todos podem ver as mesas padrão
create policy "Mesas padrão são públicas."
  on default_build_plates for select
  using ( true );

-- Altera a tabela 'profiles' para adicionar o array de impressoras selecionadas
alter table public.profiles
  add column if not exists selected_printers uuid[] default '{}';

-- Insere as impressoras (ignorando erros se o 'name' já existir devido ao ON CONFLICT)
insert into public.default_build_plates (brand, name, width, depth) values 
  ('Bambu Lab', 'Bambu Lab X1/P1 Series (256x256)', 256, 256),
  ('Bambu Lab', 'Bambu Lab A1 (256x256)', 256, 256),
  ('Bambu Lab', 'Bambu Lab A1 Mini (180x180)', 180, 180),
  ('Creality', 'Ender 3 / Pro / V2 (220x220)', 220, 220),
  ('Creality', 'Ender 3 S1 / S1 Pro (220x220)', 220, 220),
  ('Creality', 'Ender 3 Max (300x300)', 300, 300),
  ('Prusa', 'Prusa i3 MK3S+ / MK4 (250x210)', 250, 210),
  ('Prusa', 'Prusa MINI+ (180x180)', 180, 180),
  ('Prusa', 'Prusa XL (360x360)', 360, 360),
  ('Anycubic', 'Anycubic Kobra 2 (220x220)', 220, 220),
  ('Anycubic', 'Anycubic Kobra 2 Max (420x420)', 420, 420),
  ('Flashforge', 'Flashforge Adventurer 5M (220x220)', 220, 220),
  ('Flashforge', 'Flashforge Adventurer 4 (220x200)', 220, 200),
  ('Snapmaker', 'Snapmaker Artisan (400x400)', 400, 400),
  ('Snapmaker', 'Snapmaker J1 (300x200)', 300, 200),
  ('Elegoo', 'Elegoo Neptune 3 / 4 Pro (225x225)', 225, 225),
  ('Elegoo', 'Elegoo Neptune 3 / 4 Max (420x420)', 420, 420)
on conflict (name) do nothing;
