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
    await nav(depe, "Alunos");
    await depe.getByRole("button", { name: "Cadastrar aluno" }).click();
    const dialog = depe.getByRole("dialog");
    for (const [field, value] of Object.entries({
      "Nome completo": "Estudante fictício DEPE",
      Matrícula: "QA-2026",
      Curso: "Curso piloto",
      Turma: "1A",
    }))
      await dialog.getByLabel(field, { exact: true }).fill(value);
    await dialog.getByRole("button", { name: "Salvar cadastro" }).click();
    await expect(dialog).toBeHidden();
    await depe.getByLabel("Buscar aluno").fill("QA-2026");
    await student(depe, /Estudante fictício DEPE/);
    await depe.getByRole("button", { name: "Editar cadastro" }).click();
    await dialog.getByLabel("Turma", { exact: true }).fill("2A");
    await dialog.getByRole("button", { name: "Salvar cadastro" }).click();
    await expect(depe.locator(".title-row")).toContainText("2A");

    await nav(assist, "Alunos");
    await expect(
      assist.getByRole("row", { name: /Estudante fictício DEPE/ }),
    ).toContainText("2A");
    await expect(
      assist.getByRole("button", { name: "Cadastrar aluno" }),
    ).toHaveCount(0);
    await student(assist, /Ana Clara Oliveira/);
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
    await assist
      .getByRole("button", { name: "Ver encaminhamento ao DEPE" })
      .click();
    await assist
      .getByRole("button", { name: "Registrar encaminhamento", exact: true })
      .click();
    await assist
      .getByRole("button", { name: "Confirmar encaminhamento" })
      .click();
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
  } finally {
    await Promise.all([depe.close(), assist.close()]);
    server.close();
  }
});
