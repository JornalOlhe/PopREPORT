# popreport

Descoberta musical gratuita com identidade visual própria, busca por artista/banda, álbum e música, perfis dinâmicos, discografia, faixas populares, playlists e Spotify Embed oficial. Na versão local, quando as credenciais estão configuradas, a busca e os perfis usam diretamente a Spotify Web API.

## Site online

**https://jornalolhe.github.io/PopREPORT/**

A publicação usa GitHub Pages, sem servidor contratado e sem expor credenciais Spotify. Por isso, no Pages a busca usa a fonte pública Deezer como fallback seguro; as biografias vêm da Wikipédia quando há uma correspondência identificável. O player continua sendo o Embed oficial do Spotify.

## Criar playlist e adicionar músicas

Não há mais campo de link. O fluxo é: **criar a playlist → buscar o artista (foto e nome) → escolher o álbum (do mais recente ao mais antigo; dá para inverter) → ouvir as prévias → tocar no + de cada faixa** (ou em "Adicionar todas"). A busca de artista só é liberada depois que existe uma playlist. Cada faixa adicionada é identificada no banco com artista, álbum e música, sem duplicar.

No site online, as playlists ficam no **Supabase** (schema em `supabase/schema.sql`; carga inicial em `supabase/seed.sql`, protegido por RLS). Cada pessoa cria uma conta com **nome de usuário, e-mail e senha** (Supabase Auth, sem Google e sem recuperação de senha por enquanto). E-mail e nome de usuário são únicos: repetidos são recusados. Sem entrar, o site usa o armazenamento do navegador e avisa na tela. Para entrar logo após o cadastro, desligue **Authentication > Sign In / Providers > Email > Confirm email** no painel do Supabase (senão a pessoa precisa clicar no link enviado por e-mail). A URL do projeto e a chave *publishable* ficam em `supabase.public.json` (podem ser públicas; nunca coloque a chave `service_role` ali).

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

## Estrutura

- index.html, artist.html, library.html e form.html: interface fonte.
- script/app.js e script/form.js: navegação, pesquisa, player e o fluxo playlist → artista → álbum → faixas.
- script/api.js: acesso ao servidor local ou, na publicação, ao Supabase (com reserva no navegador).
- script/cloud.js: cliente mínimo do Supabase (login anônimo + PostgREST).
- supabase.public.json: URL e chave pública do projeto Supabase usadas no build do Pages.
- script/music-data.js: provedor público de dados compartilhado entre Node e Pages.
- script/runtime-config.js: modo local; o build gera o modo estático em docs/.
- docs/: arquivos publicados pelo Pages.
- supabase/: schema.sql (tabelas, RLS e RPC) e seed.sql (catálogo inicial migrado do antigo MySQL).
- test/unit.cjs: testes sem rede nem banco (`npm run test:unit`), também executados no CI.

## Banco

O banco é somente o Supabase (Postgres). O antigo MySQL foi removido; seus dados iniciais (12 artistas, 12 álbuns, 12 músicas, 10 gêneros) foram migrados e continuam no histórico do Git.

## Verificação

npm run check valida a sintaxe e npm run test:unit roda o fluxo completo (artista → álbuns → faixa → playlist → +) com Deezer e Supabase simulados, sem rede. A publicação estática não usa segredos. Consulte VERIFICACAO.md.

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

O PDF exige no mínimo cinco entidades; foram mantidas seis principais e duas associativas. A interface utiliza perfil, playlists, músicas, álbuns, artistas e gêneros. No modo local há um usuário demonstrativo compartilhado, sem login, adequado à apresentação acadêmica no computador. O modo Pages guarda perfil, playlists e músicas no Supabase por navegador (login anônimo), ou apenas no navegador enquanto o login anônimo estiver desligado.

O SQL completo, a descrição atualizada e o prompt do modelo conceitual estão em database/. Para o modelo físico oficial, siga INSTRUCOES_WORKBENCH.txt; as imagens incluídas são referências e não um arquivo .mwb exportado nesta execução.
