-- ============================================================================
-- POPREPORT - LE6: INTERFACES OPERANDO COM JOINS (Supabase / PostgreSQL)
-- Migração "le6_views_com_joins", já aplicada ao projeto.
-- security_invoker = true: as políticas RLS do usuário logado continuam valendo nas views.
-- ============================================================================

-- TELA 1 (Playlists): playlists + profiles + playlist_tracks + tracks + albums
create or replace view public.v_playlist_resumo with (security_invoker = true) as
select p.id as playlist_id, p.owner_id, pr.display_name as dono, p.name, p.description, p.created_at,
       count(pt.track_id)::int as total_faixas,
       coalesce(sum(t.duration_ms), 0)::bigint as duracao_ms,
       count(distinct al.artist_id)::int as total_artistas
from public.playlists p
join public.profiles pr on pr.owner_id = p.owner_id
left join public.playlist_tracks pt on pt.playlist_id = p.id
left join public.tracks t on t.id = pt.track_id
left join public.albums al on al.id = t.album_id
group by p.id, pr.display_name;

-- TELA 2 (Descobrir > Da sua coleção / detalhe da playlist): playlist_tracks + playlists + tracks + albums + artists
create or replace view public.v_playlist_faixas with (security_invoker = true) as
select pt.playlist_id, pt.position, pt.added_at, p.owner_id, p.name as playlist_nome,
       t.id as track_id, t.source, t.external_id, t.title, t.duration_ms, t.url,
       al.id as album_id, al.title as album_titulo, al.image_url, al.release_date,
       ar.id as artist_id, ar.external_id as artist_external_id, ar.name as artista_nome, ar.image_url as artista_imagem
from public.playlist_tracks pt
join public.playlists p on p.id = pt.playlist_id
join public.tracks t on t.id = pt.track_id
join public.albums al on al.id = t.album_id
join public.artists ar on ar.id = al.artist_id;

-- TELA 3 (Monte sua playlist > Artistas já no catálogo): artists + albums + tracks + artist_genres + genres
create or replace view public.v_artista_catalogo with (security_invoker = true) as
select ar.id, ar.source, ar.external_id, ar.name, ar.image_url,
       count(distinct al.id)::int as total_albuns,
       count(distinct t.id)::int as total_faixas,
       coalesce(string_agg(distinct g.name, ', '), '') as generos
from public.artists ar
left join public.albums al on al.artist_id = ar.id
left join public.tracks t on t.album_id = al.id
left join public.artist_genres ag on ag.artist_id = ar.id
left join public.genres g on g.id = ag.genre_id
group by ar.id;

revoke all on public.v_playlist_resumo, public.v_playlist_faixas, public.v_artista_catalogo from anon, authenticated;
grant select on public.v_playlist_resumo, public.v_playlist_faixas, public.v_artista_catalogo to authenticated;
