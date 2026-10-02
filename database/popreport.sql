-- ============================================================================
-- POPREPORT - MODELO FÍSICO / SCRIPT DE CRIAÇÃO
-- MySQL 8.0+
-- ============================================================================
-- Entidades principais: ARTISTA, GENERO, ALBUM, MUSICA, USUARIO, PLAYLIST
-- Associativas: ARTISTA_GENERO e PLAYLIST_MUSICA
--
-- Relacionamentos 1:N:
--   ARTISTA 1 --- N ALBUM
--   ALBUM   1 --- N MUSICA
--   USUARIO 1 --- N PLAYLIST
--
-- Relacionamentos N:N resolvidos por tabela associativa:
--   ARTISTA N --- N GENERO   -> ARTISTA_GENERO
--   PLAYLIST N --- N MUSICA  -> PLAYLIST_MUSICA
-- ============================================================================

CREATE DATABASE IF NOT EXISTS popreport
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE popreport;

CREATE TABLE IF NOT EXISTS artista (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  spotify_id VARCHAR(64) NULL,
  nome VARCHAR(120) NOT NULL,
  imagem_url VARCHAR(500) NULL,
  pagina_local VARCHAR(180) NULL,
  descricao VARCHAR(800) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_artista PRIMARY KEY (id),
  CONSTRAINT uq_artista_spotify UNIQUE (spotify_id),
  CONSTRAINT uq_artista_nome UNIQUE (nome),
  CONSTRAINT uq_artista_pagina UNIQUE (pagina_local)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS genero (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(80) NOT NULL,
  CONSTRAINT pk_genero PRIMARY KEY (id),
  CONSTRAINT uq_genero_nome UNIQUE (nome)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS album (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  artista_id INT UNSIGNED NOT NULL,
  spotify_id VARCHAR(64) NULL,
  titulo VARCHAR(180) NOT NULL,
  imagem_url VARCHAR(500) NULL,
  ano_lancamento SMALLINT UNSIGNED NULL,
  link_spotify VARCHAR(500) NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_album PRIMARY KEY (id),
  CONSTRAINT uq_album_spotify UNIQUE (spotify_id),
  CONSTRAINT uq_album_artista_titulo UNIQUE (artista_id, titulo),
  CONSTRAINT uq_album_link UNIQUE (link_spotify),
  CONSTRAINT fk_album_artista FOREIGN KEY (artista_id)
    REFERENCES artista(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS musica (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  album_id INT UNSIGNED NOT NULL,
  spotify_id VARCHAR(64) NOT NULL,
  titulo VARCHAR(180) NOT NULL,
  duracao_ms INT UNSIGNED NOT NULL DEFAULT 0,
  explicita BOOLEAN NOT NULL DEFAULT FALSE,
  numero_faixa SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  link_spotify VARCHAR(500) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_musica PRIMARY KEY (id),
  CONSTRAINT uq_musica_spotify UNIQUE (spotify_id),
  CONSTRAINT uq_musica_link UNIQUE (link_spotify),
  CONSTRAINT fk_musica_album FOREIGN KEY (album_id)
    REFERENCES album(id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Tabela associativa que resolve ARTISTA N:N GENERO.
CREATE TABLE IF NOT EXISTS artista_genero (
  artista_id INT UNSIGNED NOT NULL,
  genero_id INT UNSIGNED NOT NULL,
  CONSTRAINT pk_artista_genero PRIMARY KEY (artista_id, genero_id),
  CONSTRAINT fk_artista_genero_artista FOREIGN KEY (artista_id)
    REFERENCES artista(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_artista_genero_genero FOREIGN KEY (genero_id)
    REFERENCES genero(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuario (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL,
  criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_usuario PRIMARY KEY (id),
  CONSTRAINT uq_usuario_email UNIQUE (email)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS playlist (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id INT UNSIGNED NOT NULL,
  nome VARCHAR(120) NOT NULL,
  descricao VARCHAR(300) NULL,
  criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_playlist PRIMARY KEY (id),
  CONSTRAINT uq_playlist_usuario_nome UNIQUE (usuario_id, nome),
  CONSTRAINT fk_playlist_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuario(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- Tabela associativa que resolve PLAYLIST N:N MUSICA.
CREATE TABLE IF NOT EXISTS playlist_musica (
  playlist_id INT UNSIGNED NOT NULL,
  musica_id INT UNSIGNED NOT NULL,
  ordem SMALLINT UNSIGNED NOT NULL,
  adicionada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT pk_playlist_musica PRIMARY KEY (playlist_id, musica_id),
  CONSTRAINT uq_playlist_ordem UNIQUE (playlist_id, ordem),
  CONSTRAINT fk_playlist_musica_playlist FOREIGN KEY (playlist_id)
    REFERENCES playlist(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_playlist_musica_musica FOREIGN KEY (musica_id)
    REFERENCES musica(id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ============================================================================
-- CARGA INICIAL DO CATÁLOGO
-- A home usa estes registros vindos do MySQL.
-- ============================================================================

INSERT INTO genero (nome) VALUES
  ('Pop'), ('Pop alternativo'), ('Indie pop'), ('Rock alternativo'),
  ('Reggaeton'), ('Trap latino'), ('Jazz pop'), ('Soul'), ('R&B'), ('Funk')
ON DUPLICATE KEY UPDATE nome = VALUES(nome);

INSERT INTO artista (nome, imagem_url, pagina_local) VALUES
  ('Bad Bunny', '/Imagens/Benito.jpg', 'Bad_Bunny.html'),
  ('Billie Eilish', '/Imagens/billie.jpg', 'Billie_Eilish.html'),
  ('Bruno Mars', '/Imagens/Bruno.jpg', 'Bruno_Mars.html'),
  ('Dominic Fike', '/Imagens/fike.jpg', 'Dominic_Fike.html'),
  ('Harry Styles', '/Imagens/harry.jpg', 'Harry_Styles.html'),
  ('Imagine Dragons', '/Imagens/dragon.jpg', 'Imagine_Dragons.html'),
  ('Laufey', '/Imagens/Laufey.jpg', 'Laufey.html'),
  ('Milo J', '/Imagens/miloj.jpg', 'Milo_J.html'),
  ('Olivia Dean', '/Imagens/dean.jpg', 'Olivia_Dean.html'),
  ('Sombr', '/Imagens/Sombr.jpg', 'Sombr.html'),
  ('Taylor Swift', '/Imagens/taylor.jpg', 'Taylor_Swift.html'),
  ('Twenty One Pilots', '/Imagens/20.jpg', 'Twenty_One_Pilots.html')
ON DUPLICATE KEY UPDATE
  imagem_url = VALUES(imagem_url),
  pagina_local = VALUES(pagina_local);

INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Reggaeton' WHERE a.nome='Bad Bunny';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Trap latino' WHERE a.nome='Bad Bunny';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Pop alternativo' WHERE a.nome='Billie Eilish';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Pop' WHERE a.nome='Bruno Mars';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Funk' WHERE a.nome='Bruno Mars';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Indie pop' WHERE a.nome='Dominic Fike';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Pop' WHERE a.nome='Harry Styles';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Rock alternativo' WHERE a.nome='Imagine Dragons';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Jazz pop' WHERE a.nome='Laufey';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Trap latino' WHERE a.nome='Milo J';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Soul' WHERE a.nome='Olivia Dean';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='R&B' WHERE a.nome='Olivia Dean';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Indie pop' WHERE a.nome='Sombr';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Pop' WHERE a.nome='Taylor Swift';
INSERT IGNORE INTO artista_genero (artista_id, genero_id)
SELECT a.id, g.id FROM artista a JOIN genero g ON g.nome='Rock alternativo' WHERE a.nome='Twenty One Pilots';

INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'OASIS', '/Imagens/Benito.jpg', 2019 FROM artista WHERE nome='Bad Bunny'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'HIT ME HARD AND SOFT', '/Imagens/billie.jpg', 2024 FROM artista WHERE nome='Billie Eilish'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Die With A Smile - Single', '/Imagens/Bruno.jpg', 2024 FROM artista WHERE nome='Bruno Mars'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Don''t Forget About Me, Demos', '/Imagens/fike.jpg', 2018 FROM artista WHERE nome='Dominic Fike'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Harry''s House', '/Imagens/harry.jpg', 2022 FROM artista WHERE nome='Harry Styles'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Evolve', '/Imagens/dragon.jpg', 2017 FROM artista WHERE nome='Imagine Dragons'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Bewitched', '/Imagens/Laufey.jpg', 2023 FROM artista WHERE nome='Laufey'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Rara Vez - Single', '/Imagens/miloj.jpg', 2023 FROM artista WHERE nome='Milo J'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'The Art of Loving', '/Imagens/dean.jpg', 2025 FROM artista WHERE nome='Olivia Dean'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'I Barely Know Her', '/Imagens/Sombr.jpg', 2025 FROM artista WHERE nome='Sombr'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Lover', '/Imagens/taylor.jpg', 2019 FROM artista WHERE nome='Taylor Swift'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);
INSERT INTO album (artista_id, titulo, imagem_url, ano_lancamento)
SELECT id, 'Blurryface', '/Imagens/20.jpg', 2015 FROM artista WHERE nome='Twenty One Pilots'
ON DUPLICATE KEY UPDATE imagem_url=VALUES(imagem_url), ano_lancamento=VALUES(ano_lancamento);

INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '0fea68AdmYNygeTGI4RC18', 'LA CANCIÓN', 'https://open.spotify.com/track/0fea68AdmYNygeTGI4RC18' FROM album WHERE titulo='OASIS'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '6dOtVTDdiauQNBQEDOtlAB', 'BIRDS OF A FEATHER', 'https://open.spotify.com/track/6dOtVTDdiauQNBQEDOtlAB' FROM album WHERE titulo='HIT ME HARD AND SOFT'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '2plbrEY59IikOBgBGLjaoe', 'Die With A Smile', 'https://open.spotify.com/track/2plbrEY59IikOBgBGLjaoe' FROM album WHERE titulo='Die With A Smile - Single'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '7yNf9YjeO5JXUE3JEBgnYc', 'Babydoll', 'https://open.spotify.com/track/7yNf9YjeO5JXUE3JEBgnYc' FROM album WHERE titulo='Don''t Forget About Me, Demos'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '4Dvkj6JhhA12EX05fT7y2e', 'As It Was', 'https://open.spotify.com/track/4Dvkj6JhhA12EX05fT7y2e' FROM album WHERE titulo='Harry''s House'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '0CcQNd8CINkwQfe1RDtGV6', 'Believer', 'https://open.spotify.com/track/0CcQNd8CINkwQfe1RDtGV6' FROM album WHERE titulo='Evolve'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '46rPcSaUj5jHxX60xWmsMD', 'From The Start', 'https://open.spotify.com/track/46rPcSaUj5jHxX60xWmsMD' FROM album WHERE titulo='Bewitched'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '7MVIfkyzuUmQ716j8U7yGR', 'Rara Vez', 'https://open.spotify.com/track/7MVIfkyzuUmQ716j8U7yGR' FROM album WHERE titulo='Rara Vez - Single'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '1qbmS6ep2hbBRaEZFpn7BX', 'Man I Need', 'https://open.spotify.com/track/1qbmS6ep2hbBRaEZFpn7BX' FROM album WHERE titulo='The Art of Loving'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '0FTmksd2dxiE5e3rWyJXs6', 'Back to Friends', 'https://open.spotify.com/track/0FTmksd2dxiE5e3rWyJXs6' FROM album WHERE titulo='I Barely Know Her'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '1BxfuPKGuaTgP7aM0Bbdwr', 'Cruel Summer', 'https://open.spotify.com/track/1BxfuPKGuaTgP7aM0Bbdwr' FROM album WHERE titulo='Lover'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);
INSERT INTO musica (album_id, spotify_id, titulo, link_spotify)
SELECT id, '3CRDbSIZ4r5MsZ0YwxuEkn', 'Stressed Out', 'https://open.spotify.com/track/3CRDbSIZ4r5MsZ0YwxuEkn' FROM album WHERE titulo='Blurryface'
ON DUPLICATE KEY UPDATE titulo=VALUES(titulo), album_id=VALUES(album_id);

INSERT INTO usuario (nome, email) VALUES
  ('Visitante PopReport', 'visitante@popreport.local')
ON DUPLICATE KEY UPDATE nome=VALUES(nome);

INSERT INTO playlist (usuario_id, nome, descricao)
SELECT id, 'Destaques', 'Seleção inicial do catálogo PopReport'
FROM usuario WHERE email='visitante@popreport.local'
ON DUPLICATE KEY UPDATE descricao=VALUES(descricao);

-- Demonstração do N:N PLAYLIST <-> MUSICA: cinco músicas na playlist Destaques.
INSERT IGNORE INTO playlist_musica (playlist_id, musica_id, ordem)
SELECT p.id, m.id, m.ordem
FROM playlist p
JOIN usuario u ON u.id = p.usuario_id
JOIN (
  SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS ordem
  FROM musica
  LIMIT 5
) m ON 1=1
WHERE u.email='visitante@popreport.local'
  AND p.nome='Destaques';
