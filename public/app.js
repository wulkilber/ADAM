"use strict";
const $ = (s) => document.querySelector(s),
  esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  uid = () => {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 15) | 64;
    b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
const labels = {
  ...IFAM.typeLabels,
  PENDENTE: "Pendente",
  ENCAMINHADO: "Encaminhado",
  CONCLUIDO: "Concluído",
};
const icons = {
  admin:
    "M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2M17 18h6m-3-3v6",
  moon: "M20.8 14A9 9 0 0 1 10 3.2 9 9 0 1 0 20.8 14Z",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5m-2 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0",
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3z",
  students:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-4m-3-11a4 4 0 0 1 0 8",
  plus: "M12 5v14M5 12h14",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M18 6 6 18",
  catalog:
    "M12 6v15m-9-3V4h4a5 5 0 0 1 5 2 5 5 0 0 1 5-2h4v14h-4a5 5 0 0 0-5 3 5 5 0 0 0-5-3H3Z",
  register: "M8 4H5v17h14V4h-3m-8 0V2h8v5H8V4m4 7v6m-3-3h6",
  depe: "M9 3H5v18h14V7l-4-4H9m0 0v5h6M8 13h8M8 17h6",
  reports: "M4 21V11m8 10V3m8 18V7",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  back: "M19 12H5m6 6-6-6 6-6",
  clock: "M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  check: "m5 12 4 4L19 6",
  alert: "M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  inbox: "M4 13 7 5h10l3 8v6H4Zm0 0h5l1 2h4l1-2h5",
  edit: "m13 6 5 5m1-8 2 2a1.4 1.4 0 0 1 0 2L9 19l-6 2 2-6L17 3a1.4 1.4 0 0 1 2 0Z",
  trash: "M3 6h18M9 6V3h6v3m4 0-1 15H6L5 6m5 4v7m4-7v7",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  print: "M6 9V3h12v6m0 9h3V9H3v9h3m0-4h12v8H6Zm11-2h1",
  read: "M12 12.5 14 15l4-5m4 2s-3.5 6-10 6S2 12 2 12s3.5-6 10-6 10 6 10 6Z",
  finish: "M7 6V4h10v2h4v14H3V6h4m0 0h10m-9 7 3 3 5-6",
  send: "m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2",
  refresh:
    "M20 8A8.5 8.5 0 0 0 5 7L3 10m0-5v5h5m-4 6a8.5 8.5 0 0 0 15 1l2-3m0 5v-5h-5",
  deactivate:
    "M20 21v-2a4 4 0 0 0-4-4h-1M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 5 6 6m0-6-6 6",
  search: "M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  settings: "M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  logout: "M9 3H3v18h6m4-15 6 6-6 6m-6-6h12",
};
const icon = (k) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${icons[k] || icons.depe}"/></svg>`;
let db,
  user,
  permissions = [],
  config = {
    anoLetivoAtivo: 2026,
    fusoHorario: "America/Manaus",
  },
  year = 2026,
  page = "home",
  selected = "",
  statusFilter = "PENDENTE",
  query = "",
  course = "",
  classroom = "",
  room = "",
  countFilter = "",
  from = "",
  to = "",
  typeFilter = "",
  reportPage = 1,
  dirty = false,
  pendingKey = null;
let live = true,
  demoMode = false,
  passwordLogin = false,
  customOccurrences = false,
  csrfToken = "";
const rpc = async (name, p = {}) => {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch("/api/" + name, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify(p),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!result.ok)
      throw Object.assign(new Error(result.error.message), {
        code: result.error.code,
      });
    return result.data;
  } catch (e) {
    if (e.name === "AbortError")
      throw new Error(
        "A confirmação demorou. Repita a mesma tentativa sem alterar os dados.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
  }
};
const service = {
  async load() {
    const response = await fetch("/auth/session", {
        credentials: "same-origin",
      }),
      r = await response.json();
    if (!r.ok)
      throw Object.assign(new Error(r.error.message), { code: r.error.code });
    csrfToken = r.data.csrf;
    user = r.data.usuario;
    permissions = r.data.permissoes;
    db = null;
    if (r.data.configuracoes) {
      config = r.data.configuracoes;
      year = Number(config.anoLetivoAtivo);
      if (!user.trocaSenha) db = await rpc("carregarDados");
    }
  },
  async refresh() {
    db = await rpc("carregarDados");
  },
  async mutate(name, p) {
    return rpc(name, p);
  },
};

const availableTypes = () =>
  customOccurrences
    ? IFAM.TYPES
    : IFAM.TYPES.filter((type) => type !== "PERSONALIZADA");

const can = (r) => permissions.includes(r),
  student = (id) => db.Alunos.find((a) => a.id === id),
  annual = (id) => IFAM.active(db, id, year),
  dt = (v) =>
    new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: config.fusoHorario,
    }).format(new Date(v)),
  statusLabel = (s) =>
    passwordLogin && s === "CONCLUIDO" ? "Encerrado" : labels[s] || esc(s),
  badge = (s) =>
    `<span class="badge status-badge ${s === "PENDENTE" ? "warn" : s === "CONCLUIDO" ? "green" : ""}">${s === "CONCLUIDO" ? icon("check") : s === "PENDENTE" ? icon("clock") : s === "ENCAMINHADO" ? icon("send") : ""}${statusLabel(s)}</span>`,
  tags = (o) =>
    JSON.parse(o.irregularidadesJson)
      .map(
        (t) =>
          `<span class="badge">${esc(t === "PERSONALIZADA" ? IFAM.describeType(t, o.tituloPersonalizado) : labels[t] || t)}</span>`,
      )
      .join(""),
  occurrenceDescription = (types, title, separator) =>
    types.map((type) => esc(IFAM.describeType(type, title))).join(separator),
  initials = (n) =>
    n
      .split(" ")
      .slice(0, 2)
      .map((s) => s[0])
      .join("");
function person(a) {
  return `<div class="person"><span class="avatar">${esc(initials(a.nome))}</span><div><strong>${esc(a.nome)}</strong><small>${esc(a.matricula)}</small></div></div>`;
}
let toastTimer;
function toast(message, tone = "success") {
  const notice = $("#toast");
  notice.dataset.tone = tone;
  notice.innerHTML = `<div class="toast-message">${icon(tone === "error" ? "alert" : "check")}<span>${esc(message)}</span></div>`;
  notice.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (notice.style.display = "none"), 4500);
}
let navigation = 0;
const drawerViewport = matchMedia(
  "(max-width: 900px), (max-width: 1000px) and (max-height: 540px)",
);
function setSidebarOpen(open, restoreFocus = false) {
  const sidebar = $("#sidebar");
  const menu = $("#menu");
  if (!sidebar || !menu) return;
  sidebar.classList.toggle("open", open);
  $("#sidebar-scrim").hidden = !open;
  $(".main").inert = open;
  document.body.classList.toggle("sidebar-open", open);
  menu.setAttribute("aria-expanded", String(open));
  if (open) {
    sidebar.setAttribute("role", "dialog");
    sidebar.setAttribute("aria-modal", "true");
    $("#close-menu").focus();
  } else {
    sidebar.removeAttribute("role");
    sidebar.removeAttribute("aria-modal");
    if (restoreFocus) menu.focus();
  }
}
drawerViewport.addEventListener("change", ({ matches }) => {
  if (!matches) setSidebarOpen(false);
});

function containTab(event) {
  if (event.key !== "Tab") return;
  const controls = [
    ...event.currentTarget.querySelectorAll(
      "a[href], button, input, select, textarea, [tabindex]",
    ),
  ].filter(
    (control) =>
      control.tabIndex >= 0 &&
      !control.matches(":disabled") &&
      control.getClientRects().length,
  );
  const first = controls[0];
  const last = controls.at(-1);
  const edge = event.shiftKey ? first : last;
  if (
    first &&
    (document.activeElement === edge ||
      !controls.includes(document.activeElement))
  ) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  }
}

const focusPageHeading = () =>
  ($("#content h1") || $("#main-content"))?.focus({ preventScroll: true });

function loadingState(message) {
  return `<div class="loading-state" role="status">${esc(message)}</div>`;
}

async function navigate(p, id = "") {
  if (passwordLogin && user.perfil === "ADMIN" && p !== "admin") return;
  if (
    passwordLogin &&
    user.perfil === "DEP" &&
    !["depe", "document", "students", "profile", "reports", "catalog"].includes(
      p,
    )
  )
    return;
  if (dirty && !confirm("Descartar os dados preenchidos?")) return;
  setSidebarOpen(false);
  dirty = false;
  page = p;
  if (p === "reports") reportPage = 1;
  selected = id;
  query = "";
  course = "";
  classroom = "";
  room = "";
  countFilter = "";
  pendingKey = null;
  const attempt = ++navigation;
  if (
    passwordLogin &&
    ["students", "profile", "register", "depe", "reports", "catalog"].includes(
      p,
    )
  ) {
    $("#content").innerHTML = loadingState("Atualizando dados…");
    try {
      const data = await rpc("carregarDados");
      if (attempt !== navigation) return;
      db = data;
    } catch (error) {
      if (attempt !== navigation) return;
      $("#content").innerHTML = '<p class="error" role="alert"></p>';
      $("#content .error").textContent = error.message;
      focusPageHeading();
      return;
    }
  }
  render();
  focusPageHeading();
  window.scrollTo(0, 0);
}
const themeToggle = () =>
  `<button type="button" class="theme-toggle quiet" data-theme-toggle aria-label="Tema escuro" aria-pressed="${document.documentElement.dataset.theme === "dark"}" title="Tema escuro"><span class="theme-light">${icon("moon")}</span><span class="theme-dark">${icon("sun")}</span></button>`;

const campusMark = () =>
  `<span class="campus-mark" aria-hidden="true"><img class="theme-light" src="/assets/ifam-claro.png" alt=""><img class="theme-dark" src="/assets/ifam-escuro.png" alt=""></span>`;

function accessScreen(form) {
  $("#app").innerHTML = `<main class="login">
    <section class="login-identity" aria-label="${IFAM.CAMPUS_NAME}">
      <div class="login-campus">${campusMark()}<span>${IFAM.CAMPUS_NAME}</span></div>
      <div class="login-product"><strong>ADAM</strong><p>Sistema de Ocorrências Estudantis</p></div>
    </section>
    <section class="login-access">
      <div class="login-controls">${themeToggle()}</div>
      <div class="login-card">${form}</div>
      <div class="login-footer">${demoMode ? "Demonstração com dados fictícios" : "Acesso institucional"}</div>
    </section>
  </main>`;
}

function login(error = "") {
  accessScreen(`<h1>Entrar no ADAM</h1>
    <p>${passwordLogin ? "Use as credenciais fornecidas pela instituição." : "Acesse o sistema de ocorrências estudantis."}</p>
    ${error ? `<div class="error" role="alert">${esc(error)}</div>` : ""}
    <form id="login-form">
      ${passwordLogin ? '<label class="field">Usuário<input name="usuario" autocomplete="username" required maxlength="128"></label><label class="field">Senha<input name="senha" type="password" autocomplete="current-password" required maxlength="256"></label>' : ""}
      <button class="primary" id="enter">${passwordLogin ? "Entrar" : demoMode ? "Entrar em demonstração" : "Entrar com Google"} ${icon("arrow")}</button>
    </form>`);
  $("#login-form").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (!demoMode && !passwordLogin) {
      location.assign("/auth/google");
      return;
    }
    const button = $("#enter");
    button.disabled = true;
    button.textContent = "Entrando…";
    try {
      const response = await fetch(
        passwordLogin ? "/auth/password" : "/auth/demo",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        },
      );
      if (!response.ok)
        throw new Error(
          (await response.json()).error?.message || "Não foi possível entrar.",
        );
      await service.load();
      enterPortal();
    } catch (e) {
      login(e.message);
    }
  };
}

function enterPortal() {
  if (user.trocaSenha) {
    accessScreen(`<h1>Troque sua senha temporária</h1>
      <form id="change"><label class="field">Nova senha<input name="senha" type="password" autocomplete="new-password" minlength="6" required></label>
      <p id="change-error" role="alert"></p><button class="primary">Salvar e entrar</button></form>`);
    $("#change").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.currentTarget,
        button = form.querySelector("button");
      button.disabled = true;
      try {
        await rpc("trocarSenha", { senha: form.elements.senha.value });
        await service.load();
        enterPortal();
      } catch (error) {
        $("#change-error").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    return;
  }
  if (passwordLogin) {
    page =
      user.perfil === "ADMIN"
        ? "admin"
        : user.perfil === "DEP"
          ? "depe"
          : "home";
    selected = "";
    query =
      course =
      classroom =
      room =
      countFilter =
      from =
      to =
      typeFilter =
        "";
    pendingKey = null;
    statusFilter = user.perfil === "DEP" ? "ENCAMINHADO" : "";
  }
  render();
}

const roles = {
  ADMIN: "Administrador",
  DEP: "DEPE",
  ASSISTENTE: "Assistente de Alunos",
};
const roleOptions = (selected) =>
  Object.entries(roles)
    .map(
      ([k, v]) =>
        `<option value="${k}" ${k === selected ? "selected" : ""}>${v}</option>`,
    )
    .join("");
function admin() {
  $("#content").innerHTML =
    heading("ADMINISTRAÇÃO", "Criar conta", "Cadastre o acesso ao ADAM.") +
    `<section class="panel"><div class="panel-body"><form id="new-account">
      <label class="field">Nome<input name="nome" required maxlength="120"></label>
      <label class="field">Usuário<input name="usuario" required maxlength="40"></label>
      <label class="field">Perfil<select name="perfil">${roleOptions("ASSISTENTE")}</select></label>
      <label class="field">Senha temporária<input name="senha" type="password" autocomplete="new-password" minlength="6" required></label>
      <button class="primary action-icon">${icon("admin")} Criar conta</button>
    </form></div></section>`;
  $("#new-account").onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget,
      button = form.querySelector("button");
    button.disabled = true;
    try {
      await rpc("cadastrarConta", Object.fromEntries(new FormData(form)));
      form.reset();
      toast("Conta criada.");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  };
}

function render() {
  const accountOnly = passwordLogin && user.perfil === "ADMIN";
  const depeOnly = passwordLogin && user.perfil === "DEP";
  const nav = [
    ...(passwordLogin && user.perfil === "ADMIN"
      ? [["admin", "Criar conta"]]
      : []),
    ["home", "Início"],
    ["students", "Alunos"],
    ...(can("manageCatalog") ? [["catalog", "Cursos e turmas"]] : []),
    ["register", "Registrar ocorrência"],
    ["depe", "Encaminhamentos ao DEPE"],
    ["reports", "Relatórios"],
  ];
  const items = nav
    .filter(([p]) =>
      accountOnly
        ? p === "admin"
        : depeOnly
          ? ["depe", "students", "reports", "catalog"].includes(p)
          : p !== "register" || can("register"),
    )
    .map(([p, label]) => {
      const active =
        page === p ||
        (p === "students" && page === "profile") ||
        (p === "depe" && page === "document");
      return `<button data-nav="${p}" ${active ? 'class="active" aria-current="page"' : ""}>${icon(p === "register" ? "plus" : p)}${label}</button>`;
    })
    .join("");
  $("#app").innerHTML = `
    <div class="layout">
      <aside id="sidebar" aria-label="Menu lateral">
        <div class="sidebar-brand"><strong>ADAM</strong><span>Ocorrências Estudantis</span>
          <button type="button" class="quiet sidebar-close" id="close-menu" aria-label="Fechar menu">${icon("close")}</button>
        </div>
        <nav aria-label="Menu principal">${items}</nav>
        ${accountOnly || depeOnly ? "" : `<div class="aside-foot"><button class="quiet" data-nav="settings">${icon("settings")} Sobre o sistema</button></div>`}
      </aside>
      <button type="button" class="sidebar-scrim" id="sidebar-scrim" tabindex="-1" aria-hidden="true" hidden></button>
      <div class="main">
        <header>
          <button type="button" class="quiet menu-toggle" aria-label="Abrir menu" aria-controls="sidebar" aria-expanded="false" id="menu">${icon("menu")}</button>
          <div class="campus">${campusMark()}<strong>${IFAM.CAMPUS_NAME}</strong></div>
          <div class="header-right">
            ${accountOnly ? "" : `<label class="year-field"><span>Ano letivo</span><select id="year" aria-label="Ano letivo">${db.AnosLetivos.map((y) => `<option ${Number(y.ano) === year ? "selected" : ""}>${y.ano}</option>`).join("")}</select></label>`}
            ${themeToggle()}
            <div class="user"><span class="avatar">${esc(initials(user.nome))}</span><div class="username">${esc(user.nome)}<small>${roles[user.perfil]}</small></div></div>
            <button class="quiet" id="logout" aria-label="Sair" title="Sair">${icon("logout")}</button>
          </div>
        </header>
        <main id="main-content" tabindex="-1">
          ${demoMode ? '<div class="demo"><span class="dot"></span>Demonstração com dados fictícios</div>' : ""}
          <div id="content"></div>
          <footer class="footer">${IFAM.CAMPUS_NAME}${accountOnly ? "" : ` · Ano letivo ${year}`}</footer>
        </main>
      </div>
    </div>`;
  document
    .querySelectorAll("[data-nav]")
    .forEach((b) => (b.onclick = () => navigate(b.dataset.nav)));
  document.body.classList.remove("sidebar-open");
  $("#menu").onclick = () => setSidebarOpen(true);
  $("#close-menu").onclick = () => setSidebarOpen(false, true);
  $("#sidebar-scrim").onclick = () => setSidebarOpen(false, true);
  $("#sidebar").onkeydown = (event) => {
    if (!event.currentTarget.classList.contains("open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setSidebarOpen(false, true);
    }
    containTab(event);
  };
  if ($("#year"))
    $("#year").onchange = (e) => {
      if (dirty && !confirm("Descartar o formulário para mudar o ano?")) {
        e.target.value = year;
        return;
      }
      dirty = false;
      year = +e.target.value;
      reportPage = 1;
      if ($("#content [role=status]")) return;
      render();
    };
  $("#logout").onclick = async () => {
    if (dirty && !confirm("Sair e descartar o formulário?")) return;
    try {
      const response = await fetch("/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrfToken },
      });
      if (!response.ok) throw new Error("Não foi possível sair.");
      navigation++;
      dirty = false;
      user = null;
      db = null;
      permissions = [];
      csrfToken = "";
      clearTimeout(toastTimer);
      $("#toast").style.display = "none";
      $("#toast").replaceChildren();
      login();
    } catch (e) {
      toast(e.message, "error");
    }
  };
  (
    ({
      admin,
      home,
      students,
      catalog: catalogPage,
      register,
      depe,
      reports,
      profile,
      document: documentView,
      settings,
    })[accountOnly ? "admin" : page] || home
  )();
}
function heading(k, title, sub, action = "") {
  return `<div class="eyebrow">${k}</div><div class="title-row"><div><h1 tabindex="-1">${title}</h1><p>${sub}</p></div>${action}</div>`;
}
const newButton = () =>
  can("register")
    ? `<button class="primary action-icon" onclick="navigate('register')">${icon("register")} Registrar ocorrência</button>`
    : "";
function responsiveTable(name, headers, body) {
  return `<table class="responsive-table" role="table" aria-label="${esc(name)}">
    <thead role="rowgroup"><tr role="row">${headers.map((label) => `<th role="columnheader" scope="col">${esc(label)}</th>`).join("")}</tr></thead>
    <tbody role="rowgroup">${body}</tbody>
  </table>`;
}
function emptyState(message) {
  return `<div class="empty">${icon("inbox")}<span>${esc(message)}</span></div>`;
}
function rows(list) {
  return list
    .map((o) => {
      const a = student(o.alunoId);
      return `<tr role="row">
        <td role="cell">${person(a)}</td>
        <td role="cell" data-label="Turma">${esc(a.turma)}</td>
        <td role="cell" data-label="Tipo de ocorrência"><div class="tagrow">${tags(o)}</div></td>
        <td role="cell" data-label="Data">${dt(o.dataHoraAbordagem).split(",")[0]}</td>
        <td role="cell" class="table-actions"><button class="text-link action-icon" onclick="navigate('profile','${a.id}')" aria-label="Ver histórico de ${esc(a.nome)}">Ver histórico ${icon("arrow")}</button></td>
      </tr>`;
    })
    .join("");
}
function occurrenceTable(list) {
  return list.length
    ? responsiveTable(
        "Ocorrências",
        ["Aluno", "Turma", "Tipo de ocorrência", "Data", "Ações"],
        rows(list),
      )
    : emptyState("Nenhuma ocorrência neste período.");
}
function filteredOccurrences(day = (date) => date.slice(0, 10)) {
  return db.Ocorrencias.filter(
    (o) =>
      Number(o.anoLetivo) === year &&
      o.status === "ATIVA" &&
      (!from || day(o.dataHoraAbordagem) >= from) &&
      (!to || day(o.dataHoraAbordagem) <= to) &&
      (!course || student(o.alunoId).curso === course) &&
      (!classroom || student(o.alunoId).turma === classroom) &&
      (!room || roomFor(student(o.alunoId)) === room) &&
      (!typeFilter || JSON.parse(o.irregularidadesJson).includes(typeFilter)),
  ).sort(
    (a, b) =>
      b.dataHoraAbordagem.localeCompare(a.dataHoraAbordagem) ||
      a.id.localeCompare(b.id),
  );
}
function stats(items) {
  return `<div class="stats">${items.map(([n, t, s, i]) => `<div class="stat"><div class="stat-top">${t}<span class="stat-icon">${icon(i)}</span></div><b>${n}</b><small>${s}</small></div>`).join("")}</div>`;
}
function home() {
  const os = filteredOccurrences(),
    refs = db.Encaminhamentos.filter(
      (e) => Number(e.anoLetivo) === year && e.status === "PENDENTE",
    );
  $("#content").innerHTML =
    heading(
      "VISÃO GERAL",
      "Tudo em dia, por aqui.",
      `Acompanhe os registros e os próximos passos do ano letivo de ${year}.`,
      newButton(),
    ) +
    `<div class="filterbar"><label class="field" style="margin:0">De <input type="date" id="from" value="${from}"></label><label class="field" style="margin:0">Até <input type="date" id="to" value="${to}"></label></div>` +
    stats([
      [os.length, "Ocorrências", "No período selecionado", "depe"],
      [
        db.Alunos.filter((a) => annual(a.id).length === 2).length,
        "Atenção ao limite",
        "Alunos com 2 registros no ano",
        "clock",
      ],
      [
        refs.length,
        "Pendentes no DEPE",
        "Aguardando encaminhamento no ano",
        "arrow",
      ],
      [
        db.Alunos.length,
        "Alunos cadastrados",
        "Na comunidade escolar",
        "students",
      ],
    ]) +
    `<div class="grid"><section class="panel"><div class="panel-head"><div><h2>Ocorrências recentes</h2><p>Últimas abordagens registradas</p></div><button class="text-link" onclick="navigate('reports')">Ver todas ${icon("arrow")}</button></div>${occurrenceTable(os.slice(0, 6))}</section><div><section class="panel"><div class="panel-head"><div><h2>Próximos encaminhamentos</h2><p>Alunos que atingiram três ocorrências</p></div><span class="badge warn">${refs.length}</span></div>${
      refs
        .slice(0, 4)
        .map(
          (e) =>
            `<div class="pending-item"><div>${person(student(e.alunoId))}<p>${esc(student(e.alunoId).turma)} &nbsp; · &nbsp; 3 ocorrências no ano</p></div><button class="text-link" onclick="navigate('depe','${e.id}')" aria-label="Ver encaminhamento de ${esc(student(e.alunoId).nome)}">${icon("arrow")}</button></div>`,
        )
        .join("") || emptyState("Nenhum encaminhamento pendente.")
    }<div style="padding:12px 20px"><button class="text-link" onclick="navigate('depe')">Acessar encaminhamentos ${icon("arrow")}</button></div></section><div class="note"><strong>Uma abordagem, um registro.</strong><br>Mesmo com mais de uma irregularidade, a abordagem conta como uma única ocorrência.</div></div></div>`;
  dateEvents(home);
}
const courseCatalog = () => db.CatalogoAcademico || [];
const classesFor = (name) =>
  courseCatalog().find((entry) => entry.nome === name)?.turmas || [];
const roomFor = (student) =>
  classesFor(student?.curso).find((entry) => entry.nome === student?.turma)
    ?.sala || "";
function optionList(values, value, placeholder) {
  const sorted = [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  return (
    `<option value="">${placeholder}</option>` +
    sorted
      .map(
        (v) =>
          `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(v)}</option>`,
      )
      .join("")
  );
}
function options(field, value) {
  const courses = courseCatalog();
  const classes = courses.flatMap((entry) => entry.turmas);
  const values =
    field === "sala"
      ? classes.map((entry) => entry.sala)
      : [
          ...db.Alunos.map((a) => a[field]),
          ...(field === "curso" ? courses : classes).map((entry) => entry.nome),
        ];
  const placeholders = {
    curso: "Todos os cursos",
    turma: "Todas as turmas",
    sala: "Todas as salas",
  };
  return optionList(values, value, placeholders[field]);
}
function roomFilter() {
  return db.CatalogoAcademico
    ? `<select id="room" aria-label="Sala">${options("sala", room)}</select>`
    : "";
}
function filters(extra = "") {
  return `<div class="filterbar"><input id="search" placeholder="Buscar por nome ou matrícula" aria-label="Buscar aluno" value="${esc(query)}"><select id="course" aria-label="Curso">${options("curso", course)}</select><select id="classroom" aria-label="Turma">${options("turma", classroom)}</select>${roomFilter()}${extra}</div>`;
}
function filterEvents(fn) {
  $("#search").oninput = (e) => {
    query = e.target.value;
    fn(true);
  };
  $("#course").onchange = (e) => {
    course = e.target.value;
    fn(true);
  };
  $("#classroom").onchange = (e) => {
    classroom = e.target.value;
    fn(true);
  };
  $("#room")?.addEventListener("change", (e) => {
    room = e.target.value;
    fn(true);
  });
}
function matches(a) {
  return (
    (a.nome + " " + a.matricula)
      .toLocaleLowerCase("pt-BR")
      .includes(query.toLocaleLowerCase("pt-BR")) &&
    (!course || a.curso === course) &&
    (!classroom || a.turma === classroom) &&
    (!room || roomFor(a) === room)
  );
}
function students(only = false) {
  const list = db.Alunos.filter(
    (a) => matches(a) && (!countFilter || annual(a.id).length === +countFilter),
  );
  const body = list.length
    ? responsiveTable(
        "Alunos cadastrados",
        [
          "Aluno / matrícula",
          "Curso",
          "Turma",
          `Ocorrências em ${year}`,
          "Ações",
        ],
        list
          .map((a) => {
            const total = annual(a.id).length;
            const sala = roomFor(a);
            return `<tr role="row">
            <td role="cell">${person(a)}${a.ativo ? "" : '<span class="badge warn">Inativo</span>'}</td>
            <td role="cell" data-label="Curso">${esc(a.curso)}</td>
            <td role="cell" data-label="Turma">${esc(a.turma)}${sala ? `<small class="class-room">Sala ${esc(sala)}</small>` : ""}</td>
            <td role="cell" data-label="Ocorrências"><span class="badge ${total >= 3 ? "red" : total === 2 ? "warn" : "green"}">${total} de 3</span></td>
            <td role="cell" class="table-actions"><button class="text-link action-icon" onclick="navigate('profile','${a.id}')">Ver histórico ${icon("arrow")}</button></td>
          </tr>`;
          })
          .join(""),
      )
    : emptyState(
        db.Alunos.length
          ? "Nenhum aluno encontrado. Tente outros filtros."
          : "Ainda não há alunos cadastrados.",
      );
  if (only) {
    $("#student-results").innerHTML = body;
    return;
  }
  $("#content").innerHTML =
    heading(
      "COMUNIDADE ESCOLAR",
      "Alunos",
      `Consulte cadastros e acompanhe o histórico individual em ${year}.`,
      can("createStudent")
        ? `<button class="primary action-icon" id="add-student">${icon("plus")} Cadastrar aluno</button>`
        : "",
    ) +
    filters(
      `<select id="count" aria-label="Quantidade de ocorrências"><option value="">Todas as contagens</option>${[0, 1, 2, 3].map((n) => `<option value="${n}" ${countFilter === String(n) ? "selected" : ""}>${n} ocorrências</option>`).join("")}</select>`,
    ) +
    `<section class="panel" id="student-results">${body}</section>`;
  filterEvents(students);
  $("#count").onchange = (e) => {
    countFilter = e.target.value;
    students(true);
  };
  if ($("#add-student")) $("#add-student").onclick = () => studentModal();
}
function syncDialogViewport() {
  const dialog = $("#modal");
  if (!dialog.open) return;
  const viewport = window.visualViewport;
  dialog.style.setProperty(
    "--viewport-height",
    `${viewport?.height ?? innerHeight}px`,
  );
  dialog.style.setProperty("--viewport-top", `${viewport?.offsetTop ?? 0}px`);
}
window.visualViewport?.addEventListener("resize", syncDialogViewport);
window.visualViewport?.addEventListener("scroll", syncDialogViewport);
window.addEventListener("resize", syncDialogViewport);

function modal(html, onSubmit) {
  const m = $("#modal");
  const trigger = document.activeElement;
  m.innerHTML = html;
  const title = m.querySelector("h2");
  title.id = "dialog-title";
  title.tabIndex = -1;
  const header = document.createElement("div");
  header.className = "dialog-heading";
  header.innerHTML = `<button type="button" class="quiet dialog-close" data-close aria-label="Fechar">${icon("close")}</button>`;
  header.prepend(title);
  const body = document.createElement("div");
  body.className = "dialog-content";
  const form = m.querySelector("form");
  const actions = (form || m).querySelector(".actions");
  actions?.classList.add("dialog-actions");
  actions?.remove();
  form?.remove();
  body.append(...m.childNodes);
  if (form) {
    form.classList.add("dialog-form");
    body.append(...form.childNodes);
    form.append(body);
    if (actions) form.append(actions);
    m.replaceChildren(header, form);
    if (onSubmit) form.onsubmit = onSubmit;
  } else {
    m.replaceChildren(header, body);
    if (actions) m.append(actions);
  }
  m.setAttribute("aria-labelledby", title.id);
  m.onkeydown = containTab;
  m.onclose = () => {
    if (m.open) return;
    const opener = trigger.isConnected
      ? trigger
      : document.getElementById(trigger.id);
    if (
      opener &&
      opener !== document.body &&
      opener.getClientRects().length &&
      !opener.matches(":disabled")
    ) {
      opener.focus({ preventScroll: true });
    } else {
      focusPageHeading();
    }
  };
  m.showModal();
  syncDialogViewport();
  title.focus({ preventScroll: true });
  m.querySelectorAll("[data-close]").forEach(
    (b) => (b.onclick = () => m.close()),
  );
}
function catalogPage() {
  if (!can("manageCatalog")) return;
  const courses = courseCatalog();
  const rows = courses
    .map(
      (course) =>
        `<tr role="row"><td role="cell" class="catalog-course">${esc(course.nome)}</td><td role="cell" data-label="Turmas e salas">${
          course.turmas.length
            ? `<div class="catalog-classes">${course.turmas
                .map(
                  (entry) =>
                    `<div class="catalog-class">
                      <div class="catalog-class-info"><strong>${esc(entry.nome)}</strong>${entry.sala ? `<small class="class-room">Sala ${esc(entry.sala)}</small>` : ""}</div>
                      <button type="button" class="text-link action-icon danger" data-exclude-course="${esc(course.nome)}" data-exclude-class="${esc(entry.nome)}" aria-label="Excluir turma ${esc(entry.nome)} do curso ${esc(course.nome)}">${icon("trash")} Excluir turma</button>
                    </div>`,
                )
                .join("")}</div>`
            : "Nenhuma turma cadastrada"
        }</td><td role="cell" class="table-actions"><button type="button" class="action-icon danger" data-exclude-course="${esc(course.nome)}" aria-label="Excluir curso ${esc(course.nome)}">${icon("trash")} Excluir curso</button></td></tr>`,
    )
    .join("");
  $("#content").innerHTML =
    heading(
      "CADASTRO ACADÊMICO",
      "Cursos e turmas",
      "Organize as opções usadas no cadastro de alunos.",
    ) +
    `<div class="grid">
      <section class="panel"><div class="panel-head"><h2>Novo curso</h2></div><div class="panel-body">
        <form id="new-course"><label class="field">Nome do curso<input name="curso" required maxlength="120"></label>
        <div class="catalog-feedback" role="alert"></div><button class="primary action-icon">${icon("plus")} Cadastrar curso</button></form>
      </div></section>
      <section class="panel"><div class="panel-head"><h2>Nova turma</h2></div><div class="panel-body">
        <form id="new-class"><label class="field">Curso<select name="curso" aria-label="Curso" required>${optionList(
          courses.map((c) => c.nome),
          "",
          "Selecione um curso",
        )}</select></label>
        <label class="field">Nome da turma<input name="turma" required maxlength="80"></label>
        <label class="field">Sala (opcional)<input name="sala" maxlength="80"></label>
        <div class="catalog-feedback" role="alert"></div><button class="primary action-icon" ${courses.length ? "" : "disabled"}>${icon("plus")} Cadastrar turma</button></form>
      </div></section>
    </div>
    <section class="panel"><div class="panel-head"><h2>Cursos cadastrados</h2></div>
    ${rows ? responsiveTable("Cursos cadastrados", ["Curso", "Turmas e salas", "Ações"], rows) : emptyState("Cadastre um curso para começar.")}</section>`;
  document.querySelectorAll("[data-exclude-course]").forEach((button) => {
    button.onclick = () =>
      excludeCatalogEntry(
        button.dataset.excludeCourse,
        button.dataset.excludeClass,
      );
  });
  for (const [selector, action, message] of [
    ["#new-course", "cadastrarCurso", "Curso cadastrado."],
    ["#new-class", "cadastrarTurma", "Turma salva."],
  ]) {
    const form = $(selector);
    let key = uid();
    form.oninput = () => {
      key = uid();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      const button = form.querySelector(".primary");
      button.disabled = true;
      try {
        await service.mutate(action, {
          ...Object.fromEntries(new FormData(form)),
          chaveIdempotencia: key,
        });
        await service.refresh();
        if (page === "catalog") catalogPage();
        toast(message);
      } catch (error) {
        form.querySelector(".catalog-feedback").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
  }
}
function excludeCatalogEntry(curso, turma) {
  const key = uid();
  const kind = turma ? "turma" : "curso";
  const name = turma ? `${turma} · ${curso}` : curso;
  mutationModal(
    `<h2>Excluir ${kind}</h2><p>Confirme a exclusão de <strong>${esc(name)}</strong> do catálogo.</p>
    <form>${modalActions("Confirmar exclusão", "trash", true)}</form>`,
    () =>
      service.mutate(turma ? "excluirTurma" : "excluirCurso", {
        curso,
        ...(turma && { turma }),
        chaveIdempotencia: key,
      }),
    turma ? "Turma excluída." : "Curso excluído.",
  );
}
function studentFields(a) {
  const input = (name, label, max) =>
    `<label class="field">${label}<input name="${name}" required maxlength="${max}" value="${esc(a?.[name])}"></label>`;
  const identity =
    input("nome", "Nome completo", 150) + input("matricula", "Matrícula", 40);
  if (!db.CatalogoAcademico)
    return (
      identity + input("curso", "Curso", 120) + input("turma", "Turma", 80)
    );
  return (
    identity +
    `<label class="field">Curso<select name="curso" aria-label="Curso" required>${optionList(
      courseCatalog().map((c) => c.nome),
      a?.curso,
      "Selecione um curso",
    )}</select></label>
    <label class="field">Turma<select name="turma" aria-label="Turma" required></select></label>`
  );
}
function studentModal(a) {
  if (!can(a ? "student" : "createStudent")) return;
  const key = uid();
  modal(
    `<h2>${a ? "Editar cadastro" : "Cadastrar aluno"}</h2><p>${demoMode ? "Use somente dados fictícios nesta demonstração." : ""}</p><form><div class="form-grid">${studentFields(a)}</div>${db.CatalogoAcademico ? '<p class="selected-room" aria-live="polite"></p>' : ""}<div id="modal-error" role="alert"></div><div class="actions"><button type="button" data-close>Cancelar</button><button class="primary">Salvar cadastro</button></div></form>`,
    async (e) => {
      e.preventDefault();
      const b = e.target.querySelector("button.primary");
      b.disabled = true;
      try {
        const p = Object.fromEntries(new FormData(e.target));
        p.chaveIdempotencia = key;
        if (a) {
          p.alunoId = a.id;
          p.versaoEsperada = a.versao;
        }
        await service.mutate(a ? "atualizarAluno" : "cadastrarAluno", p);
        await service.refresh();
        $("#modal").close();
        render();
        toast("Cadastro salvo com sucesso.");
      } catch (err) {
        $("#modal-error").innerHTML =
          `<div class="error">${esc(err.message)}</div>`;
      } finally {
        b.disabled = false;
      }
    },
  );
  if (!db.CatalogoAcademico) return;
  const form = $("#modal form");
  const { curso, turma } = form.elements;
  const roomLabel = form.querySelector(".selected-room");
  const showRoom = () => {
    const sala = roomFor({ curso: curso.value, turma: turma.value });
    roomLabel.textContent = sala
      ? `Sala: ${sala}`
      : turma.value
        ? "Sala não informada"
        : "";
  };
  const fillClasses = (selectedClass = "") => {
    const classes = classesFor(curso.value);
    turma.innerHTML = optionList(
      classes.map((entry) => entry.nome),
      selectedClass,
      curso.value && !classes.length
        ? "Nenhuma turma cadastrada"
        : "Selecione uma turma",
    );
    form.querySelector(".primary").disabled = !classes.length;
    showRoom();
  };
  curso.onchange = () => fillClasses();
  turma.onchange = showRoom;
  fillClasses(a?.turma);
}
function historyHTML(os, editable = false) {
  return `<div class="timeline">${
    os
      .map(
        (o) => `<article>
    <time>${dt(o.dataHoraAbordagem)}</time>
    <h3>${occurrenceDescription(JSON.parse(o.irregularidadesJson), o.tituloPersonalizado, " · ")}</h3>
    <p>${esc(o.observacao || "Sem observação.")}</p>
    <p>Registrado por ${esc(o.assistenteNome || db.Usuarios.find((u) => u.id === o.assistenteId)?.nome || "Usuário autorizado")}</p>
    ${o.editadoEm ? `<p>Última correção em ${dt(o.editadoEm)}.${o.corrigidaAposEnvio ? " Corrigida após o envio. O relatório enviado preserva a versão original." : ""}</p>` : ""}
    ${editable ? `<button class="text-link action-icon" data-edit-occurrence="${esc(o.id)}">${icon("edit")} Editar ocorrência</button>` : ""}
  </article>`,
      )
      .join("") || "<p>Nenhuma ocorrência neste ano letivo.</p>"
  }</div>`;
}
function referralHistory(referrals) {
  if (!referrals.length)
    return "<p>Nenhum encaminhamento disponível para este ano letivo.</p>";
  return referrals
    .map(
      (r) => `<article class="student-referral">
    <div>${badge(r.status)} <time>${dt(r.encaminhadoEm || r.criadoEm)}</time></div>
    ${r.lidoEm ? `<p>Leitura confirmada em ${dt(r.lidoEm)}</p>` : ""}
    ${r.concluidoEm ? `<p>Caso encerrado em ${dt(r.concluidoEm)}</p>` : ""}
    <div class="actions">
      <button class="action-icon" data-referral="${esc(r.id)}">${icon("arrow")} Ver encaminhamento</button>
      <button class="action-icon" data-document="${esc(r.id)}">${icon("depe")} Ver relatório e PDF</button>
    </div>
  </article>`,
    )
    .join("");
}
function profile() {
  const a = student(selected);
  if (!a) {
    navigate("students");
    return;
  }
  const os = annual(a.id).sort((a, b) =>
    b.dataHoraAbordagem.localeCompare(a.dataHoraAbordagem),
  );
  const referrals = db.Encaminhamentos.filter(
    (e) => e.alunoId === a.id && +e.anoLetivo === year,
  ).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  $("#content").innerHTML =
    heading(
      "HISTÓRICO DO ALUNO",
      esc(a.nome),
      `${esc(a.matricula)} · ${esc(a.curso)} · ${esc(a.turma)}${roomFor(a) ? ` · Sala ${esc(roomFor(a))}` : ""} · ${a.ativo ? "Ativo" : "Inativo"}`,
      `<button class="action-icon" onclick="navigate('students')">${icon("back")} Voltar para alunos</button>`,
    ) +
    `<div class="grid">
      <section class="panel"><div class="panel-head"><h2>Histórico de ${year}</h2><span class="badge">${os.length} registros</span></div><div class="panel-body">${historyHTML(os, can("editOccurrence"))}</div></section>
      <div>
        <section class="panel"><div class="panel-head"><h2>Cadastro</h2></div><div class="panel-body">
          <p>${os.length} de 3 ocorrências no ano letivo.</p>
          <div class="actions">
            ${a.ativo && os.length < 3 && can("register") ? `<button id="register-for-student" class="primary action-icon">${icon("register")} Registrar ocorrência</button>` : ""}
            ${can("student") ? `<button class="action-icon" id="edit-student">${icon("edit")} Editar cadastro</button>` : ""}
            ${a.ativo && can("deactivateStudent") ? `<button class="action-icon danger" id="deactivate-student">${icon("deactivate")} Desativar aluno</button>` : ""}
          </div>
        </div></section>
        <section class="panel"><div class="panel-head"><h2>Encaminhamentos em ${year}</h2></div><div class="panel-body">${referralHistory(referrals)}</div></section>
      </div>
    </div>`;
  $("#edit-student")?.addEventListener("click", () => studentModal(a));
  $("#deactivate-student")?.addEventListener("click", () =>
    deactivateStudent(a),
  );
  $("#register-for-student")?.addEventListener("click", () =>
    navigate("register", a.id),
  );
  document.querySelectorAll("[data-edit-occurrence]").forEach((b) => {
    b.onclick = () =>
      editOccurrence(os.find((o) => o.id === b.dataset.editOccurrence));
  });
  document.querySelectorAll("[data-referral]").forEach((b) => {
    b.onclick = () => navigate("depe", b.dataset.referral);
  });
  document.querySelectorAll("[data-document]").forEach((b) => {
    b.onclick = () => navigate("document", b.dataset.document);
  });
}
function mutationModal(html, mutate, message) {
  modal(html, async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector(".primary");
    button.disabled = true;
    try {
      await mutate(event.currentTarget);
      await service.refresh();
      $("#modal").close();
      render();
      toast(message);
    } catch (error) {
      $("#modal-error").innerHTML =
        `<div class="error">${esc(error.message)}</div>`;
    } finally {
      button.disabled = false;
    }
  });
}
function modalActions(label, glyph, destructive = false) {
  return `<div id="modal-error" role="alert"></div><div class="actions"><button type="button" data-close>Cancelar</button><button class="primary${glyph ? " action-icon" : ""}${destructive ? " danger" : ""}">${glyph ? icon(glyph) : ""} ${label}</button></div>`;
}
function deactivateStudent(a) {
  const key = uid();
  mutationModal(
    `<h2>Desativar aluno</h2><p>Confirme a desativação de <strong>${esc(a.nome)}</strong>. O histórico fica disponível para consulta.</p>
      <form>${modalActions("Confirmar desativação", "deactivate", true)}</form>`,
    () =>
      service.mutate("desativarAluno", {
        alunoId: a.id,
        versaoEsperada: a.versao,
        chaveIdempotencia: key,
      }),
    "Aluno desativado.",
  );
}
function occurrenceFields(occurrence) {
  const checked = occurrence ? JSON.parse(occurrence.irregularidadesJson) : [];
  const custom = checked.includes("PERSONALIZADA");
  const suffix = occurrence ? "-edit" : "";
  return `<fieldset class="occurrence-types"><legend>Tipo de ocorrência</legend><div class="choices">${availableTypes()
    .map(
      (t) =>
        `<label class="choice"><input type="checkbox" name="types" value="${t}" ${checked.includes(t) ? "checked" : ""}><span><strong>${labels[t]}</strong><br><small>${t === "PERSONALIZADA" ? "Informar outro tipo" : t === "ATRASO" ? "Chegada após o horário" : "Fora do padrão"}</small></span></label>`,
    )
    .join(
      "",
    )}</div><p>Selecione os tipos aplicáveis. Cada abordagem conta como uma ocorrência.</p></fieldset>
  ${customOccurrences ? `<label class="field" data-custom-title-field ${custom ? "" : "hidden"}>Título da ocorrência<input name="customTitle" maxlength="${IFAM.CUSTOM_TITLE_MAX}" ${custom ? "required" : "disabled"} value="${esc(occurrence?.tituloPersonalizado)}"></label>` : ""}
  <label class="field">Observação <span style="font-weight:400">Opcional</span><textarea id="observation${suffix}" name="observation" maxlength="2000" placeholder="Descreva a abordagem de forma objetiva e respeitosa.">${esc(occurrence?.observacao)}</textarea></label>`;
}
function bindOccurrenceFields(form) {
  const choices = [...form.querySelectorAll("[name=types]")];
  const custom = choices.find((choice) => choice.value === "PERSONALIZADA");
  const title = form.elements.customTitle;
  if (custom)
    form.onchange = (event) => {
      const choice = event.target;
      if (!choices.includes(choice)) return;
      if (choice.checked) {
        for (const other of choices)
          if (other !== choice && (choice === custom || other === custom))
            other.checked = false;
      }
      form.querySelector("[data-custom-title-field]").hidden = title.disabled =
        !custom.checked;
      title.required = custom.checked;
    };
  return () => ({
    irregularidades: choices
      .filter((choice) => choice.checked)
      .map((choice) => choice.value),
    ...(title && !title.disabled && { tituloPersonalizado: title.value }),
    observacao: form.elements.observation.value,
  });
}
function editOccurrence(occurrence) {
  const key = uid();
  mutationModal(
    `<h2>Editar ocorrência</h2><p>Abordagem de ${dt(occurrence.dataHoraAbordagem)}</p>
    <form>${occurrenceFields(occurrence)}${modalActions("Salvar correção", "check")}</form>`,
    () =>
      service.mutate("editarOcorrencia", {
        ...fields(),
        id: occurrence.id,
        versaoEsperada: occurrence.versao ?? 1,
        chaveIdempotencia: key,
      }),
    "Ocorrência atualizada.",
  );
  const fields = bindOccurrenceFields($("#modal form"));
}
function register() {
  if (!can("register")) {
    $("#content").innerHTML = '<div class="error">Acesso não autorizado.</div>';
    return;
  }
  const inactive = year !== +config.anoLetivoAtivo;
  $("#content").innerHTML =
    heading(
      "NOVO REGISTRO",
      "Registrar ocorrência",
      "Registre uma abordagem. Acompanhe cada estudante com cuidado.",
    ) +
    `<section class="panel form-card"><div class="panel-head"><h2>Dados da abordagem</h2><span class="badge">Ano letivo ${year}</span></div><div class="panel-body">${inactive ? '<div class="error">Ano disponível apenas para consulta. Selecione o ano letivo ativo.</div>' : ""}<form id="occurrence-form"><label class="field">1. Localizar aluno<input id="student-search" placeholder="Digite o nome ou matrícula" autocomplete="off"></label><label class="field">Aluno selecionado<select id="student-select" required><option value="">Selecione um aluno</option>${db.Alunos.filter(
      (a) => a.ativo,
    )
      .map(
        (a) =>
          `<option value="${a.id}" ${selected === a.id ? "selected" : ""}>${esc(a.nome)} · ${esc(a.matricula)}</option>`,
      )
      .join(
        "",
      )}</select></label><div id="student-summary"></div>${occurrenceFields()}<div class="note">Responsável: <strong>${esc(user.nome)}</strong><br>Data e horário serão registrados na confirmação, no fuso ${esc(config.fusoHorario)}.</div><div id="form-error" role="alert"></div><div class="actions"><button type="button" onclick="navigate('home')">Cancelar</button><button class="primary" ${inactive ? "disabled" : ""}>Revisar registro ${icon("arrow")}</button></div></form></div></section>`;
  const summary = () => {
    const a = student($("#student-select").value);
    $("#student-summary").innerHTML = a
      ? `<div class="note">${esc(a.curso)} · ${esc(a.turma)}<br><strong>${annual(a.id).length} de 3 ocorrências em ${year}</strong>${annual(a.id).length === 2 ? "<p>Este registro atingirá o limite de três ocorrências e incluirá o aluno na lista de encaminhamentos ao DEPE.</p>" : annual(a.id).length >= 3 ? "<p>Limite atingido. Novos registros dependem de definição institucional.</p>" : ""}</div>`
      : "";
  };
  summary();
  $("#student-select").onchange = () => {
    dirty = true;
    summary();
  };
  $("#student-search").oninput = (e) => {
    const q = e.target.value.toLowerCase(),
      prev = $("#student-select").value;
    $("#student-select").innerHTML =
      '<option value="">Selecione um aluno</option>' +
      db.Alunos.filter(
        (a) =>
          a.ativo && (a.nome + " " + a.matricula).toLowerCase().includes(q),
      )
        .map(
          (a) =>
            `<option value="${a.id}" ${a.id === prev ? "selected" : ""}>${esc(a.nome)} · ${esc(a.matricula)}</option>`,
        )
        .join("");
    summary();
  };
  const fields = bindOccurrenceFields($("#occurrence-form"));
  $("#occurrence-form").oninput = () => (dirty = true);
  $("#occurrence-form").onsubmit = (e) => {
    e.preventDefault();
    let p = {
      alunoId: $("#student-select").value,
      anoLetivo: year,
      ...fields(),
      chaveIdempotencia: pendingKey || uid(),
    };
    try {
      p = IFAM.normalize("registrarOcorrencia", p);
      if (annual(p.alunoId).length >= 3)
        throw new Error(
          "Limite atingido. A política após três ocorrências está pendente de definição.",
        );
    } catch (err) {
      $("#form-error").innerHTML =
        `<div class="error">${esc(err.message)}</div>`;
      return;
    }
    pendingKey = p.chaveIdempotencia;
    modal(
      `<h2>Conferir e confirmar</h2><p><strong>${esc(student(p.alunoId).nome)}</strong> · ${year}</p><p>${occurrenceDescription(p.irregularidades, p.tituloPersonalizado, " e ")}</p><p>${esc(p.observacao || "Sem observação.")}</p><div class="note">Este registro conta como uma abordagem.${annual(p.alunoId).length === 2 ? " Será criada uma pendência de encaminhamento ao DEPE." : ""}</div><div id="confirm-error" role="alert"></div><div class="actions"><button data-close>Voltar</button><button class="primary" id="confirm-register">Confirmar registro</button></div>`,
    );
    $("#confirm-register").onclick = async () => {
      const b = $("#confirm-register");
      b.disabled = true;
      b.textContent = "Registrando…";
      try {
        const result = await service.mutate("registrarOcorrencia", p);
        await service.refresh();
        dirty = false;
        pendingKey = null;
        $("#modal").close();
        $("#content").innerHTML =
          heading(
            "REGISTRO CONCLUÍDO",
            "Abordagem registrada.",
            "O histórico do aluno foi atualizado.",
          ) +
          `<div class="panel form-card"><div class="panel-body"><div class="success">✓ ${esc(student(p.alunoId).nome)} · ${result.contagem} de 3 ocorrências em ${year}.</div>${result.encaminhamento ? "<p>Uma pendência foi criada no DEPE. O documento ainda não foi encaminhado.</p>" : ""}<div class="actions"><button onclick="navigate('profile','${p.alunoId}')">Ver histórico</button>${result.encaminhamento ? `<button onclick="navigate('depe','${result.encaminhamento.id}')">Ver encaminhamento ao DEPE</button>` : ""}<button class="primary" onclick="navigate('register')">Registrar outra ocorrência</button></div></div></div>`;
      } catch (err) {
        $("#confirm-error").innerHTML =
          `<div class="error">${esc(err.message)}</div>`;
        b.disabled = false;
        b.textContent = "Tentar novamente";
      }
    };
  };
}
function depe(only = false) {
  if (selected) {
    referralDetail();
    return;
  }
  const depeOnly = passwordLogin && user.perfil === "DEP";
  const rs = db.Encaminhamentos.filter(
    (e) =>
      +e.anoLetivo === year &&
      (!statusFilter || e.status === statusFilter) &&
      student(e.alunoId) &&
      matches(student(e.alunoId)),
  );
  const list = rs.length
    ? responsiveTable(
        "Encaminhamentos ao DEPE",
        [
          "Aluno",
          "Turma",
          "Data",
          "Status",
          ...(passwordLogin ? ["Leitura"] : []),
          "Ações",
        ],
        rs
          .map((e) => {
            const a = student(e.alunoId);
            const readStatus = e.lidoEm
              ? "Confirmada"
              : e.status === "PENDENTE"
                ? "—"
                : "Sem confirmação";
            return `<tr role="row">
            <td role="cell">${person(a)}</td>
            <td role="cell" data-label="Turma">${esc(a.turma)}</td>
            <td role="cell" data-label="Data">${dt(passwordLogin && e.encaminhadoEm ? e.encaminhadoEm : e.criadoEm)}</td>
            <td role="cell" data-label="Status">${badge(e.status)}</td>
            ${passwordLogin ? `<td role="cell" data-label="Leitura">${readStatus}</td>` : ""}
            <td role="cell" class="table-actions"><button class="text-link action-icon" onclick="navigate('depe','${e.id}')">Ver detalhes ${icon("arrow")}</button></td>
          </tr>`;
          })
          .join(""),
      )
    : emptyState("Nenhum encaminhamento encontrado com estes filtros.");
  if (only) {
    $("#ref-results").innerHTML = list;
    return;
  }
  $("#content").innerHTML =
    heading(
      "ACOMPANHAMENTO",
      passwordLogin && user.perfil === "DEP"
        ? "Fila do DEPE"
        : "Encaminhamentos ao DEPE",
      `Casos no ano letivo de ${year}.`,
      passwordLogin
        ? `<button class="action-icon" id="refresh-referrals">${icon("refresh")} Atualizar</button>`
        : "",
    ) +
    `<div class="tabs" role="group" aria-label="Situação do encaminhamento">${(depeOnly ? ["ENCAMINHADO", "CONCLUIDO", ""] : ["PENDENTE", "ENCAMINHADO", "CONCLUIDO", ""]).map((s) => `<button class="${statusFilter === s ? "active" : ""}" aria-pressed="${statusFilter === s}" data-status="${s}">${depeOnly && s === "ENCAMINHADO" ? "Abertos" : depeOnly && s === "CONCLUIDO" ? "Encerrados" : labels[s] || "Todos"} <span class="badge">${db.Encaminhamentos.filter((e) => +e.anoLetivo === year && (!s || e.status === s)).length}</span></button>`).join("")}</div>` +
    filters() +
    `<section class="panel" id="ref-results">${list}</section>${depeOnly ? "" : '<div class="note">Emitir um documento não altera o status. Registre o encaminhamento após realizar o envio ao DEPE.</div>'}`;
  filterEvents(depe);
  if ($("#refresh-referrals"))
    $("#refresh-referrals").onclick = async () => {
      try {
        await service.refresh();
        if (page === "depe") depe();
      } catch (error) {
        toast(error.message, "error");
      }
    };
  document.querySelectorAll("[data-status]").forEach(
    (b) =>
      (b.onclick = () => {
        statusFilter = b.dataset.status;
        depe();
        $(`[data-status="${statusFilter}"]`)?.focus({ preventScroll: true });
      }),
  );
}
function referralDetail() {
  const r = db.Encaminhamentos.find((e) => e.id === selected);
  if (!r) {
    selected = "";
    depe();
    return;
  }
  const snap = JSON.parse(r.snapshotJson);
  const confirmReading =
    can("confirmReading") && r.status !== "PENDENTE" && !r.lidoEm;
  $("#content").innerHTML =
    heading(
      "ENCAMINHAMENTO AO DEPE",
      esc(snap.aluno.nome),
      `${esc(snap.aluno.matricula)} · ${esc(snap.aluno.turma)} · Ano letivo ${r.anoLetivo}`,
      `<button class="action-icon" onclick="navigate('depe')">${icon("back")} Voltar para encaminhamentos</button>`,
    ) +
    `<div class="grid"><section class="panel"><div class="panel-head"><h2>Três abordagens vinculadas</h2>${badge(r.status)}</div><div class="panel-body">${historyHTML(snap.ocorrencias)}</div></section><div><section class="panel"><div class="panel-body"><h2>Documento e acompanhamento</h2><p>O relatório enviado preserva a versão registrada no momento do envio.</p><div class="actions referral-actions"><button class="action-icon" onclick="navigate('document','${r.id}')">${icon("depe")} Visualizar documento</button>${live ? `<button class="action-icon" id="pdf-download">${icon("download")} Baixar PDF</button>` : ""}${confirmReading ? `<button class="action-icon" id="confirm-reading">${icon("read")} Confirmar leitura</button>` : ""}
    ${r.status === "PENDENTE" && can("send") ? `<button class="primary action-icon" id="transition">${icon("send")} Registrar encaminhamento</button>` : r.status === "ENCAMINHADO" && can("complete") ? `<button class="primary action-icon" id="transition">${icon("finish")} ${passwordLogin ? "Encerrar caso" : "Concluir atendimento"}</button>` : ""}</div>${r.encaminhadoEm ? `<p>Encaminhado em ${dt(r.encaminhadoEm)}<br>${esc(r.observacaoEncaminhamento)}</p>` : ""}${passwordLogin && r.lidoEm ? `<p>Leitura confirmada em ${dt(r.lidoEm)} por ${esc(r.lidoPorNome)}</p>` : ""}${r.concluidoEm ? `<p>${passwordLogin ? "Encerrado" : "Concluído"} em ${dt(r.concluidoEm)}${r.concluidoPorNome ? ` por ${esc(r.concluidoPorNome)}` : ""}<br>${esc(r.observacaoConclusao)}</p>` : ""}</div></section><div class="note">A conclusão mantém as três ocorrências no histórico do ano letivo.</div></div></div>`;
  if ($("#transition")) $("#transition").onclick = () => transition(r);
  $("#confirm-reading")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await service.mutate("confirmarLeituraDepe", {
        id: r.id,
        chaveIdempotencia: uid(),
      });
      await service.refresh();
      render();
      toast("Leitura confirmada.");
    } catch (error) {
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  });
  if ($("#pdf-download")) $("#pdf-download").onclick = () => pdf(r.id);
}
function transition(r) {
  const send = r.status === "PENDENTE",
    key = uid();
  modal(
    `<h2>${send ? "Registrar encaminhamento" : passwordLogin ? "Encerrar caso" : "Concluir atendimento"}</h2><p>${send ? "Confirme que o encaminhamento foi realizado." : "Confirme a conclusão do atendimento no DEPE."} A data e o responsável serão registrados agora.</p><form><label class="field">Observação <textarea name="observacao" maxlength="2000"></textarea></label><div id="modal-error" role="alert"></div><div class="actions"><button type="button" data-close>Cancelar</button><button class="primary">Confirmar ${send ? "encaminhamento" : passwordLogin ? "encerramento" : "conclusão"}</button></div></form>`,
    async (e) => {
      e.preventDefault();
      const b = e.target.querySelector(".primary");
      b.disabled = true;
      try {
        await service.mutate(
          send ? "registrarEncaminhamento" : "concluirEncaminhamento",
          {
            id: r.id,
            observacao: new FormData(e.target).get("observacao"),
            versaoEsperada: r.versao,
            chaveIdempotencia: key,
          },
        );
        await service.refresh();
        $("#modal").close();
        render();
        toast("Status atualizado. O histórico foi preservado.");
      } catch (err) {
        $("#modal-error").innerHTML =
          `<div class="error">${esc(err.message)}</div>`;
      } finally {
        b.disabled = false;
      }
    },
  );
}
function docHTML(r, snap) {
  return `<div class="document"><div class="eyebrow">INSTITUTO FEDERAL DO AMAZONAS</div><h2>${IFAM.CAMPUS_NAME}</h2><hr><h1>Encaminhamento ao DEPE</h1><p>Identificador: ${esc(r.id)}<br>Ano letivo: ${r.anoLetivo}</p><h3>Identificação do estudante</h3><p><strong>${esc(snap.aluno.nome)}</strong><br>Matrícula: ${esc(snap.aluno.matricula)}<br>Curso: ${esc(snap.aluno.curso)} · Turma: ${esc(snap.aluno.turma)}</p><p>O estudante atingiu três ocorrências no ano letivo indicado. Seguem os registros que motivaram este encaminhamento para acompanhamento pelo DEPE.</p>${snap.ocorrencias.map((o, i) => `<article><h3>${i + 1}. Abordagem de ${dt(o.dataHoraAbordagem)}</h3><p>${occurrenceDescription(JSON.parse(o.irregularidadesJson), o.tituloPersonalizado, "; ")}.</p><p>Observação: ${esc(o.observacao || "Sem observação.")}<br>Assistente: ${esc(o.assistenteNome)}</p></article>`).join("")}<p>Emitido em ${dt(new Date().toISOString())} por ${esc(user.nome)}.</p><div class="signature">________________________________________<br>Assinatura do responsável</div>${demoMode ? "<p>Documento demonstrativo · dados fictícios.</p>" : ""}</div>`;
}
async function documentView() {
  const r = db.Encaminhamentos.find((e) => e.id === selected);
  const attempt = navigation;
  if (!r) return;
  $("#content").innerHTML = loadingState("Preparando documento…");
  try {
    const data = live
      ? await rpc("obterDadosDocumento", { encaminhamentoId: r.id })
      : { snapshot: JSON.parse(r.snapshotJson) };
    if (attempt !== navigation) return;
    $("#content").innerHTML =
      heading(
        "DOCUMENTO",
        "Encaminhamento ao DEPE",
        "A emissão não altera o status do encaminhamento.",
        `<button class="action-icon" onclick="navigate('depe','${r.id}')">${icon("back")} Voltar</button>`,
      ) +
      `<div class="actions document-actions no-print">${live ? `<button class="primary action-icon" id="pdf-download">${icon("download")} Baixar PDF</button>` : ""}<button class="action-icon" id="print">${icon("print")} Imprimir / Salvar como PDF</button></div>` +
      docHTML(r, data.snapshot);
    $("#print").onclick = () => window.print();
    if ($("#pdf-download")) $("#pdf-download").onclick = () => pdf(r.id);
  } catch (e) {
    if (attempt !== navigation) return;
    $("#content").innerHTML =
      `<div class="error" role="alert">${esc(e.message)}</div>`;
  }
}
async function pdf(id) {
  const b = $("#pdf-download");
  b.disabled = true;
  try {
    const d = await rpc("gerarPdfEncaminhamento", {
      encaminhamentoId: id,
      chaveIdempotencia: uid(),
    });
    const bytes = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0)),
      url = URL.createObjectURL(new Blob([bytes], { type: d.mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = d.nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (e) {
    toast(e.message, "error");
  } finally {
    b.disabled = false;
  }
}
function dateEvents(fn) {
  $("#from").onchange = (e) => {
    from = e.target.value;
    fn();
  };
  $("#to").onchange = (e) => {
    to = e.target.value;
    fn();
  };
}
function reportBreakdown(items) {
  const max = Math.max(1, ...items.map(([, count]) => count));
  return `<ul class="report-breakdown">${items
    .map(
      ([label, count]) =>
        `<li><div><span>${esc(label)}</span><strong>${count}</strong></div><div class="report-track" aria-hidden="true"><span style="--share:${(count / max) * 100}%"></span></div></li>`,
    )
    .join("")}</ul>`;
}

const reportMonths = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  timeZone: "UTC",
});
function monthLabel(month) {
  const date = new Date(month + "-01T12:00:00Z");
  return `${reportMonths.format(date).replace(".", "")}/${month.slice(2, 4)}`;
}
function monthlyChart(months) {
  const max = Math.max(1, ...months.map(([, count]) => count));
  return `<ol class="report-timeline">${months
    .map(
      ([month, count]) =>
        `<li><div class="report-column"><strong>${count}</strong><span aria-hidden="true" style="--share:${(count / max) * 100}%"></span></div><span>${esc(monthLabel(month))}</span></li>`,
    )
    .join("")}</ol>`;
}
function downloadReport(rows) {
  const cell = (value) => {
    const raw = String(value);
    const literal =
      typeof value === "string" && /^[\s\uFEFF]*[=+@-]/.test(raw)
        ? "'" + raw
        : raw;
    return '"' + literal.replace(/"/g, '""') + '"';
  };
  const csv = rows.map((row) => row.map(cell).join(";")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `adam-relatorio-${year}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reports() {
  const periodInvalid = from && to && from > to;
  const dayFormat = new Intl.DateTimeFormat("sv-SE", {
    timeZone: config.fusoHorario,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (date) => dayFormat.format(new Date(date));
  const os = periodInvalid ? [] : filteredOccurrences(day);
  const refs = periodInvalid
    ? []
    : db.Encaminhamentos.filter((e) => {
        const cadastro = student(e.alunoId);
        return (
          +e.anoLetivo === year &&
          (!course || cadastro?.curso === course) &&
          (!classroom || cadastro?.turma === classroom) &&
          (!room || roomFor(cadastro) === room) &&
          (!from || day(e.criadoEm) >= from) &&
          (!to || day(e.criadoEm) <= to)
        );
      });

  const ids = new Set(),
    courses = new Map(),
    monthCounts = new Map();
  const types = new Map(availableTypes().map((type) => [type, 0]));
  for (let number = 1; number <= 12; number++) {
    const month = `${year}-${String(number).padStart(2, "0")}`;
    if (
      (!from || month >= from.slice(0, 7)) &&
      (!to || month <= to.slice(0, 7))
    )
      monthCounts.set(month, 0);
  }
  for (const occurrence of os) {
    ids.add(occurrence.alunoId);
    const month = day(occurrence.dataHoraAbordagem).slice(0, 7);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    const name = student(occurrence.alunoId)?.curso || "Curso não informado";
    courses.set(name, (courses.get(name) ?? 0) + 1);
    for (const type of new Set(JSON.parse(occurrence.irregularidadesJson))) {
      if (types.has(type)) types.set(type, types.get(type) + 1);
    }
  }
  const months = [...monthCounts].sort(([a], [b]) => a.localeCompare(b));
  const byCourse = [...courses].sort(
    ([a, av], [b, bv]) => bv - av || a.localeCompare(b, "pt-BR"),
  );
  const byType = [...types].map(([type, count]) => [
    type === "ATRASO" ? "Atrasos" : IFAM.describeType(type),
    count,
  ]);
  const states = {
    PENDENTE: "Aguardando envio",
    ENCAMINHADO: "Encaminhados",
    CONCLUIDO: "Concluídos",
  };
  const pending = periodInvalid
    ? 0
    : (db.PendenciasPorRecorte || [])
        .filter(
          (r) =>
            r.anoLetivo === year &&
            (!course || r.curso === course) &&
            (!classroom || r.turma === classroom) &&
            (!room || roomFor(r) === room) &&
            (!(from || to) || r.dia) &&
            (!from || r.dia >= from) &&
            (!to || r.dia <= to),
        )
        .reduce((count, r) => count + r.total, 0);
  const byState = Object.entries(states).map(([state, label]) => [
    label,
    refs.filter((r) => r.status === state).length +
      (state === "PENDENTE" ? pending : 0),
  ]);
  const referralTotal = refs.length + pending;
  const totals = [
    [os.length, "Abordagens", "Uma por registro", "depe"],
    [ids.size, "Alunos envolvidos", "Alunos distintos no período", "students"],
    [referralTotal, "Encaminhamentos", "Pela data de criação do caso", "arrow"],
    [
      byState[2][1],
      "Concluídos",
      "Entre os encaminhamentos filtrados",
      "check",
    ],
  ];

  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(os.length / pageSize));
  reportPage = Math.min(reportPage, pageCount);
  const start = (reportPage - 1) * pageSize;
  const hasFilters = from || to || course || classroom || room || typeFilter;
  const exportable = !periodInvalid && (os.length || referralTotal);
  $("#content").innerHTML =
    heading(
      "ANÁLISE DO ANO LETIVO",
      "Relatórios",
      `Ocorrências e encaminhamentos de ${year}.`,
      `<button class="primary action-icon" id="export-report" ${exportable ? "" : "disabled"}>${icon("download")} Baixar resumo CSV</button>`,
    ) +
    `<div class="filterbar report-filters">
      <label class="field">De<input type="date" id="from" value="${from}"></label>
      <label class="field">Até<input type="date" id="to" value="${to}"></label>
      <select id="course" aria-label="Curso">${options("curso", course)}</select>
      <select id="classroom" aria-label="Turma">${options("turma", classroom)}</select>
      ${roomFilter()}
      <select id="type" aria-label="Tipo de ocorrência"><option value="">Todos os tipos</option>${availableTypes()
        .map(
          (t) =>
            `<option value="${t}" ${typeFilter === t ? "selected" : ""}>${labels[t]}</option>`,
        )
        .join("")}</select>
      <button id="clear-report-filters" ${hasFilters ? "" : "disabled"}>Limpar filtros</button>
    </div>` +
    (periodInvalid
      ? '<p class="error" role="alert">A data inicial deve ser anterior ou igual à data final.</p>'
      : stats(totals) +
        `<section class="panel"><div class="panel-head"><div><h2>Abordagens por mês</h2><p>Datas no fuso ${esc(config.fusoHorario)}</p></div></div>
      <div class="panel-body">${os.length ? monthlyChart(months) : '<p class="empty">Nenhuma abordagem no recorte selecionado.</p>'}</div></section>
    <div class="report-grid">
      <section class="panel"><div class="panel-head"><h2>Irregularidades por tipo</h2></div>
        <div class="panel-body">${reportBreakdown(byType)}<p>Uma abordagem pode contar em mais de um tipo.</p></div></section>
      <section class="panel"><div class="panel-head"><h2>Abordagens por curso</h2></div>
        <div class="panel-body">${byCourse.length ? reportBreakdown(byCourse) : '<p class="empty">Sem abordagens para comparar.</p>'}</div></section>
      <section class="panel"><div class="panel-head"><h2>Situação dos encaminhamentos</h2></div>
        <div class="panel-body">${reportBreakdown(byState)}<p>Considera ano, período, curso, turma e sala. O filtro de tipo vale para as abordagens.</p></div></section>
    </div>
    ${
      user.perfil === "DEP" && passwordLogin
        ? ""
        : `<section class="panel"><div class="panel-head"><h2>Registros do período</h2><span class="badge">${os.length} registros</span></div>
      ${occurrenceTable(os.slice(start, start + pageSize))}
      ${pageCount > 1 ? `<div class="report-pagination"><button id="report-prev" ${reportPage === 1 ? "disabled" : ""}>Anterior</button><span aria-live="polite">Página ${reportPage} de ${pageCount}</span><button id="report-next" ${reportPage === pageCount ? "disabled" : ""}>Próxima</button></div>` : ""}
    </section>`
    }`);

  const applyFilters = () => {
    const focused = document.activeElement.id;
    reportPage = 1;
    reports();
    const control = document.getElementById(focused);
    if (control) (control.disabled ? $("#from") : control).focus();
  };
  dateEvents(applyFilters);
  $("#course").onchange = (e) => {
    course = e.target.value;
    applyFilters();
  };
  $("#classroom").onchange = (e) => {
    classroom = e.target.value;
    applyFilters();
  };
  $("#room")?.addEventListener("change", (e) => {
    room = e.target.value;
    applyFilters();
  });
  $("#type").onchange = (e) => {
    typeFilter = e.target.value;
    applyFilters();
  };
  $("#clear-report-filters").onclick = () => {
    from = to = course = classroom = room = typeFilter = "";
    applyFilters();
  };
  for (const [selector, step] of [
    ["#report-prev", -1],
    ["#report-next", 1],
  ]) {
    const button = $(selector);
    if (button)
      button.onclick = () => {
        reportPage += step;
        reports();
        ($(selector).disabled
          ? $(step === 1 ? "#report-prev" : "#report-next")
          : $(selector)
        ).focus();
      };
  }
  if (exportable)
    $("#export-report").onclick = () =>
      downloadReport([
        ["Seção", "Indicador", "Valor"],
        ["Filtros", "Ano letivo", year],
        ["Filtros", "Data inicial", from || "Sem limite"],
        ["Filtros", "Data final", to || "Sem limite"],
        ["Filtros", "Curso", course || "Todos"],
        ["Filtros", "Turma", classroom || "Todas"],
        ...(db.CatalogoAcademico ? [["Filtros", "Sala", room || "Todas"]] : []),
        ["Filtros", "Tipo de ocorrência", labels[typeFilter] || "Todos"],
        ...totals.map(([count, label]) => ["Resumo", label, count]),
        ...months.map(([month, count]) => ["Abordagens por mês", month, count]),
        ...byType.map(([label, count]) => [
          "Irregularidades por tipo",
          label,
          count,
        ]),
        ...byCourse.map(([label, count]) => [
          "Abordagens por curso",
          label,
          count,
        ]),
        ...byState.map(([label, count]) => [
          "Situação dos encaminhamentos",
          label,
          count,
        ]),
      ]);
}
function settings() {
  $("#content").innerHTML =
    heading("INFORMAÇÕES", "Sobre o ADAM", "Ocorrências Estudantis · IFAM") +
    `<section class="panel"><div class="panel-body"><h2>${demoMode ? "Demonstração interativa" : "Ambiente institucional"}</h2><p>${demoMode ? "Somente dados fictícios, compartilhados em memória no servidor e reiniciados quando ele é encerrado." : passwordLogin ? "Registros armazenados no PostgreSQL do Supabase. Permissões verificadas pelo servidor." : "Registros armazenados no Google Sheets. Identidade e permissões verificadas pelo servidor."}</p><h3>Configuração institucional</h3><p>Campus: ${IFAM.CAMPUS_NAME}<br>Ano ativo: ${config.anoLetivoAtivo}<br>Fuso: ${esc(config.fusoHorario)}</p><h3>Regras do acompanhamento</h3><p>Cada abordagem conta uma vez. A terceira ocorrência do ano cria uma pendência no DEPE. Emitir o documento não encaminha automaticamente. Concluir atendimento mantém o histórico.</p><p>A política para registros após três ocorrências depende de definição institucional.</p></div></section>`;
}
window.addEventListener("beforeunload", (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});
boot();

async function boot() {
  try {
    const r = await fetch("/api/config");
    if (!r.ok) throw new Error("Servidor indisponível.");
    const modes = await r.json();
    demoMode = modes.demo === true;
    passwordLogin = modes.passwordLogin === true;
    customOccurrences = modes.ocorrenciasPersonalizadas === true;
    await service.load();
    enterPortal();
  } catch (e) {
    login(e.code === "UNAUTHENTICATED" ? "" : e.message);
  }
  if (new URLSearchParams(location.search).get("login") === "failed") {
    login(
      "Não foi possível autorizar esta conta. Confira seu cadastro com o administrador.",
    );
    history.replaceState(null, "", "/");
  }
}
