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

## Versão local com MySQL

Preservada para o projeto acadêmico. Requisitos: Node.js 22+ recomendado, MySQL Server 8 ativo e internet.

1. Instale as dependências: npm install.
2. Copie .env.example como .env.
3. Preencha DB_PASSWORD com a senha do MySQL instalado. Os padrões são DB_HOST=127.0.0.1, DB_PORT=3306, DB_USER=root e DB_NAME=popreport.
4. Para busca e perfis diretamente do Spotify, preencha SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env. O segredo nunca deve ser enviado ao GitHub.
5. Execute npm run db:setup e npm start.
6. Abra http://127.0.0.1:3000.

No PowerShell, use npm.cmd se houver bloqueio de scripts. iniciar.bat também instala, prepara o banco e inicia o servidor. O setup não muda a senha da sua instalação nem apaga tabelas existentes.

O .env real é local e fica fora do repositório público. O iniciar.bat cria esse arquivo a partir do .env.example quando ele ainda não existe. Com SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET configurados, a busca principal, os perfis de artista, fotos, seguidores, discografia, faixas populares e o preenchimento do formulário vêm diretamente do Spotify. Sem as credenciais, a aplicação local mantém o fallback público para descoberta e o Spotify Embed por link continua disponível.

No modo local, Músicas salvas lê o MySQL e o formulário grava com consultas parametrizadas e transação. Ao colar um link de faixa, o formulário tenta preencher artista, música, álbum e gênero diretamente pelo Spotify. Em indisponibilidade de metadados, o cadastro preserva os dados já existentes. O servidor escuta apenas em 127.0.0.1 e permite somente arquivos públicos definidos explicitamente.

## Estrutura

- index.html, artist.html, library.html e form.html: interface fonte.
- script/app.js e script/form.js: navegação, pesquisa, formulário e player.
- script/api.js: acesso ao servidor local ou coleção no navegador na publicação.
- script/music-data.js: provedor público de dados compartilhado entre Node e Pages.
- script/runtime-config.js: modo local; o build gera o modo estático em docs/.
- server.js e music.js: aplicação local.
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
