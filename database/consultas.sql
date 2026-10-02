USE popreport;

-- 1) Catálogo completo: música + álbum + artista + gêneros
SELECT
  m.id,
  m.titulo AS musica,
  al.titulo AS album,
  a.nome AS artista,
  al.ano_lancamento,
  GROUP_CONCAT(DISTINCT g.nome ORDER BY g.nome SEPARATOR ', ') AS generos
FROM musica m
JOIN album al ON al.id = m.album_id
JOIN artista a ON a.id = al.artista_id
LEFT JOIN artista_genero ag ON ag.artista_id = a.id
LEFT JOIN genero g ON g.id = ag.genero_id
GROUP BY m.id, m.titulo, al.titulo, a.nome, al.ano_lancamento
ORDER BY a.nome, al.ano_lancamento DESC, m.titulo;

-- 2) Relação 1:N: cada artista e a quantidade de álbuns cadastrados
SELECT a.nome, COUNT(al.id) AS quantidade_albuns
FROM artista a
LEFT JOIN album al ON al.artista_id = a.id
GROUP BY a.id, a.nome
ORDER BY quantidade_albuns DESC, a.nome;

-- 3) Relação N:N: artistas e seus gêneros (via artista_genero)
SELECT a.nome AS artista, g.nome AS genero
FROM artista a
JOIN artista_genero ag ON ag.artista_id = a.id
JOIN genero g ON g.id = ag.genero_id
ORDER BY a.nome, g.nome;

-- 4) Relação N:N: músicas de cada playlist (via playlist_musica)
SELECT p.nome AS playlist, pm.ordem, m.titulo AS musica, a.nome AS artista
FROM playlist p
JOIN playlist_musica pm ON pm.playlist_id = p.id
JOIN musica m ON m.id = pm.musica_id
JOIN album al ON al.id = m.album_id
JOIN artista a ON a.id = al.artista_id
ORDER BY p.nome, pm.ordem;

-- 5) Busca semelhante à usada pelo site
SET @busca = 'Billie';
SELECT DISTINCT m.titulo AS musica, al.titulo AS album, a.nome AS artista
FROM musica m
JOIN album al ON al.id = m.album_id
JOIN artista a ON a.id = al.artista_id
LEFT JOIN artista_genero ag ON ag.artista_id = a.id
LEFT JOIN genero g ON g.id = ag.genero_id
WHERE a.nome LIKE CONCAT('%', @busca, '%')
   OR al.titulo LIKE CONCAT('%', @busca, '%')
   OR m.titulo LIKE CONCAT('%', @busca, '%')
   OR g.nome LIKE CONCAT('%', @busca, '%')
ORDER BY a.nome, al.titulo, m.titulo;
