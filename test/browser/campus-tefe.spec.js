import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { startPortalPreview } from "../helpers/portal-preview.js";

test("Campus Tefé: tema nos três perfis e ocorrência personalizada até o DEPE", async ({
  page,
}, testInfo) => {
  const { server, origin } = await startPortalPreview();
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto(origin);
    const root = page.locator("html");
    const theme = page.getByRole("button", { name: "Tema escuro" });
    await expect(root).toHaveAttribute("data-theme", "dark");
    await expect(
      page.getByText("IFAM – Campus Tefé", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".login img.theme-dark")).toHaveJSProperty(
      "complete",
      true,
    );
    await theme.focus();
    await expect(theme).toBeFocused();
    await theme.press("Space");
    await expect(theme).toHaveAttribute("aria-pressed", "false");
    await page.reload();
    await expect(root).toHaveAttribute("data-theme", "light");

    async function signIn(name, heading) {
      await page.getByLabel("Usuário", { exact: true }).fill(name);
      await page.getByLabel("Senha", { exact: true }).fill("adamteste");
      await page.getByRole("button", { name: "Entrar", exact: true }).click();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(page.locator("header")).toContainText("IFAM – Campus Tefé");
      await expect(root).toHaveAttribute("data-theme", "light");
      await theme.click();
      await expect(root).toHaveAttribute("data-theme", "dark");
      await page.reload();
      await expect(page.getByRole("heading", { name: heading })).toBeVisible();
      await expect(theme).toHaveAttribute("aria-pressed", "true");
      for (const width of [360, 768, 1440]) {
        await page.setViewportSize({ width, height: 860 });
        expect(await root.evaluate((el) => el.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      }
      await theme.click();
      await expect(root).toHaveAttribute("data-theme", "light");
    }
    const signOut = async () => {
      await page.getByRole("button", { name: "Sair" }).click();
      await expect(
        page.getByRole("heading", { name: "Entrar no ADAM" }),
      ).toBeVisible();
      await expect(root).toHaveAttribute("data-theme", "light");
    };

    await signIn("admin", "Criar conta");
    await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(
      1,
    );
    await signOut();
    await signIn("assistente", "Tudo em dia, por aqui.");
    await page
      .locator("nav")
      .getByRole("button", { name: "Registrar ocorrência" })
      .click();
    await page.locator("#student-select").selectOption("aluno-0");
    const custom = page.getByRole("checkbox", { name: /Personalizada/ });
    const title = page.getByRole("textbox", { name: "Título da ocorrência" });
    await custom.check();
    await expect(title).toHaveAttribute("required", "");
    await expect(title).toHaveAttribute("maxlength", "100");
    await page.getByRole("button", { name: "Revisar registro" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    const label = "Uso de material <sem autorização>";
    await title.fill("  " + label + "  ");
    await page.getByRole("checkbox", { name: /Atraso/ }).check();
    await expect(title).toBeHidden();
    await expect(custom).not.toBeChecked();
    await custom.check();
    await page
      .getByLabel(/Observação/)
      .fill("Descrição fictícia da abordagem.");
    await page.getByRole("button", { name: "Revisar registro" }).click();
    await expect(page.getByRole("dialog")).toContainText(label);
    await page.getByRole("button", { name: "Confirmar registro" }).click();
    await expect(
      page
        .locator("#content")
        .getByText("Encaminhado automaticamente ao DEPE.", { exact: false }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Ver histórico" }).click();
    await expect(page.locator(".timeline")).toContainText(
      "Personalizada: " + label,
    );
    await page.getByRole("button", { name: "Relatórios", exact: true }).click();
    await page.getByLabel("Tipo de ocorrência").selectOption("PERSONALIZADA");
    await expect(page.locator(".report-breakdown").first()).toContainText(
      "Personalizada",
    );
    await expect(page.locator("tbody")).toContainText(label);
    const csvDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar resumo CSV" }).click();
    const csv = await readFile(await (await csvDownload).path(), "utf8");
    expect(csv).toContain('"Irregularidades por tipo";"Personalizada";"1"');
    expect(csv).not.toContain(label);
    expect(csv).not.toContain("Ana Clara Oliveira");

    await page
      .locator("nav")
      .getByRole("button", { name: "Encaminhamentos ao DEPE" })
      .click();
    await page
      .getByRole("row", { name: /Ana Clara Oliveira/ })
      .getByRole("button", { name: "Ver detalhes" })
      .click();
    await expect(page.locator(".timeline")).toContainText(label);
    await expect(
      page.getByRole("button", {
        name: "Registrar encaminhamento",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.getByText("Aguardando leitura do DEPE.")).toBeVisible();
    await expect(page.locator(".panel-head .badge")).toContainText(
      "Encaminhado",
    );
    await signOut();

    await signIn("depe", "Fila do DEPE");
    await expect(
      page.getByRole("button", { name: "Cadastrar aluno" }),
    ).toHaveCount(0);
    await expect(
      page.locator("nav").getByRole("button", { name: "Alunos", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("row", { name: /Ana Clara Oliveira/ })
      .getByRole("button", { name: "Ver detalhes" })
      .click();
    await page.getByRole("button", { name: "Visualizar documento" }).click();
    await expect(page.locator(".document")).toContainText(
      "Encaminhamento ao DEPE",
    );
    await expect(page.locator(".document")).toContainText(label);
    await expect(page.locator(".document")).toContainText("IFAM – Campus Tefé");
    const pdfDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar PDF" }).click();
    await (await pdfDownload).saveAs(testInfo.outputPath("personalizada.pdf"));
  } finally {
    server.close();
  }
});
