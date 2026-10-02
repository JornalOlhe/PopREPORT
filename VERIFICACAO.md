# Verificação da entrega — 02/10/2026

## Ambiente e resultados

- Windows, Node.js 24.19.0, npm 11.17.0 e MySQL 8 (serviço MySQL80).
- Instalação npm concluída; mysql2 declarado e package-lock.json presente. Auditoria npm: zero vulnerabilidades no momento da instalação.
- npm run db:setup concluído com sucesso, sem exclusão de tabelas.
- Oito tabelas confirmadas e sete chaves estrangeiras. Todas as consultas de database/consultas.sql executadas com sucesso.
- Configuração MySQL conferida contra os parâmetros solicitados. Credenciais Spotify preservadas e não encontradas fora de .env nos arquivos textuais do projeto.
- npm run check e npm test aprovados. Os testes podem ser repetidos com o MySQL ativo e internet; usam a porta 3118 (configurável via TEST_PORT).

## Testes no navegador

- Busca geral de Laufey: 36 resultados reais (12 por categoria).
- Filtro de álbuns: Abbey Road, 12 resultados; imagens carregadas e dimensões quadradas medidas no navegador.
- Perfil da Laufey: foto circular 220 × 220 no desktop, biografia com atribuição, discografia e dez músicas populares; paginação da discografia verificada pela API.
- Perfis, formulário e acervo conferidos a 390 px; nenhuma rolagem horizontal constatada. Layout de desktop também inspecionado.
- Formulário vazio mostrou validação; cadastro real de From The Start foi gravado e apareceu em Músicas salvas (contagem local passou de 12 para 13). O registro de teste não foi adicionado ao SQL de distribuição.
- Player oficial resolveu a faixa, carregou iframe e alternou de Reproduzir para Pausar. O Spotify ofereceu excerto nesta sessão; reprodução integral não é prometida.
- Áudio próprio: um WAV de teste de 1 segundo, criado durante a validação, foi selecionado e reproduzido via URL local do navegador (paused=false, sem erro). Esse áudio de teste não integra a entrega.

## Testes de integração

- Busca de banda (Coldplay), álbum (Abbey Road) e faixa (From The Start), perfil, biografia e segunda página da discografia, com as duas credenciais Spotify explicitamente vazias.
- Embed por link, incluindo URL internacional, sem depender da Web API.
- Cadastro repetido sem Spotify mantém ID e álbum existentes, sem duplicar ou destruir metadados.
- Rejeição de filtros, offsets, links, corpo inválido e corpo acima de 64 KiB; bloqueio de POST de outra origem.
- .env, servidor, módulo de integração, SQL e dependências retornam 404 por HTTP.
- Banco indisponível simulado em processo separado: API retorna erro explícito; home continua acessível.

## Limites da verificação

Serviços públicos podem mudar ou ficar indisponíveis. O teste móvel foi realizado por viewport do navegador, não em aparelho físico. Não foi possível testar outro computador físico; a portabilidade foi conferida com instalação em cópia extraída do ZIP. A experiência de reprodução integral depende do Spotify.

O SQL/modelos acadêmicos originais foram preservados. O arquivo nativo .mwb não existia no ZIP de origem; as instruções para gerá-lo no Workbench estão incluídas. Nenhum serviço pago, SDK de reprodução Premium ou download de música comercial foi adicionado.

## Ajuste de linguagem da interface

Removidos da interface os avisos sobre MySQL, banco, API, configuração e status de infraestrutura. O formulário usa Salvar música, Salvando música e Música salva na sua coleção. Os erros de serviços agora descrevem o problema e permitem tentar novamente sem expor códigos internos ou comandos de instalação. Rodapés e explicações da busca foram simplificados. Atribuição da biografia e informações relevantes da reprodução continuam presentes.

Verificação do ajuste: sintaxe e testes de integração aprovados, formulário revisado no navegador e cadastro de faixa existente conferido sem duplicação.

## Publicação GitHub Pages

Criado modo estático em docs/, com mesma interface e consultas gratuitas pelo Deezer. A biografia usa a API pública da Wikipédia. A versão local continua usando o servidor e o MySQL; os testes locais foram executados novamente e passaram.

O build permite apenas os arquivos públicos e gera a configuração estática sem segredos. A publicação é main /docs. No modo online, o cadastro é individual por navegador, sem sincronização com o MySQL, e a interface informa isso. O Embed recebe links oficiais sem usar credenciais.
