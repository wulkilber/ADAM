import { test, expect } from "@playwright/test";

test("Fluxo completo: cadastro → três abordagens → PDF → encaminhamento → conclusão", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await expect(
    page.getByRole("heading", { name: "Tudo em dia, por aqui." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Alunos", exact: true }).click();
  await page.getByRole("button", { name: "Cadastrar aluno" }).click();
  const matricula = "00" + Date.now();
  await page.getByLabel("Nome completo").fill("Estudante Teste Automático");
  await page.getByLabel("Matrícula", { exact: true }).fill(matricula);
  await page.getByLabel("Curso", { exact: true }).last().fill("Informática");
  await page.getByLabel("Turma", { exact: true }).last().fill("QA 1A");
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (let i = 0; i < 3; i++) {
    await page
      .locator("nav")
      .getByRole("button", { name: "Registrar ocorrência" })
      .click();
    await page
      .locator("#student-select")
      .selectOption({ label: `Estudante Teste Automático · ${matricula}` });
    await page.getByRole("checkbox", { name: "Camisa Fora do padrão" }).check();
    await page.getByRole("checkbox", { name: "Sapato Fora do padrão" }).check();
    await page.locator("#observation").fill("Abordagem fictícia para teste.");
    await page.getByRole("button", { name: "Revisar registro" }).click();
    await page.getByRole("button", { name: "Confirmar registro" }).click();
    await expect(
      page.getByRole("heading", { name: "Abordagem registrada." }),
    ).toBeVisible();
    await expect(page.locator(".success")).toContainText(`${i + 1} de 3`);
  }
  await page
    .getByRole("button", { name: "Ver encaminhamento ao DEPE", exact: true })
    .click();
  await expect(page.getByText("Três abordagens vinculadas")).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF" }).click();
  const download = await downloadPromise;
  await download.saveAs("test-results/encaminhamento.pdf");
  await expect(
    page.getByRole("button", { name: "Registrar encaminhamento", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Registrar encaminhamento", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirmar encaminhamento" }).click();
  await expect(
    page.getByRole("button", { name: "Concluir atendimento" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Concluir atendimento" }).click();
  await page.getByRole("button", { name: "Confirmar conclusão" }).click();
  await expect(page.locator(".panel-head .badge")).toContainText("Concluído");
  await page.getByRole("button", { name: "Visualizar documento" }).click();
  await expect(page.locator(".document article")).toHaveCount(3);
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Entrar em demonstração" }),
  ).toBeVisible();
  assertNoErrors(errors);
});
function assertNoErrors(errors) {
  expect(errors).toEqual([]);
}
for (const width of [360, 768])
  test(`Layout ${width}px sem rolagem horizontal`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "Entrar em demonstração" }).click();
    await expect(
      page.getByRole("heading", { name: "Tudo em dia, por aqui." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/layout-${width}.png`,
      fullPage: true,
    });
    const menu = page.getByRole("button", { name: "Abrir menu" });
    if (await menu.isVisible()) await menu.click();
    await page
      .locator("nav")
      .getByRole("button", { name: "Registrar ocorrência" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Registrar ocorrência" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
