# popreport

Descoberta musical gratuita com identidade visual própria, busca por artista/banda, álbum e música, perfis dinâmicos, discografia, faixas populares, playlists e Spotify Embed oficial. Na versão local, quando as credenciais estão configuradas, a busca e os perfis usam diretamente a Spotify Web API.

## Site online

**https://jornalolhe.github.io/PopREPORT/**

A publicação usa GitHub Pages, sem servidor contratado e sem expor credenciais Spotify. Por isso, no Pages a busca usa a fonte pública Deezer como fallback seguro; as biografias vêm da Wikipédia quando há uma correspondência identificável. O player continua sendo o Embed oficial do Spotify.

No site online, cada visitante salva sua própria coleção neste navegador. Os cadastros não são compartilhados e não sincronizam com o MySQL. Limpar os dados do navegador remove essa coleção. A interface informa isso antes de salvar. Áudios próprios/licenciados também ficam apenas no navegador.

A reprodução completa é determinada pelo Spotify conforme conta, região e disponibilidade; o Embed pode oferecer apenas uma prévia. Nenhum áudio comercial é baixado ou hospedado pelo projeto.

## Como publicar e atualizar

O Pages está preparado para **main /docs**. Para conferir no GitHub:

1. Abra Settings > Pages.
2. Em Build and deployment, selecione Deploy from a branch.
3. Selecione main e /docs; salve.
4. Aguarde a conclusão de pages build and deployment em Actions.

Para alterar pelo editor do GitHub, edite os arquivos dentro de docs/. Essas mudanças aparecem no site após a publicação. Não coloque senhas, arquivos .env ou áudios comerciais nessa pasta.

Para desenvolver no computador, altere os arquivos da raiz e depois gere a publicação:

```sh
npm install
npm run check
npm run build:pages
npm run preview:pages
```

Abra http://127.0.0.1:3014/PopREPORT/ para conferir o mesmo formato de URL do Pages. Depois revise e envie tanto as fontes quanto docs/:

```sh
git add .
git commit -m "Atualiza PopReport"
git push
```

O build copia somente os HTML, CSS, JavaScript público e a imagem de fallback. Não copia .env, SQL, dependências ou código do servidor. Os arquivos de docs/ são gerados a partir da raiz: se você os editar diretamente no GitHub, traga a mudança para a fonte antes do próximo build para não sobrescrevê-la.

## Como rodar no seu computador (baixou o .zip?)

O PopReport usa `fetch` para conversar com o servidor (`/api/...`). Por isso ele **precisa do servidor rodando**: abrir o `index.html` com duplo clique (endereço `file://`) não funciona, e o site avisa isso na tela.

**Você precisa de:** [Node.js 18+](https://nodejs.org) e [MySQL 8](https://dev.mysql.com/downloads/mysql/) ligado.

1. Extraia o .zip, abra um terminal dentro da pasta e instale a dependência:
   ```sh
   npm install
   ```
2. Crie o arquivo `.env.local` (ele não vai para o GitHub) com a senha do seu MySQL:
   ```
   DB_PASSWORD=sua_senha_do_mysql
   ```
   Os padrões são `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_USER=root` e `DB_NAME=popreport`. Todas as opções estão em `.env.example`.
3. Crie o banco, as tabelas e os dados iniciais (pode repetir sem medo: não apaga nada):
   ```sh
   npm run db:setup
   ```
4. Inicie o servidor:
   ```sh
   npm start
   ```
5. Abra **http://127.0.0.1:3000** no navegador.

No Windows, o `iniciar.bat` faz os passos 1 a 4 sozinho. No PowerShell, use `npm.cmd` se houver bloqueio de scripts.

### Como saber se o banco está conectado

- **Na tela:** o rodapé mostra `Banco conectado · 12 músicas` (verde) ou `Banco desconectado` (vermelho).
- **No terminal:** ao iniciar, aparece `MySQL: conectado (popreport)`.
- **Pelo fetch:** abra http://127.0.0.1:3000/api/status. Deve mostrar `"connected": true` e a contagem de cada tabela.

Sem MySQL o site abre e a busca funciona, mas Músicas salvas e o formulário respondem com erro (503).

### Imagens do catálogo

O `database/popreport.sql` cadastra 12 artistas com fotos em `Imagens/` (`Benito.jpg`, `billie.jpg`, `taylor.jpg`, `Sombr.jpg`, `dean.jpg`, `miloj.jpg`, `Laufey.jpg`, `dragon.jpg`, `harry.jpg`, `fike.jpg`, `Bruno.jpg`, `20.jpg`). Essas imagens não estão no repositório: copie-as para a pasta `Imagens/`. Sem elas o site mostra uma capa genérica no lugar.

### Spotify (opcional)

Para a busca usar a Spotify Web API em vez do Deezer, preencha `SPOTIFY_CLIENT_ID` e `SPOTIFY_CLIENT_SECRET` no `.env.local`. O segredo nunca deve ir para o GitHub. Ao colar o link de uma faixa no formulário, artista, música, álbum e gênero são preenchidos pelo Spotify.

## Entendendo o fetch neste projeto

O navegador (front-end) pede dados ao servidor com `fetch`, e o servidor (`server.js`) responde em JSON. Os dois lados seguem o mesmo padrão:

**Ler dados (GET)**, em `script/app.js`:
```js
fetch('/api/lista')
  .then(resposta => resposta.json())
  .then(musicas => console.log(musicas))
  .catch(erro => console.error('Erro ao buscar:', erro));
```

**Enviar dados (POST)**, em `script/form.js`:
```js
fetch('/api/lista', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ artist: 'Radiohead', track: 'Creep', spotifyUrl: 'https://open.spotify.com/track/...' })
})
  .then(resposta => resposta.json())
  .then(salva => console.log('Salvou', salva))
  .catch(erro => console.error('Erro ao enviar:', erro));
```

**Responder (servidor)**, em `server.js`: a rota recebe, grava no MySQL com consulta parametrizada e devolve JSON.

Dica: abra o DevTools (`F12`) > aba **Network** para ver cada `fetch` acontecendo, com o status e a resposta.

Rotas disponíveis:

| Rota | O que faz |
|---|---|
| `GET /api/status` | situação do banco e do Spotify |
| `GET /api/music/search?q=&filter=&offset=` | busca de artistas, álbuns e músicas |
| `GET /api/music/artist/:id` · `/album/:id` · `/track/:id` | perfil, discografia e faixas |
| `GET /api/lista` · `POST /api/lista` | músicas salvas (lê e grava no MySQL) |
| `GET /api/collection` · `POST /api/collection` | perfil e playlists |
| `GET /api/spotify/track?url=` | metadados de uma faixa (precisa do Spotify configurado) |
| `GET /api/embed?url=` | endereço do player oficial do Spotify |
| `GET /api/resolve/:tipo/:id` | encontra no Spotify o item de uma busca pública |

## Banco de dados

O projeto usa **MySQL** (não usa Supabase nem outro serviço na nuvem). Mantidas as seis entidades principais (artista, genero, album, musica, usuario, playlist) e duas associativas (artista_genero e playlist_musica), com PK/FK, NOT NULL, UNIQUE, relações 1:N e N:N, carga inicial e consultas parametrizadas com transação. O servidor escuta apenas em `127.0.0.1` e serve somente os arquivos de uma lista pública explícita.

## Estrutura

- index.html e app.css: interface e estilo. artist.html, library.html e form.html só redirecionam para a tela certa.
- script/app.js e script/form.js: navegação, pesquisa, formulário e player.
- script/api.js: acesso ao servidor local ou coleção no navegador na publicação.
- script/music-data.js: provedor público de dados compartilhado entre Node e Pages.
- script/runtime-config.js: modo local; o build gera o modo estático em docs/.
- server.js: aplicação local (Node puro, sem Express).
- docs/: arquivos publicados pelo Pages.
- database/: criação, carga inicial, consultas e modelos acadêmicos.
- test/integration.cjs: testes locais de integração.

## Banco e requisitos acadêmicos

Mantidas as seis entidades principais (artista, genero, album, musica, usuario, playlist) e duas associativas (artista_genero e playlist_musica). PK/FK, NOT NULL, UNIQUE, relações 1:N e N:N, carga inicial e consultas estão preservadas.

Os diagramas e o modelo conceitual editável estão em database/. O .mwb não estava presente no ZIP original. Se exigido pela atividade, gere o modelo nativo no MySQL Workbench via Database > Reverse Engineer e salve-o; as instruções originais estão incluídas.

## Verificação

npm run check valida a sintaxe. npm test executa os testes do servidor e requer o MySQL configurado e internet. Quando credenciais Spotify reais estão presentes, os testes também podem validar a busca nativa, o perfil por ID de 22 caracteres e a leitura de metadados de uma faixa. A publicação estática mantém o fallback sem segredos e o Spotify Embed. Consulte VERIFICACAO.md.

Serviços externos podem mudar ou ficar indisponíveis. Existem timeout e mensagens de falha; disponibilidade permanente não é prometida.

## Fontes

- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [Deezer](https://developers.deezer.com/api)
- [Spotify Embed](https://developer.spotify.com/documentation/embeds)
- [Biografias Wikipédia / TextExtracts](https://www.mediawiki.org/wiki/API:TextExtracts)

A biografia exibida mantém atribuição à Wikipédia e identificação CC BY-SA; a fonte de cada artigo aparece no perfil. Fotos e capas vêm das fontes musicais e não são redistribuídas no repositório.

## Navegação e modelo da Aula 31

A navegação usa uma única aplicação em index.html; artista.html, library.html e form.html permanecem como entradas compatíveis e normalizam o endereço. Abrir uma tela, pesquisar e usar Voltar/Avançar mantém a raiz do site. A tela atual é registrada no histórico do navegador e restaurada ao atualizar. Links copiados apontam para a raiz; não são links individuais compartilháveis de artista.

O nome visual é popreport. O endereço popreport.github.io depende de possuir uma conta/organização com o nome popreport e o repositório popreport.github.io; renomear o site ou este repositório não altera o proprietário JornalOlhe. A publicação atual continua em https://jornalolhe.github.io/PopREPORT/.

O PDF exige no mínimo cinco entidades; foram mantidas seis principais e duas associativas. A interface utiliza perfil, playlists, músicas, álbuns, artistas e gêneros. No modo local há um usuário demonstrativo compartilhado, sem login, adequado à apresentação acadêmica no computador. O modo Pages guarda perfil, playlists e músicas separadamente em cada navegador.

O SQL completo, a descrição atualizada e o prompt do modelo conceitual estão em database/. Para o modelo físico oficial, siga INSTRUCOES_WORKBENCH.txt; as imagens incluídas são referências e não um arquivo .mwb exportado nesta execução.
