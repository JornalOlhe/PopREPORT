-- ============================================================================
-- POPREPORT - SCHEMA SUPABASE (PostgreSQL) PARA O SITE ONLINE
-- Já aplicado ao projeto como a migração "popreport_schema_playlists_catalog".
-- Catálogo (artists/albums/tracks): leitura para usuários autenticados; escrita só pela
-- função add_track_to_playlist. Playlists: cada visitante (conta por e-mail/senha) vê só as suas (RLS).
-- Contas: migração "email_password_accounts" (nome único, perfil automático, username_available).
-- ============================================================================
create table public.artists (
  id bigint generated always as identity primary key,
  source text not null check (source in ('deezer','spotify')),
  external_id text not null check (external_id ~ '^[A-Za-z0-9]{1,32}$'),
  name text not null check (char_length(name) between 1 and 160),
  image_url text check (image_url is null or image_url ~ '^https://'),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create table public.albums (
  id bigint generated always as identity primary key,
  artist_id bigint not null references public.artists(id) on delete cascade,
  source text not null check (source in ('deezer','spotify')),
  external_id text not null check (external_id ~ '^[A-Za-z0-9]{1,32}$'),
  title text not null check (char_length(title) between 1 and 200),
  image_url text check (image_url is null or image_url ~ '^https://'),
  release_date text check (release_date is null or release_date ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create table public.tracks (
  id bigint generated always as identity primary key,
  album_id bigint not null references public.albums(id) on delete cascade,
  source text not null check (source in ('deezer','spotify')),
  external_id text not null check (external_id ~ '^[A-Za-z0-9]{1,32}$'),
  title text not null check (char_length(title) between 1 and 200),
  duration_ms integer not null default 0 check (duration_ms between 0 and 7200000),
  explicit boolean not null default false,
  track_number smallint not null default 1 check (track_number between 0 and 999),
  url text check (url is null or url ~ '^https://'),
  created_at timestamptz not null default now(),
  unique (source, external_id)
);
create table public.profiles (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null default 'Visitante' check (char_length(display_name) between 1 and 100)
);
create table public.playlists (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 300),
  created_at timestamptz not null default now()
);
create unique index playlists_owner_name_uq on public.playlists (owner_id, lower(btrim(name)));
create table public.playlist_tracks (
  playlist_id bigint not null references public.playlists(id) on delete cascade,
  track_id bigint not null references public.tracks(id) on delete cascade,
  position integer not null,
  added_at timestamptz not null default now(),
  primary key (playlist_id, track_id)
);
create index albums_artist_idx on public.albums (artist_id);
create index tracks_album_idx on public.tracks (album_id);
create index playlist_tracks_track_idx on public.playlist_tracks (track_id);

alter table public.artists enable row level security;
alter table public.albums enable row level security;
alter table public.tracks enable row level security;
alter table public.profiles enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_tracks enable row level security;

create policy catalog_read_artists on public.artists for select to authenticated using (true);
create policy catalog_read_albums on public.albums for select to authenticated using (true);
create policy catalog_read_tracks on public.tracks for select to authenticated using (true);

create policy profiles_own_select on public.profiles for select to authenticated using (owner_id = (select auth.uid()));
create policy profiles_own_insert on public.profiles for insert to authenticated with check (owner_id = (select auth.uid()));
create policy profiles_own_update on public.profiles for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy playlists_own_select on public.playlists for select to authenticated using (owner_id = (select auth.uid()));
create policy playlists_own_insert on public.playlists for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select count(*) from public.playlists p where p.owner_id = (select auth.uid())) < 100);
create policy playlists_own_update on public.playlists for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy playlists_own_delete on public.playlists for delete to authenticated using (owner_id = (select auth.uid()));

create policy playlist_tracks_own_select on public.playlist_tracks for select to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())));
create policy playlist_tracks_own_delete on public.playlist_tracks for delete to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.owner_id = (select auth.uid())));

-- Única porta de escrita no catálogo e nas playlists: valida dono, tamanho e origem.
create or replace function public.add_track_to_playlist(p_playlist_id bigint, p jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_src text := p->>'source';
  v_artist bigint; v_album bigint; v_track bigint; v_pos integer;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform 1 from public.playlists where id = p_playlist_id and owner_id = uid for update;
  if not found then raise exception 'playlist_not_found' using errcode = 'P0002'; end if;
  if v_src is null or v_src not in ('deezer','spotify') then raise exception 'invalid_source' using errcode = '22023'; end if;
  if (select count(*) from public.playlist_tracks where playlist_id = p_playlist_id) >= 500 then
    raise exception 'playlist_full' using errcode = '54000';
  end if;

  insert into public.artists (source, external_id, name, image_url)
  values (v_src, p->>'artistId', left(p->>'artist', 160), nullif(p->>'artistImage', ''))
  on conflict (source, external_id) do update set image_url = coalesce(public.artists.image_url, excluded.image_url)
  returning id into v_artist;

  insert into public.albums (artist_id, source, external_id, title, image_url, release_date)
  values (v_artist, v_src, p->>'albumId', left(p->>'album', 200), nullif(p->>'image', ''), nullif(p->>'releaseDate', ''))
  on conflict (source, external_id) do update set image_url = coalesce(public.albums.image_url, excluded.image_url),
    release_date = coalesce(public.albums.release_date, excluded.release_date)
  returning id into v_album;

  insert into public.tracks (album_id, source, external_id, title, duration_ms, explicit, track_number, url)
  values (v_album, v_src, p->>'trackId', left(p->>'track', 200),
          least(greatest(coalesce((p->>'durationMs')::integer, 0), 0), 7200000),
          coalesce((p->>'explicit')::boolean, false),
          least(greatest(coalesce((p->>'trackNumber')::integer, 1), 0), 999),
          nullif(p->>'url', ''))
  on conflict (source, external_id) do update set url = coalesce(public.tracks.url, excluded.url)
  returning id into v_track;

  select coalesce(max(position), 0) + 1 into v_pos from public.playlist_tracks where playlist_id = p_playlist_id;
  insert into public.playlist_tracks (playlist_id, track_id, position)
  values (p_playlist_id, v_track, v_pos) on conflict do nothing;
  return v_track;
end;
$$;
revoke all on function public.add_track_to_playlist(bigint, jsonb) from public, anon;
grant execute on function public.add_track_to_playlist(bigint, jsonb) to authenticated;

-- Migração "email_password_accounts": nome de usuário único, perfil criado no cadastro e checagem de nome livre.
create unique index if not exists profiles_display_name_uq on public.profiles (lower(btrim(display_name)));
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (owner_id, display_name) values (new.id, left(btrim(coalesce(new.raw_user_meta_data->>'name', 'Visitante')), 100)) on conflict do nothing;
  return new;
end $$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create or replace function public.username_available(p_name text) returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(btrim(display_name)) = lower(btrim(p_name)));
$$;
revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

-- Migração "crud_catalog_ownership": cada usuário cria/edita/apaga só o que é seu (artistas, álbuns, músicas, gêneros).
alter table public.artists add column if not exists owner_id uuid references auth.users(id) on delete set null default auth.uid();
alter table public.albums add column if not exists owner_id uuid references auth.users(id) on delete set null default auth.uid();
alter table public.tracks add column if not exists owner_id uuid references auth.users(id) on delete set null default auth.uid();
alter table public.genres add column if not exists owner_id uuid references auth.users(id) on delete set null default auth.uid();
-- source passa a aceitar 'seed' e 'manual'; external_id e source têm padrão para linhas manuais.
-- Políticas <tabela>_own_insert/update/delete: owner_id = auth.uid(). O RPC add_track_to_playlist grava o catálogo sem dono.
