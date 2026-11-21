# Migrar sem perder a planilha

## 1. Preservar o ambiente atual

1. Faça uma cópia **privada** da planilha e guarde os arquivos Apps Script atuais.
2. Use inicialmente uma cópia de teste com dados fictícios.
3. No Apps Script antigo, reconcilie Operacoes cujo estado não seja CONCLUIDA.
4. Não ligue o servidor novo para gravar enquanto o antigo também puder gravar. Os locks são de ambientes diferentes.

O novo servidor espera Alunos, Usuarios, Ocorrencias, Encaminhamentos, AnosLetivos, Configuracoes, Operacoes e Auditoria com os cabeçalhos do sistema existente. Ele não apaga/cria abas automaticamente. `server/schema.js` é a referência exata; o diagnóstico interrompe quando encontra incompatibilidade, ID vazio ou duplicado.

## 2. Habilitar a API Google Sheets

No Google Cloud do projeto autorizado pela instituição, habilite a **Google Sheets API**. Crie uma conta de serviço dedicada. Ela não precisa de papel Editor/Owner do projeto Cloud para trabalhar com uma planilha compartilhada.

Compartilhe **somente a planilha necessária** como editora com o `client_email` da conta de serviço. Faça isso na configuração de compartilhamento do Google Sheets; mantenha acesso geral restrito. As contas dos assistentes não precisam editar diretamente a planilha.

Para desenvolvimento local, se as políticas da instituição permitirem chave JSON:

1. Salve a chave em `credentials/service-account.json`, fora da pasta public.
2. Configure GOOGLE_APPLICATION_CREDENTIALS com esse caminho.
3. Nunca cole a chave no GitHub ou em uma mensagem. A chave deve permanecer em arquivo local ou segredo da hospedagem.

Na hospedagem, a biblioteca também aceita credenciais padrão do ambiente (ADC) ou `GOOGLE_SERVICE_ACCOUNT_JSON` via gerenciador de segredos. Não configure os dois métodos sem necessidade. Em ambiente que suporte identidade de workload, prefira ADC sem chave baixada.

## 3. Configurar o login Google

O login agora usa OAuth do Google e não Session.getActiveUser do Apps Script.

1. Configure a tela de consentimento do projeto conforme as contas que poderão usar o sistema. Para instituição Workspace, use a audiência institucional disponível; para teste externo, cadastre as contas de teste quando exigido pelo Google.
2. Crie credenciais OAuth do tipo **Aplicativo da Web**.
3. Cadastre o URI de redirecionamento exato para teste local:

```text
http://localhost:3000/auth/google/callback
```

4. Guarde o Client ID e o Client Secret nas variáveis GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.
5. Para hospedagem, adicione o URI da origem HTTPS real seguido de `/auth/google/callback`.

O fluxo usa state vinculado ao navegador, nonce, PKCE, validação do ID token pela biblioteca oficial e escopos openid/email/profile. Depois, o servidor exige e-mail único, ativo e autorizado na aba Usuarios. Perfil nunca vem do navegador. Se configurar GOOGLE_ALLOWED_DOMAIN, o domínio `hd` verificado também precisa corresponder; isso não substitui a allowlist.

## 4. Preencher `.env`

Copie `.env.example` para `.env`. No PowerShell:

```powershell
Copy-Item .env.example .env
```

| Variável                       | Exemplo/uso                                                     |
| ------------------------------ | --------------------------------------------------------------- |
| NODE_ENV                       | development local; production na hospedagem                     |
| PORT                           | 3000, ou porta informada pela hospedagem                        |
| HOST                           | 127.0.0.1 local; 0.0.0.0 para receber rede/proxy                |
| APP_URL                        | http://localhost:3000 local; origem HTTPS pública na hospedagem |
| DEMO_MODE                      | false                                                           |
| SPREADSHEET_ID                 | Trecho entre `/d/` e `/edit` no endereço da planilha            |
| GOOGLE_CLIENT_ID               | ID OAuth do aplicativo web                                      |
| GOOGLE_CLIENT_SECRET           | Segredo OAuth, somente no servidor                              |
| GOOGLE_APPLICATION_CREDENTIALS | Caminho local da chave da conta de serviço, quando utilizada    |
| DATA_DIR                       | Diretório privado e persistente, por exemplo ./data             |
| SHEETS_EXCLUSIVE_WRITER        | true somente quando o ADAM for o único escritor                 |
| GOOGLE_ALLOWED_DOMAIN          | Opcional, domínio institucional aprovado                        |
| LOGO_PATH                      | Opcional, caminho local para PNG/JPEG oficial usado no PDF      |

Campus, ano letivo e fuso continuam nas abas Configuracoes e AnosLetivos. Exatamente um ano deve estar ativo. Não envie senhas para Usuarios. E-mails devem ser únicos e perfis devem corresponder aos já definidos.

## 5. Validar antes da troca

```sh
npm ci
npm run check
npm test
npm run sheets:check
npm start
```

O diagnóstico usa escopo somente de leitura e mostra contagens de registros, não nomes/e-mails. Teste na cópia da planilha:

- Entrar com duas contas autorizadas e negar uma conta não cadastrada.
- Cadastrar matrícula com zeros iniciais e conferir a célula como texto.
- Registrar duas irregularidades numa abordagem: contagem aumenta uma vez.
- Na terceira, verificar encaminhamento único e três IDs corretos.
- Repetir requisição sem duplicar; testar duas sessões ao mesmo tempo.
- Emitir PDF com acentos e observação longa; status continua PENDENTE.
- Encaminhar/concluir com responsáveis corretos; histórico permanece.
- Desativar usuário em Usuarios e verificar negativa na próxima requisição.
- Parar/reiniciar servidor e conferir os dados da planilha.

Somente após esses testes substitua o SPREADSHEET_ID pela planilha aprovada. Interrompa o Apps Script e mantenha seu código como referência, sem gravações simultâneas. O repositório recebido contém códigos, não acesso à planilha, dados reais nem credenciais; essa etapa não foi executada automaticamente.

## Testar no celular sem Google

No Windows, abra PowerShell na pasta do projeto. Substitua o IP abaixo pelo IPv4 do computador mostrado em `ipconfig`:

```powershell
$env:HOST="0.0.0.0"
$env:APP_URL="http://192.168.1.100:3000"
npm run demo
```

Celular e computador devem estar na mesma rede. Acesse exatamente o endereço de APP_URL. Libere a porta 3000 somente na rede privada se o firewall solicitar. Use dados fictícios. Para login Google em ambiente publicado, use HTTPS e o callback cadastrado.

## Referências oficiais consultadas

- https://developers.google.com/identity/protocols/oauth2/web-server
- https://cloud.google.com/nodejs/docs/reference/google-auth-library/latest
- https://developers.google.com/workspace/sheets/api/guides/batchupdate
- https://developers.google.com/workspace/sheets/api/limits

As opções de conta, consentimento e compartilhamento dependem das políticas da instituição.
