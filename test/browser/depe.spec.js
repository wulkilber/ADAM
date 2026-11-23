import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { startPortalPreview } from "../helpers/portal-preview.js";

test("DEPE gerencia alunos e casos e o assistente edita o histórico", async ({
  browser,
}) => {
  const { server, origin } = await startPortalPreview();
  const depe = await browser.newPage();
  const assist = await browser.newPage();
  const signIn = async (page, user, title) => {
    await page.goto(origin);
    await page.getByLabel("Usuário", { exact: true }).fill(user);
    await page.getByLabel("Senha", { exact: true }).fill("adamteste");
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  };
  const nav = (page, name) =>
    page
      .getByRole("navigation")
      .getByRole("button", { name, exact: true })
      .click();
  const student = async (page, name) =>
    page
      .getByRole("row", { name })
      .getByRole("button", { name: "Ver histórico" })
      .click();
  try {
    await signIn(assist, "assistente", "Tudo em dia, por aqui.");
    await signIn(depe, "depe", "Fila do DEPE");
    await expect(
      assist.locator("nav").getByText("Cursos e turmas"),
    ).toHaveCount(0);
    await nav(depe, "Cursos e turmas");
    await depe.getByLabel("Nome do curso").fill("Curso piloto");
    await depe.getByRole("button", { name: "Cadastrar curso" }).click();
    await expect(depe.getByRole("row", { name: /Curso piloto/ })).toContainText(
      "Nenhuma turma",
    );
    for (const [turma, sala] of [
      ["1A", "Lab 11"],
      ["2A", "Lab 22"],
      ["3A", "Lab vazio"],
    ]) {
      await depe
        .getByLabel("Curso", { exact: true })
        .selectOption("Curso piloto");
      await depe.getByLabel("Nome da turma").fill(turma);
      await depe.getByLabel("Sala (opcional)").fill(sala);
      await depe.getByRole("button", { name: "Cadastrar turma" }).click();
      await expect(
        depe.getByRole("row", { name: /Curso piloto/ }),
      ).toContainText(sala);
    }

    await nav(depe, "Alunos");
    await depe.getByRole("button", { name: "Cadastrar aluno" }).click();
    const dialog = depe.getByRole("dialog");
    for (const [field, value] of Object.entries({
      "Nome completo": "Estudante fictício DEPE",
      Matrícula: "QA-2026",
    }))
      await dialog.getByLabel(field, { exact: true }).fill(value);
    await dialog
      .getByLabel("Curso", { exact: true })
      .selectOption("Curso piloto");
    await dialog.getByLabel("Turma", { exact: true }).selectOption("1A");
    await expect(dialog).toContainText("Sala: Lab 11");
    await expect(dialog.locator("input")).toHaveCount(2);

    await dialog.getByRole("button", { name: "Salvar cadastro" }).click();
    await expect(dialog).toBeHidden();
    await depe.getByLabel("Buscar aluno").fill("QA-2026");
    await student(depe, /Estudante fictício DEPE/);
    await depe.getByRole("button", { name: "Editar cadastro" }).click();
    await dialog.getByLabel("Turma", { exact: true }).selectOption("2A");
    await dialog.getByRole("button", { name: "Salvar cadastro" }).click();
    await expect(depe.locator(".title-row")).toContainText("2A");

    await nav(assist, "Alunos");
    await expect(
      assist.getByRole("row", { name: /Estudante fictício DEPE/ }),
    ).toContainText("2A");
    await expect(
      assist.getByRole("button", { name: "Cadastrar aluno" }),
    ).toHaveCount(0);
    await expect(assist.locator('#classroom option[value="3A"]')).toHaveCount(
      1,
    );
    await assist.getByLabel("Sala", { exact: true }).selectOption("Lab vazio");
    await expect(assist.getByText(/Nenhum aluno encontrado/)).toBeVisible();
    await assist.getByLabel("Sala", { exact: true }).selectOption("Lab 22");
    await expect(
      assist.getByRole("row", { name: /Estudante fictício DEPE/ }),
    ).toBeVisible();
    await assist.getByLabel("Sala", { exact: true }).selectOption("");
    await student(assist, /Ana Clara Oliveira/);
    await expect(
      assist.getByRole("heading", { name: "Ana Clara Oliveira" }),
    ).toBeVisible();
    await expect(
      assist.getByRole("button", { name: "Editar cadastro" }),
    ).toHaveCount(0);
    await expect(
      assist.getByRole("button", { name: "Desativar aluno" }),
    ).toHaveCount(0);
    const assistDialog = assist.getByRole("dialog");
    await assist
      .locator(".timeline article")
      .first()
      .getByRole("button", { name: "Editar ocorrência" })
      .click();
    await assistDialog
      .getByLabel(/Observação/)
      .fill("Correção fictícia de ocorrência comum.");
    await assistDialog.getByRole("button", { name: "Salvar correção" }).click();
    await expect(assist.locator(".timeline")).toContainText(
      "Correção fictícia de ocorrência comum.",
    );
    await assist
      .getByRole("button", { name: "Registrar ocorrência", exact: true })
      .last()
      .click();
    await assist.getByRole("checkbox", { name: /Personalizada/ }).check();
    await assist
      .getByRole("textbox", { name: "Título da ocorrência" })
      .fill("Título original fictício");
    await assist.getByRole("button", { name: "Revisar registro" }).click();
    await assist.getByRole("button", { name: "Confirmar registro" }).click();
    await expect(
      assist
        .locator("#content")
        .getByText("Encaminhado automaticamente ao DEPE.", {
          exact: false,
        }),
    ).toBeVisible();

    await assist
      .getByRole("button", { name: "Ver encaminhamento ao DEPE" })
      .click();
    await expect(
      assist.getByRole("button", {
        name: "Registrar encaminhamento",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(assist.getByText("Aguardando leitura do DEPE.")).toBeVisible();
    await expect(assist.locator(".panel-head .badge")).toContainText(
      "Encaminhado",
    );

    await nav(depe, "Encaminhamentos ao DEPE");
    const row = depe.getByRole("row", { name: /Ana Clara Oliveira/ });
    await row.getByRole("button", { name: "Ver detalhes" }).click();
    await depe.getByRole("button", { name: "Visualizar documento" }).click();
    await expect(depe.locator(".document")).toContainText(
      "Título original fictício",
    );
    await depe.getByRole("button", { name: "Voltar", exact: true }).click();
    await depe.getByRole("button", { name: "Confirmar leitura" }).click();
    await expect(depe.getByText(/Leitura confirmada em/)).toBeVisible();
    await expect(
      depe.getByRole("button", { name: "Encerrar caso" }),
    ).toBeVisible();
    await depe.getByRole("button", { name: "Encerrar caso" }).click();
    await dialog.getByLabel("Observação").fill("Conclusão fictícia.");
    await dialog
      .getByRole("button", { name: "Confirmar encerramento" })
      .click();
    await expect(
      depe.getByText("Conclusão fictícia.", { exact: false }),
    ).toBeVisible();
    await nav(depe, "Encaminhamentos ao DEPE");
    await expect(row).toHaveCount(0);
    await depe.getByRole("button", { name: /^Encerrados/ }).click();
    await expect(row).toBeVisible();

    await nav(assist, "Alunos");
    await student(assist, /Ana Clara Oliveira/);
    await expect(assist.getByText(/Caso encerrado em/)).toBeVisible();
    await assist
      .locator(".timeline article")
      .filter({ hasText: "Título original fictício" })
      .getByRole("button", { name: "Editar ocorrência" })
      .click();
    await assistDialog
      .getByLabel("Título da ocorrência")
      .fill("Título corrigido fictício");
    await assistDialog.getByRole("button", { name: "Salvar correção" }).click();
    await expect(assist.locator(".timeline")).toContainText(
      "Corrigida após o envio",
    );
    await expect(
      assist.getByText("3 de 3 ocorrências no ano letivo.", { exact: true }),
    ).toBeVisible();

    await nav(depe, "Alunos");
    await student(depe, /Ana Clara Oliveira/);
    await expect(depe.locator(".timeline")).toContainText(
      "Título corrigido fictício",
    );
    await expect(depe.getByText(/Caso encerrado em/)).toBeVisible();
    await depe.getByRole("button", { name: "Ver relatório e PDF" }).click();
    await expect(depe.locator(".document")).toContainText(
      "Título original fictício",
    );
    await expect(depe.locator(".document")).not.toContainText(
      "Título corrigido fictício",
    );
    await nav(depe, "Alunos");
    await student(depe, /Ana Clara Oliveira/);
    await depe.getByRole("button", { name: "Desativar aluno" }).click();
    await dialog.getByRole("button", { name: "Confirmar desativação" }).click();
    await expect(depe.locator(".title-row")).toContainText("Inativo");
    await expect(depe.locator(".timeline")).toContainText(
      "Título corrigido fictício",
    );
    await expect(
      depe.getByRole("button", { name: "Ver relatório e PDF" }),
    ).toBeVisible();
    await nav(assist, "Registrar ocorrência");
    await expect(
      assist.locator("#student-select option[value=aluno-0]"),
    ).toHaveCount(0);

    await nav(depe, "Relatórios");
    await depe.getByLabel("Tipo de ocorrência").selectOption("PERSONALIZADA");
    await expect(
      depe.getByRole("heading", { name: "Situação dos encaminhamentos" }),
    ).toBeVisible();
    await expect(
      depe.getByRole("heading", { name: "Registros do período" }),
    ).toHaveCount(0);
    const downloading = depe.waitForEvent("download");
    await depe.getByRole("button", { name: "Baixar resumo CSV" }).click();
    const csv = await readFile(await (await downloading).path(), "utf8");
    expect(csv).toContain('"Irregularidades por tipo";"Personalizada";"1"');
    expect(csv).not.toMatch(
      /Ana Clara Oliveira|0020260001|Título corrigido fictício/,
    );
    await nav(depe, "Cursos e turmas");
    await depe
      .getByRole("button", { name: "Excluir turma 2A do curso Curso piloto" })
      .click();
    await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(dialog.getByRole("alert")).toContainText(
      "Há alunos vinculados",
    );
    await dialog.getByRole("button", { name: "Cancelar" }).click();

    await depe
      .getByRole("button", { name: "Excluir turma 3A do curso Curso piloto" })
      .click();
    await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(dialog).toBeHidden();
    await expect(
      depe.getByRole("button", {
        name: "Excluir turma 3A do curso Curso piloto",
      }),
    ).toHaveCount(0);
    await depe.getByLabel("Nome do curso").fill("Curso descartável");
    await depe.getByRole("button", { name: "Cadastrar curso" }).click();
    await depe
      .getByRole("button", { name: "Excluir curso Curso descartável" })
      .click();
    await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(
      depe.getByRole("row", { name: /Curso descartável/ }),
    ).toHaveCount(0);
    await nav(assist, "Alunos");
    await expect(assist.locator('#room option[value="Lab vazio"]')).toHaveCount(
      0,
    );
  } finally {
    await Promise.all([depe.close(), assist.close()]);
    server.close();
  }
});
