# Verificação do PopReport v5

## Fluxos cobertos pelo projeto

- Busca por artista, álbum e música.
- Com credenciais no .env, a versão local usa a Spotify Web API como fonte principal da busca e dos perfis.
- Perfis de artista aceitam IDs nativos do Spotify, exibem foto, seguidores, discografia e faixas populares.
- O formulário lê o link de uma faixa e tenta preencher artista, música, álbum e gênero diretamente pelo Spotify.
- Músicas salvas, usuário e playlists continuam persistidos no MySQL no modo local.
- No GitHub Pages, não há segredo publicado: a descoberta usa a fonte pública de fallback e o player continua sendo o Spotify Embed.
- Navegação entre telas grava o estado na URL, permitindo atualizar ou copiar o endereço de busca, perfil e playlist.
- Imagens locais em Imagens/ e imagens HTTPS externas são aceitas; URLs inseguras são rejeitadas.
- O .env permanece fora do Git. iniciar.bat cria uma cópia local de .env.example quando necessário.

## Comandos de validação

```sh
npm install
npm run check
npm run db:setup
npm test
npm run build:pages
npm run preview:pages
```

O teste de integração sempre valida o funcionamento sem credenciais Spotify. Quando SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET existem no ambiente, ele também valida busca, perfil e metadados diretamente pela Spotify Web API.

## Segurança

- .env, SQL, server.js, node_modules e demais arquivos privados não são servidos pelo servidor.
- O servidor local escuta somente em 127.0.0.1.
- Escritas rejeitam origem cross-site.
- URLs do Spotify são validadas e normalizadas.
- Consultas MySQL de entrada usam parâmetros e as gravações relacionadas usam transações.
