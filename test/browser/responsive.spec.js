import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import IFAM from "../../shared/core.cjs";
import { startPortalPreview } from "../helpers/portal-preview.js";

const studentName =
  "Maria Eduarda de Albuquerque Nascimento da Silva dos Santos de Oliveira";
const longCourse =
  "Técnico em Desenvolvimento de Sistemas Integrado ao Ensino Médio com Ênfase em Tecnologias para a Amazônia";
const longTitle =
  "Acompanhamento individual durante as atividades práticas do projeto interdisciplinar";
const observation =
  "Registro fictício sobre a atividade prática da turma. " +
  "O estudante recebeu orientações para a próxima etapa do projeto acadêmico. ".repeat(
    7,
  );

const viewports = [
  [320, 720],
  [375, 812],
  [768, 900],
  [1024, 768],
  [1440, 900],
  [860, 375],
];

function seedReviewData(db) {
  const author = db.Usuarios.find(
    (account) => account.usuario === "assistente",
  );
  const courses = [
    longCourse,
    "Educação Ambiental e Empreendedorismo Comunitário",
    "Gestão de Recursos Naturais e Agroecologia",
    "Tecnologia em Produção Cultural e Economia Criativa",
  ];
  for (let index = 0; index < 36; index++) {
    const student = {
      ...db.Alunos[0],
      id: "revisao-" + index,
      nome: index === 0 ? studentName : `Estudante de revisão ${index + 1}`,
      matricula: `R2026${String(index + 1).padStart(4, "0")}`,
      curso: courses[index % courses.length],
      turma: "Turma do turno vespertino — Projeto interdisciplinar",
    };
    db.Alunos.push(student);
    const month = String((index % 12) + 1).padStart(2, "0");
    for (let entry = 0; entry < (index === 0 ? 3 : 1); entry++) {
      const plan = IFAM.plan(
        db,
        author,
        "registrarOcorrencia",
        {
          alunoId: student.id,
          anoLetivo: 2026,
          irregularidades: ["PERSONALIZADA"],
          tituloPersonalizado: longTitle,
          observacao: observation,
          chaveIdempotencia: randomUUID(),
        },
        {
          uuid: randomUUID,
          now: () => `2026-${month}-${String(entry + 12)}T12:00:00Z`,
        },
      );
      const record = IFAM.apply(db, plan);
      if (record.encaminhamento) {
        const referral = db.Encaminhamentos.find(
          ({ id }) => id === record.encaminhamento.id,
        );
        Object.assign(referral, {
          status: "ENCAMINHADO",
          encaminhadoEm: referral.criadoEm,
          encaminhadoPor: author.id,
        });
      }
    }
  }
}

let origin, server;
test.beforeAll(async () => {
  ({ origin, server } = await startPortalPreview(0, seedReviewData));
});
test.afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function signIn(page, username, heading) {
  await expect(
    page.getByRole("heading", { name: "Entrar no ADAM" }),
  ).toBeVisible();
  const form = page.locator("#login-form");
  await form.getByLabel("Usuário", { exact: true }).fill(username);
  await form.getByLabel("Senha", { exact: true }).fill("adamteste");
  await form.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
}

function navItem(page, name) {
  return page
    .getByRole("navigation")
    .getByRole("button", { name, exact: true });
}

async function navigate(page, name, heading = name) {
  const opener = page.getByRole("button", { name: "Abrir menu", exact: true });
  if (await opener.isVisible()) await opener.click();
  await navItem(page, name).click();
  await expect(
    page.getByRole("heading", { name: heading, exact: true }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page, label) {
  const width = await page.evaluate(() => ({
    visible: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  expect(Math.max(width.document, width.body), label).toBeLessThanOrEqual(
    width.visible + 1,
  );
}

async function reviewLayout(
  page,
  heading,
  pageName,
  theme,
  testInfo,
  capture = false,
) {
  const title =
    typeof heading === "string"
      ? page.getByRole("heading", { name: heading, exact: true })
      : heading;
  for (const [width, height] of viewports) {
    await page.setViewportSize({ width, height });
    await expect(title).toBeVisible();
    await expectNoHorizontalOverflow(
      page,
      `${pageName} em ${theme} a ${width}×${height}`,
    );
    if (capture && (width === 375 || width === 1440)) {
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await document.fonts.ready;
      });
      await page.screenshot({
        path: testInfo.outputPath(`${pageName}-${theme}-${width}.png`),
        animations: "disabled",
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

for (const theme of ["light", "dark"]) {
  test(`matriz responsiva dos três perfis no tema ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.goto(origin);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await reviewLayout(page, "Entrar no ADAM", "login", theme, testInfo, true);

    await signIn(page, "admin", "Criar conta");
    await reviewLayout(page, "Criar conta", "administrador", theme, testInfo);
    if (theme === "light") {
      await page
        .getByLabel("Nome", { exact: true })
        .fill("Coordenação de teste");
      await page.getByLabel("Usuário", { exact: true }).fill("qa-responsivo");
      await page.getByLabel("Senha temporária").fill("qa-adam-teste");
      await page
        .locator("#new-account")
        .getByRole("button", { name: "Criar conta" })
        .click();
      await expect(
        page.getByRole("status").filter({ hasText: "Conta criada." }),
      ).toBeVisible();
    }
    await page.getByRole("button", { name: "Sair" }).click();

    await signIn(page, "depe", "Fila do DEPE");
    const longReferral = page.getByRole("row", {
      name: new RegExp(studentName),
    });
    await expect(longReferral).toBeVisible();
    await reviewLayout(page, "Fila do DEPE", "depe", theme, testInfo, true);
    await longReferral.getByRole("button", { name: "Ver detalhes" }).click();
    await expect(page.locator(".timeline")).toContainText(longTitle);
    await reviewLayout(
      page,
      studentName,
      "detalhes-do-encaminhamento",
      theme,
      testInfo,
    );
    await page.getByRole("button", { name: "Visualizar documento" }).click();
    await expect(page.locator(".document")).toContainText(longTitle);
    await reviewLayout(
      page,
      page.locator(".document h1"),
      "visualizacao-do-pdf",
      theme,
      testInfo,
    );
    await navigate(page, "Alunos");
    await expect(page.locator("#student-results tbody tr")).toHaveCount(48);
    await reviewLayout(page, "Alunos", "alunos-depe", theme, testInfo);
    await navigate(page, "Cursos e turmas");
    await expect(
      page.getByText(longCourse, { exact: true }).first(),
    ).toBeAttached();
    await reviewLayout(page, "Cursos e turmas", "catalogo", theme, testInfo);
    await navigate(page, "Relatórios");
    await reviewLayout(page, "Relatórios", "relatorios-depe", theme, testInfo);
    await page.getByRole("button", { name: "Sair" }).click();

    await signIn(page, "assistente", "Tudo em dia, por aqui.");
    await reviewLayout(
      page,
      "Tudo em dia, por aqui.",
      "inicio",
      theme,
      testInfo,
    );
    await navigate(page, "Registrar ocorrência");
    await page.getByRole("checkbox", { name: /Personalizada/ }).check();
    await page
      .getByRole("textbox", { name: "Título da ocorrência" })
      .fill(longTitle);
    await reviewLayout(
      page,
      "Registrar ocorrência",
      "nova-ocorrencia",
      theme,
      testInfo,
    );
    page.once("dialog", (prompt) => prompt.accept());
    await navigate(page, "Alunos");
    await page
      .getByRole("row", { name: new RegExp(studentName) })
      .getByRole("button", { name: "Ver histórico" })
      .click();
    await expect(page.locator(".timeline")).toContainText(longTitle);
    await expect(
      page.getByRole("button", { name: "Editar cadastro" }),
    ).toHaveCount(0);
    await reviewLayout(page, studentName, "historico", theme, testInfo);
    await navigate(page, "Relatórios");
    await expect(
      page.getByRole("heading", { name: "Abordagens por mês" }),
    ).toBeVisible();
    await expect(page.locator(".report-timeline li")).toHaveCount(12);
    await reviewLayout(page, "Relatórios", "relatorios", theme, testInfo, true);
  });
}

test("menu e diálogos preservam foco, inclusive com viewport visual reduzido", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await signIn(page, "depe", "Fila do DEPE");
    const openMenu = page.getByRole("button", {
      name: "Abrir menu",
      exact: true,
    });
    await openMenu.focus();
    await page.keyboard.press("Enter");
    const closeMenu = page
      .getByRole("button", { name: "Fechar menu", exact: true })
      .last();
    await expect(closeMenu).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(navItem(page, "Relatórios")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(openMenu).toBeFocused();

    await navigate(page, "Alunos");
    const addStudent = page.getByRole("button", {
      name: "Cadastrar aluno",
      exact: false,
    });
    await addStudent.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: "Cadastrar aluno" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Fechar", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(dialog.getByLabel("Nome completo")).toBeFocused();
    const outline = await dialog
      .getByLabel("Nome completo")
      .evaluate((input) => {
        const style = getComputedStyle(input);
        return [style.outlineStyle, parseFloat(style.outlineWidth)];
      });
    expect(outline[0]).not.toBe("none");
    expect(outline[1]).toBeGreaterThan(0);

    await dialog
      .getByLabel("Curso", { exact: true })
      .selectOption("Informática");
    await dialog
      .getByLabel("Turma", { exact: true })
      .selectOption({ index: 1 });
    await page.evaluate(() => {
      // Android/iOS keyboards generally shrink the visual viewport only.
      Object.defineProperty(visualViewport, "height", {
        configurable: true,
        value: 302,
      });
      visualViewport.dispatchEvent(new Event("resize"));
    });
    const closeDialog = dialog.getByRole("button", {
      name: "Fechar",
      exact: true,
    });
    for (const control of [
      dialog.getByRole("button", { name: "Salvar cadastro" }),
      dialog.getByRole("button", { name: "Cancelar" }),
      closeDialog,
    ]) {
      await control.scrollIntoViewIfNeeded();
      const rect = await control.boundingBox();
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.y + rect.height).toBeLessThanOrEqual(303);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(addStudent).toBeFocused();

    await addStudent.click();
    await closeDialog.click();
    await expect(dialog).toBeHidden();
    await expect(addStudent).toBeFocused();

    await navigate(page, "Encaminhamentos ao DEPE", "Fila do DEPE");
    await page
      .getByRole("row", { name: new RegExp(studentName) })
      .getByRole("button", { name: "Ver detalhes" })
      .click();
    await page.getByRole("button", { name: "Encerrar caso" }).click();
    await dialog.getByLabel("Observação").focus();
    const confirmClosure = dialog.getByRole("button", {
      name: "Confirmar encerramento",
    });
    await confirmClosure.scrollIntoViewIfNeeded();
    const confirmRect = await confirmClosure.boundingBox();
    expect(confirmRect.y).toBeGreaterThanOrEqual(0);
    expect(confirmRect.y + confirmRect.height).toBeLessThanOrEqual(303);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();

    await page.evaluate(() => {
      delete visualViewport.height;
      visualViewport.dispatchEvent(new Event("resize"));
    });
    await page.setViewportSize({ width: 860, height: 375 });
    await navigate(page, "Cursos e turmas");
    await page
      .getByRole("button", { name: "Excluir curso Informática", exact: true })
      .click();
    await expect(dialog).toContainText("Informática");
    await dialog.getByRole("button", { name: "Confirmar exclusão" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/alunos vinculados/);
    await expectNoHorizontalOverflow(page, "confirmação com erro em 860×375");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
  } finally {
    await context.close();
  }
});

test("zoom de página Chromium a 200% com janela de 1440 px", async ({
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "As configurações de zoom usadas são do Chromium.",
  );
  const profile = await mkdtemp(join(tmpdir(), "adam-browser-zoom-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      executablePath: process.env.CHROMIUM_EXECUTABLE || undefined,
      headless: true,
      viewport: null,
      args: ["--window-size=1440,1000", "--force-device-scale-factor=1"],
    });
    const settings = context.pages()[0];
    await settings.goto("chrome://settings/appearance");
    await settings
      .locator("select")
      .filter({
        has: settings.getByRole("option", { name: "200%", exact: true }),
      })
      .selectOption({ label: "200%" });
    const page = await context.newPage();
    await page.goto(origin);
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(720);
    await expectNoHorizontalOverflow(page, "login a 200%");
    await signIn(page, "admin", "Criar conta");
    await expectNoHorizontalOverflow(page, "Administração a 200%");
    await page.getByRole("button", { name: "Sair" }).click();
    await signIn(page, "depe", "Fila do DEPE");
    await expectNoHorizontalOverflow(page, "Fila do DEPE a 200%");
    await navigate(page, "Cursos e turmas");
    await expectNoHorizontalOverflow(page, "Catálogo a 200%");
    await page.getByRole("button", { name: "Sair" }).click();
    await signIn(page, "assistente", "Tudo em dia, por aqui.");
    await navigate(page, "Relatórios");
    await expectNoHorizontalOverflow(page, "relatórios a 200%");
    await expect(
      page.getByRole("button", { name: "Baixar resumo CSV" }),
    ).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
