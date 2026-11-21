# Operação e recuperação

## Um escritor por planilha

As mutações passam por uma fila no processo. Uma trava de diretório em DATA_DIR impede duas instâncias de compartilhar o mesmo diretório. **Ela não é um lock distribuído do Google Sheets.** Duas máquinas com diretórios diferentes não são coordenadas.

Por isso, a implantação deve manter **uma única instância e um único processo Node**, sem réplicas, sem cluster PM2, sem outro Apps Script e sem edição manual concorrente nas abas de negócio. Use implantação que encerre a instância antiga antes de iniciar a nova. Não use deploy com dois escritores sobrepostos. SHEETS_EXCLUSIVE_WRITER=true registra a configuração operacional esperada, mas não detecta escritores externos.

O volume privado DATA_DIR é obrigatório em produção. Nunca o disponibilize pela web nem o envie ao GitHub. Ele armazena dados necessários para recuperar uma gravação; pode conter dados de alunos. Planeje backup e acesso restrito junto com a planilha.

## Gravação atômica

O serviço relê a planilha, verifica usuário/perfil, normaliza a entrada, calcula hash, procura idempotência e gera o plano. O journal local é gravado e sincronizado antes do envio.

Uma chamada `spreadsheets.batchUpdate` envia posições fixas de células para todas as entidades, auditoria e resultado CONCLUIDA da operação. O Google aplica o lote atomicamente; isso **não** transforma a leitura e o cálculo anteriores em uma transação distribuída. A exclusividade do escritor continua necessária.

O servidor usa `stringValue` literal para impedir fórmulas e preservar matrículas. Posições reais das linhas, inclusive lacunas, são mantidas. Cabeçalhos incompatíveis ou IDs duplicados impedem a operação.

## Resposta desconhecida

Um timeout não prova que a gravação falhou. O cliente preserva a chave da tentativa. O servidor não faz retentativas automáticas de batch:

1. Consulta se o resultado da operação já existe em Operacoes.
2. Se existe com o mesmo hash, limpa o journal local e devolve o resultado.
3. Se não existe, mantém as outras gravações bloqueadas durante a janela de incerteza.
4. Após 185 segundos da tentativa, pode reenviar o mesmo lote com as mesmas posições e IDs, antes de qualquer nova escrita. A referência do Google informa limite de processamento de 180 segundos por requisição.

Enquanto houver incerteza, retorna OPERATION_PENDING. Nunca apague pending.json para "destravar", nunca gere uma nova chave como solução e nunca edite manualmente as linhas envolvidas. Se houver erro persistente, preserve journal e backup e diagnostique o acesso/cabeçalhos.

Operações PREPARADA/EM_APLICACAO/REQUER_RECONCILIACAO da versão antiga precisam ser reconciliadas **no Apps Script antes da troca**. O serviço novo não interpreta silenciosamente um plano antigo incompleto.

## Trava após encerramento abrupto

Em encerramento normal (Ctrl+C/SIGTERM), o processo aguarda a fila e remove `data/writer.lock`. Se houve queda forçada, a trava pode permanecer e o servidor recusa iniciar. Isso evita assumir que uma instância antiga morreu quando ela ainda pode estar gravando.

Antes de remover a trava, o operador deve confirmar que todos os processos ADAM daquela planilha pararam, que não existe outro host escritor, preservar `pending.json` e aguardar a janela de incerteza. Remova somente o diretório vazio writer.lock, sem apagar data ou pending.json. Inicie uma instância única; ela reconcilia o journal na próxima solicitação autenticada. Nunca force remoção automática por idade do arquivo.

## Sessões e permissões

Sessões são IDs aleatórios opacos mantidos em memória por até oito horas. Reiniciar o servidor encerra os logins, mas não apaga registros. Cookies HttpOnly, SameSite=Lax e Secure em HTTPS; state/nonce/PKCE no login. Cada operação relê Usuarios, portanto revogação/perfil não ficam congelados na sessão.

As chamadas POST exigem Origin igual a APP_URL e token CSRF de sessão. Não configure APP_URL pelo cabeçalho Host do visitante. Não há autocadastro ou endpoint para atribuir perfil.

O frontend original tem handlers inline; a CSP conserva `unsafe-inline` para compatibilidade nesta migração. Textos de usuários são escapados. Remover handlers inline e endurecer a CSP é uma evolução separada. Nenhum segredo entra nos arquivos públicos.

## PDF

PDFKit gera A4 no servidor com snapshot, três abordagens, emissão e assinatura em branco. Observações entram como texto, nunca como HTML. Não precisa de Google Docs/Drive. A auditoria registra **solicitação** do documento; não afirma que o usuário concluiu o download. Emitir não altera o status. A interface de impressão usa o mesmo histórico; o PDF é regenerado em uma repetição, preservando os dados de emissão salvos para a chave.

## Desempenho e limites

- Uma leitura de metadados e uma leitura em lote das oito abas por operação. Sem cache de permissão/contagem crítica.
- Todas as operações passam pela fila para manter a visão consistente na única instância.
- Leituras integrais, quotas por conta e latência de rede continuam limitando escala.
- A página de relatórios/consulta mantém dados em memória até nova leitura. Mutação detecta conflito de versão; recarregar a página atualiza a visão.
- O cliente limita a espera, mas isso não cancela uma gravação no servidor; repetir mantém a mesma chave.
- Repositório usa API direta e interface HTTP separada, facilitando futura troca por banco transacional.

Não foi realizado benchmark em planilha real. Para escalar a vários servidores, migre coordenação e registros para um banco com transações ou implemente um serviço central de escrita antes de aumentar instâncias.

## Retorno controlado

Se precisar voltar ao Apps Script: pare o Node, resolva journal pendente, faça backup privado, confira Operacoes e somente então reative o escritor antigo. Os cabeçalhos são compatíveis, mas mudanças posteriores devem ser revistas antes do retorno. Nunca restaure um backup antigo sobre dados novos sem definir como reconciliá-los.
