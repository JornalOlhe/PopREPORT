-- Carga inicial migrada do MySQL (database/popreport.sql) para o Supabase.
-- Artistas e álbuns do catálogo inicial usam source 'seed' (sem id externo); as músicas usam os ids reais do Spotify.
alter table public.artists drop constraint artists_source_check, add constraint artists_source_check check (source in ('deezer','spotify','seed'));
alter table public.albums drop constraint albums_source_check, add constraint albums_source_check check (source in ('deezer','spotify','seed'));
create table if not exists public.genres (id bigint generated always as identity primary key, name text not null unique check (char_length(name) between 1 and 80));
create table if not exists public.artist_genres (artist_id bigint not null references public.artists(id) on delete cascade, genre_id bigint not null references public.genres(id) on delete cascade, primary key (artist_id, genre_id));
create index if not exists artist_genres_genre_idx on public.artist_genres (genre_id);
alter table public.genres enable row level security;
alter table public.artist_genres enable row level security;
create policy catalog_read_genres on public.genres for select to authenticated using (true);
create policy catalog_read_artist_genres on public.artist_genres for select to authenticated using (true);

insert into public.genres (name) values ('Pop'), ('Pop alternativo'), ('Indie pop'), ('Rock alternativo'), ('Reggaeton'), ('Trap latino'), ('Jazz pop'), ('Soul'), ('R&B'), ('Funk') on conflict (name) do nothing;
insert into public.artists (source, external_id, name) values
  ('seed', 'badbunny', 'Bad Bunny'),
  ('seed', 'billieeilish', 'Billie Eilish'),
  ('seed', 'brunomars', 'Bruno Mars'),
  ('seed', 'dominicfike', 'Dominic Fike'),
  ('seed', 'harrystyles', 'Harry Styles'),
  ('seed', 'imaginedragons', 'Imagine Dragons'),
  ('seed', 'laufey', 'Laufey'),
  ('seed', 'miloj', 'Milo J'),
  ('seed', 'oliviadean', 'Olivia Dean'),
  ('seed', 'sombr', 'Sombr'),
  ('seed', 'taylorswift', 'Taylor Swift'),
  ('seed', 'twentyonepilots', 'Twenty One Pilots')
on conflict (source, external_id) do nothing;
insert into public.artist_genres (artist_id, genre_id)
select a.id, g.id from (values
  ('badbunny', 'Reggaeton'),
  ('badbunny', 'Trap latino'),
  ('billieeilish', 'Pop alternativo'),
  ('brunomars', 'Pop'),
  ('brunomars', 'Funk'),
  ('dominicfike', 'Indie pop'),
  ('harrystyles', 'Pop'),
  ('imaginedragons', 'Rock alternativo'),
  ('laufey', 'Jazz pop'),
  ('miloj', 'Trap latino'),
  ('oliviadean', 'Soul'),
  ('oliviadean', 'R&B'),
  ('sombr', 'Indie pop'),
  ('taylorswift', 'Pop'),
  ('twentyonepilots', 'Rock alternativo')
) as v(artist_slug, genre_name)
join public.artists a on a.source='seed' and a.external_id=v.artist_slug
join public.genres g on g.name=v.genre_name
on conflict do nothing;
insert into public.albums (artist_id, source, external_id, title, release_date)
select a.id, 'seed', v.ext, v.title, v.yr from (values
  ('badbunny', 'badbunnyalbum', 'OASIS', '2019'),
  ('billieeilish', 'billieeilishalbum', 'HIT ME HARD AND SOFT', '2024'),
  ('brunomars', 'brunomarsalbum', 'Die With A Smile - Single', '2024'),
  ('dominicfike', 'dominicfikealbum', 'Don''t Forget About Me, Demos', '2018'),
  ('harrystyles', 'harrystylesalbum', 'Harry''s House', '2022'),
  ('imaginedragons', 'imaginedragonsalbum', 'Evolve', '2017'),
  ('laufey', 'laufeyalbum', 'Bewitched', '2023'),
  ('miloj', 'milojalbum', 'Rara Vez - Single', '2023'),
  ('oliviadean', 'oliviadeanalbum', 'The Art of Loving', '2025'),
  ('sombr', 'sombralbum', 'I Barely Know Her', '2025'),
  ('taylorswift', 'taylorswiftalbum', 'Lover', '2019'),
  ('twentyonepilots', 'twentyonepilotsalbum', 'Blurryface', '2015')
) as v(artist_slug, ext, title, yr)
join public.artists a on a.source='seed' and a.external_id=v.artist_slug
on conflict (source, external_id) do nothing;
insert into public.tracks (album_id, source, external_id, title, url)
select al.id, 'spotify', v.sid, v.title, 'https://open.spotify.com/track/' || v.sid from (values
  ('badbunnyalbum', '0fea68AdmYNygeTGI4RC18', 'LA CANCIÓN'),
  ('billieeilishalbum', '6dOtVTDdiauQNBQEDOtlAB', 'BIRDS OF A FEATHER'),
  ('brunomarsalbum', '2plbrEY59IikOBgBGLjaoe', 'Die With A Smile'),
  ('dominicfikealbum', '7yNf9YjeO5JXUE3JEBgnYc', 'Babydoll'),
  ('harrystylesalbum', '4Dvkj6JhhA12EX05fT7y2e', 'As It Was'),
  ('imaginedragonsalbum', '0CcQNd8CINkwQfe1RDtGV6', 'Believer'),
  ('laufeyalbum', '46rPcSaUj5jHxX60xWmsMD', 'From The Start'),
  ('milojalbum', '7MVIfkyzuUmQ716j8U7yGR', 'Rara Vez'),
  ('oliviadeanalbum', '1qbmS6ep2hbBRaEZFpn7BX', 'Man I Need'),
  ('sombralbum', '0FTmksd2dxiE5e3rWyJXs6', 'Back to Friends'),
  ('taylorswiftalbum', '1BxfuPKGuaTgP7aM0Bbdwr', 'Cruel Summer'),
  ('twentyonepilotsalbum', '3CRDbSIZ4r5MsZ0YwxuEkn', 'Stressed Out')
) as v(album_ext, sid, title)
join public.albums al on al.source='seed' and al.external_id=v.album_ext
on conflict (source, external_id) do nothing;
