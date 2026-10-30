# Verificação do PopReport

## Fluxos cobertos

- Criar playlist → buscar artista (foto) → álbuns por data de lançamento → prévia do álbum e das faixas → adicionar várias faixas com o botão +.
- Cada faixa é identificada no Supabase por `source` + `external_id` (artista, álbum, faixa e vínculo com a playlist).
- Sem login anônimo ativo no Supabase, o app usa o armazenamento do navegador e avisa na tela.
- Nenhum segredo é publicado: o navegador usa só a chave *publishable* (RLS protege os dados).
- Imagens HTTPS externas são aceitas; URLs inseguras são rejeitadas.

## Comandos

```sh
npm run check
npm run test:unit
npm run build:pages
npm run preview:pages
```

## Segurança

- Acesso aos dados somente via RLS e RPC `add_track_to_playlist` (SECURITY DEFINER) no Supabase.
- Ids externos validados (`^[A-Za-z0-9]{1,32}$`) no cliente e no banco.
