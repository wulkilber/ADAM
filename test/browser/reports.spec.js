import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("Relatórios filtram os gráficos e exportam um resumo sem dados pessoais", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Entrar em demonstração" }).click();
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();

  for (const name of [
    "Abordagens por mês",
    "Irregularidades por tipo",
    "Abordagens por curso",
    "Situação dos encaminhamentos",
  ])
    await expect(page.getByRole("heading", { name })).toBeVisible();
  const monthlyCounts = page.locator(".report-timeline .report-column strong");
  const total = Number(
    await page.locator(".stats .stat b").first().textContent(),
  );
  expect(total).toBeGreaterThan(0);
  expect(
    (await monthlyCounts.allTextContents()).reduce(
      (sum, item) => sum + Number(item),
      0,
    ),
  ).toBe(total);

  if (total > 20) {
    const records = page.locator(".responsive-table tbody tr");
    await expect(records).toHaveCount(20);
    await page.getByRole("button", { name: "Próxima" }).click();
    await expect(page.locator(".report-pagination")).toContainText("Página 2");
    await page.getByRole("button", { name: "Anterior" }).click();
    await expect(records).toHaveCount(20);
  }

  await page.getByLabel("Tipo de ocorrência").selectOption("CAMISA");
  const filtered = Number(
    await page.locator(".stats .stat b").first().textContent(),
  );
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(total);
  expect(
    (await monthlyCounts.allTextContents()).reduce(
      (sum, item) => sum + Number(item),
      0,
    ),
  ).toBe(filtered);

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar resumo CSV" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^adam-relatorio-\d{4}\.csv$/);
  const csv = await readFile(await download.path(), "utf8");
  expect(csv).toContain('"Filtros";"Tipo de ocorrência";"Camisa"');
  expect(csv).toContain(`"Resumo";"Abordagens";"${filtered}"`);
  expect(csv).not.toContain("Ana Clara Oliveira");
  expect(csv).not.toContain("0020260001");

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await expect(page.locator(".stats .stat b").first()).toHaveText(
    String(total),
  );
  await page.locator("#from").fill("2026-12-10");
  await page.locator("#to").fill("2026-01-05");
  await expect(page.getByRole("alert")).toContainText(
    "A data inicial deve ser anterior",
  );
  await expect(
    page.getByRole("button", { name: "Baixar resumo CSV" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Limpar filtros" }).click();
  for (const width of [360, 768]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
});
