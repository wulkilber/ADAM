# ADAM — Ocorrências Estudantis

Aplicação web do **IFAM – Campus Tefé** para registrar ocorrências, acompanhar históricos anuais e organizar encaminhamentos ao DEPE. A implantação no Render usa Node.js, PostgreSQL no Supabase e login com usuário e senha.

## Começar no computador

Instale Node.js 22.15 ou superior (Node 24 também é aceito), abra o terminal nesta pasta e execute:

```sh
npm ci
npm run demo
```

Abra **http://localhost:3000** e clique em **Entrar em demonstração**.

Esta demonstração usa dados fictícios em memória no **servidor**. Navegadores conectados à mesma instância veem o mesmo estado. Encerrar o servidor restaura os dados fictícios; a demonstração não escreve na planilha e não é permitida quando NODE_ENV=production.

### Revisar os três perfis localmente

Depois de instalar as dependências com `npm ci`, execute:

```sh
node test/helpers/portal-preview.js
```

Abra **http://127.0.0.1:3100**. Entre com `admin`, `assistente` ou `depe`. A senha de teste é `adamteste` para todos. A revisão roda no seu computador com dados fictícios em memória.

O título da ocorrência personalizada é gravado no JSON da própria ocorrência no PostgreSQL e copiado ao histórico do encaminhamento. Os registros anteriores continuam compatíveis. A atualização dispensa migração SQL. A edição registra o autor, a data e os campos alterados na auditoria. Uma correção atualiza o relatório de um caso pendente e preserva o conteúdo do relatório de um caso já enviado.

As marcas usadas na interface são do [portal oficial do IFAM](https://portal.ifam.edu.br/). O nome do campus acompanha as duas versões da marca.

## Conectar a planilha existente

Siga [docs/MIGRACAO.md](docs/MIGRACAO.md). É necessário configurar:

- Acesso de uma conta de serviço à planilha privada, usando a API Google Sheets.
- Um cliente OAuth Google para o login dos usuários.
- As variáveis de ambiente do arquivo `.env.example`.
- Uma única instância do servidor, com diretório `data/` persistente.

Não recrie as abas nem copie alunos manualmente: os nomes das oito abas, os campos, IDs e snapshots da versão anterior são mantidos. O script `npm run sheets:check` verifica a estrutura **sem escrever**. Antes da troca, conclua operações pendentes no Apps Script, faça backup privado e desligue as gravações do sistema antigo.

```sh
# Copie .env.example para .env e preencha somente no computador/servidor.
npm run sheets:check
npm start
```

Não envie `.env`, chaves JSON, tokens, backups ou dados reais ao GitHub. O repositório tem `.gitignore` e serve somente uma lista explícita de arquivos públicos.

## Funcionalidades

- Login com usuário e senha e permissões de Administrador, Assistente de Alunos e DEPE verificadas no servidor. A integração legada com planilhas mantém seu fluxo de login Google.
- Menu Alunos do DEPE com cadastro, edição, desativação e histórico anual. A desativação preserva os registros e impede novas ocorrências.
- Uma abordagem conta uma vez, mesmo com vários tipos predefinidos. Na versão PostgreSQL, o assistente também pode registrar um tipo personalizado com título próprio.
- Terceira ocorrência cria um único encaminhamento PENDENTE com snapshot e três IDs.
- Envio pelo assistente, confirmação de leitura e encerramento pelo DEPE. Leitura e encerramento são independentes. Casos encerrados seguem disponíveis no histórico e na fila de encerrados.
- Documento imprimível e PDF A4 gerado pelo servidor, sem arquivos temporários no Google Drive.
- Relatórios, interface responsiva e modo demonstrativo explícito.
- Validação no servidor, versões, idempotência, auditoria, fila de gravação e recuperação após resposta perdida.

## Estrutura

| Pasta                 | Responsabilidade                                                                     |
| --------------------- | ------------------------------------------------------------------------------------ |
| `public/`             | HTML, CSS e interface JavaScript; comunicação por HTTP com o servidor                |
| `shared/core.cjs`     | Regras de negócio preservadas, utilizadas no servidor e para validação de formulário |
| `server/`             | HTTP, login, serviço de aplicação, Google Sheets, coordenação e PDF                  |
| `scripts/`            | Verificação de sintaxe e leitura de diagnóstico da planilha                          |
| `test/`               | Testes de regras, recuperação, API, segurança e navegador                            |
| `docs/`               | Migração, configuração e operação                                                    |
| `legacy/apps-script/` | Cópia dos arquivos recebidos, somente para referência/retorno controlado             |

O servidor novo não executa `legacy/`, não usa `google.script.run`, `Session`, `SpreadsheetApp`, `LockService` ou `DocumentApp`. O frontend não usa localStorage como banco. Não foi introduzido outro banco de dados.

## Testar

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Se já tiver Chromium instalado, defina `CHROMIUM_EXECUTABLE` com o caminho do executável. Os testes do navegador iniciam a demonstração local e usam somente dados fictícios.

O código inclui testes de identidade/permissão, CSRF, concorrência na instância, limite anual, duplicação, conflito de versão, journal, PDF e fluxo completo da interface. **Login real do Google e escrita na planilha institucional dependem das credenciais e ainda precisam ser validados no ambiente do responsável.** Os testes não acessam a planilha real.

## Hospedar

Use um serviço Node.js persistente, com uma única instância, HTTPS e volume persistente para `DATA_DIR`. `npm start` inicia o servidor. Configure HOST=0.0.0.0, APP_URL com a origem HTTPS definitiva e NODE_ENV=production. A rota `/healthz` verifica se o processo HTTP responde; não é teste de acesso ao Google.

O `Dockerfile` é uma opção de empacotamento. Não há hospedagem provisionada por este projeto. **GitHub Pages não executa este backend.** Não use funções sem estado nem múltiplas réplicas com a coordenação atual. Leia [docs/OPERACAO.md](docs/OPERACAO.md).

Manter Google Sheets conserva seus limites de latência e cotas. As escritas agora usam um batch atômico entre abas e o PDF é local, mas não há promessa de desempenho sem medir o ambiente real. O MVP ainda lê as tabelas integralmente; paginação de resposta não elimina esse custo.
