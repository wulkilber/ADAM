# Revisão visual do ADAM

## Abrir a prévia

Com Node.js 22.15 ou mais recente, execute na pasta do projeto.

```sh
npm ci
node test/helpers/portal-preview.js
```

Abra [127.0.0.1:3100](http://127.0.0.1:3100). Entre com `admin`, `depe` ou `assistente`. A senha da prévia é `adamteste` para os três perfis. A prévia usa dados fictícios em memória e volta ao estado inicial quando reiniciada.

## Cobertura de responsividade

| Largura × altura em pixels CSS | Contexto              | Temas          |
| ------------------------------ | --------------------- | -------------- |
| 320 × 720 e 375 × 812          | Celular em pé         | Claro e escuro |
| 768 × 900                      | Tablet                | Claro e escuro |
| 1024 × 768 e 1440 × 900        | Computador            | Claro e escuro |
| 860 × 375                      | Celular na horizontal | Claro e escuro |

A matriz percorre o login, a administração de contas, a fila, os detalhes do encaminhamento, a visualização do documento e o catálogo do DEPE, a lista de alunos, o painel do assistente, o formulário de ocorrências personalizadas, o histórico do aluno e os relatórios. Ela usa 48 cadastros fictícios, nomes extensos, títulos de ocorrências personalizadas e dados distribuídos pelos 12 meses do ano letivo.

O zoom de página foi ajustado para 200% nas configurações do Chromium, com uma janela de 1440 px e 720 px CSS disponíveis. A verificação percorre login, administração, fila do DEPE, catálogo e relatórios do assistente.

A navegação por teclado foi testada no menu e nos diálogos, com foco visível, fechamento por Escape e retorno ao controle que abriu o diálogo. Para avaliar Fechar, Salvar, Cancelar e Confirmar com pouco espaço, o teste reduz o viewport visual a 302 px com emulação de toque. O teclado virtual físico não foi testado.

## Regressão

Os 23 testes de serviço e API e os 10 testes no Chromium passaram. A suíte cobre a criação de contas, a gestão de alunos e do catálogo, a leitura e o encerramento de encaminhamentos, o registro e a edição de ocorrências, a exportação em CSV e PDF e as confirmações de exclusão. Os testes de API confirmam que o assistente não pode editar cadastros de alunos.

## Executar os testes

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Os testes no navegador geram capturas em `test-results` para login, fila do DEPE e relatórios, em 375 px e 1440 px nos dois temas. A revisão roda localmente e não requer migração.
