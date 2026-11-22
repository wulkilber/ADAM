# ADAM no Supabase e Render

O serviço web usa o PostgreSQL do Supabase quando DATABASE_URL está
configurada. O login usa as contas do ADAM. Com a primeira conexão, o servidor
inicializa o schema privado adam e uma base vazia. Os registros da planilha
podem ser migrados separadamente após a validação. A aplicação antiga continua
usando a planilha.

1. Crie ou escolha um projeto Supabase dedicado ao ADAM. No painel do projeto,
   clique em **Connect** e copie a URI do **Session pooler**. Substitua o
   marcador da senha pela senha do banco com codificação de URL quando
   necessário. Use SSL com verificação de certificado, acrescentando
   `sslmode=verify-full` à URI. A conta do banco precisa criar o schema adam
   na primeira inicialização.
2. Abra o Blueprint em
   https://dashboard.render.com/blueprint/new?repo=https://github.com/wulkilber/ADAM
   e conecte o repositório. Forneça a URI em **DATABASE_URL** e uma senha
   temporária com pelo menos 6 caracteres em **ADAM_INITIAL_PASSWORD**.
   Digite os valores só no painel. O Blueprint usa o plano gratuito e não
   provisiona um segundo banco no Render.
3. Aguarde a implantação. Abra a URL do serviço e entre como `admin` com a
   senha temporária. Troque a senha quando o ADAM pedir. O bootstrap só cria
   a conta se o banco estiver vazio. Remova ADAM_INITIAL_PASSWORD do Render
   depois de inicializar o banco e validar a entrada.
4. Crie contas de Assistente e DEPE e valide um encaminhamento fictício.
   Verifique `/healthz`, o login, a geração de relatório e o retorno da
   confirmação de leitura e da conclusão ao assistente.

O PostgreSQL persiste a base e o histórico entre reinícios. Sessões web ficam
em memória e pedem novo login após reinício do processo. O plano gratuito do
Render pode suspender a instância ociosa. Mantenha apenas uma instância para
evitar sessões distribuídas entre processos.
