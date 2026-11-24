(() => {
  const panelId = "instagram-followers-extension";
  if (document.getElementById(panelId)) return;

  const host = document.createElement("div");
  host.id = panelId;
  const shadow = host.attachShadow({mode: "closed"});
  shadow.innerHTML = `
    <style>
      :host { all: initial; position: fixed; z-index: 2147483647; top: 16px; right: 16px;
        width: min(360px, calc(100vw - 32px)); color: #182032; font: 14px/1.45 system-ui, sans-serif; }
      * { box-sizing: border-box }
      section { background: #fff; border: 1px solid #dbe1eb; border-radius: 16px; padding: 16px;
        box-shadow: 0 12px 40px #0d163330; max-height: calc(100vh - 32px); overflow: auto; }
      header, li { display: flex; align-items: center; justify-content: space-between; gap: 12px }
      h2 { font-size: 18px; margin: 0 }
      p { margin: 12px 0; overflow-wrap: anywhere }
      button, a { font: inherit }
      button { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 12px; }
      #start { background: #253d96; color: white; font-weight: 650; width: 100% }
      #start:disabled { cursor: default; opacity: .65 }
      #close { background: #edf0f6; color: #182032 }
      input { width: 100%; padding: 9px; font: inherit; border: 1px solid #8894aa; border-radius: 8px }
      ul { list-style: none; padding: 0; margin: 8px 0 0 }
      li { padding: 8px 0; border-bottom: 1px solid #e6e9ef }
      li span { overflow-wrap: anywhere }
      a { color: #253d96; white-space: nowrap }
      details { margin-top: 12px; border-top: 1px solid #e6e9ef; padding-top: 12px }
      summary { color: #253d96; cursor: pointer; font-weight: 650 }
      details p { margin: 8px 0 }
    </style>
    <section aria-label="Instagram Followers">
      <header><h2>Instagram Followers</h2><button id="close" aria-label="Fechar painel">×</button></header>
      <p id="status" role="status">Abra seu próprio perfil no Instagram e inicie a análise.</p>
      <button id="start">Analisar meu perfil</button>
      <div id="results" hidden>
        <p id="summary"></p>
        <input type="search" id="filter" placeholder="Buscar por @usuário" aria-label="Buscar por usuário">
        <p id="empty" hidden>Nenhum perfil corresponde à busca.</p>
        <ul id="list"></ul>
      </div>
      <details>
        <summary>Saiba mais</summary>
        <p>Com o seu perfil aberto, a extensão lê as listas de Seguidores e Seguindo e compara os nomes de usuário. Mantenha a aba aberta até terminar.</p>
        <p>A análise usa sua sessão atual e roda no navegador, sem pedir senha ou enviar suas listas a um servidor. O resultado é descartado ao fechar o painel ou recarregar a página.</p>
        <p>Se alguma lista não carregar por inteiro ou o Instagram exibir apenas um total abreviado, a extensão avisa e não mostra resultados parciais. Se a leitura parar, recarregue seu perfil e tente de novo.</p>
        <p>Para deixar de seguir alguém, abra o perfil pelo resultado e confirme a ação no próprio Instagram.</p>
        <a href="https://github.com/rmgladius/instagram-followers#saiba-mais" target="_blank" rel="noopener noreferrer">Ver documentação no GitHub</a>
      </details>
    </section>`;

  const get = (id) => shadow.getElementById(id);
  const status = get("status");
  const start = get("start");
  let controller;
  let accounts = [];
  let dialogToClose;
  const profilePattern = /^\/[a-z0-9._]{1,30}\/?$/i;

  function localPath(anchor) {
    const url = new URL(anchor.href, location.href);
    return url.origin === location.origin ? url.pathname : "";
  }

  function pathName(path) {
    return path.replace(/^\/|\/$/g, "").toLowerCase();
  }

  function isVisible(element) {
    return element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === "visible";
  }

  function profileOnPage() {
    const path = location.pathname;
    if (!profilePattern.test(path)) return null;
    const user = pathName(path);
    const main = document.querySelector('main, [role="main"]');
    if (!main) return null;
    const profileLinks = [...main.querySelectorAll("a[href]")].filter(isVisible);
    const listLink = (kind) => profileLinks.find((link) =>
      localPath(link).toLowerCase().replace(/\/$/, "") === `/${user}/${kind}`
    );
    const followers = listLink("followers");
    const following = listLink("following");
    if (!followers || !following) return null;

    const ownNavigation = [...document.querySelectorAll("a[href]")]
      .filter((link) => !main.contains(link) && isVisible(link) && profilePattern.test(localPath(link)))
      .find((link) => {
        const labels = [link.getAttribute("aria-label"), link.textContent,
          ...[...link.querySelectorAll("[aria-label], img[alt], svg title")].map(
            (node) => node.getAttribute("aria-label") || node.getAttribute("alt") || node.textContent
          )];
        return labels.some((label) => /^(perfil|profile)$/i.test(label?.trim()) ||
          /profile picture|foto do perfil/i.test(label || ""));
      });
    const editProfile = profileLinks.some((link) => /^\/accounts\/edit\/?$/.test(localPath(link))) ||
      [...main.querySelectorAll('header button, header [role="button"]')].some((button) =>
        isVisible(button) && /^(editar perfil|edit profile)$/i.test(button.textContent.trim())
      );
    if (!editProfile && (!ownNavigation || pathName(localPath(ownNavigation)) !== user)) return null;
    return {user, followers, following};
  }

  function exactCount(link) {
    const titleValues = [link, ...link.querySelectorAll("[title]")].map(
      (node) => node.getAttribute("title")?.trim()
    );
    const countWords = /^(?:seguidor(?:es)?|seguindo|followers?|following)\s*|\s*(?:seguidor(?:es)?|seguindo|followers?|following)$/gi;
    const visibleCount = link.textContent.trim().replace(countWords, "");
    for (const value of [...titleValues, visibleCount]) {
      if (!value || !/^(?:\d+|\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+)$/.test(value)) continue;
      const count = Number(value.replace(/\D/g, ""));
      if (Number.isSafeInteger(count)) return count;
    }
    return null;
  }

  function currentDialog() {
    return [...document.querySelectorAll('[role="dialog"]')].filter(isVisible).at(-1);
  }

  function closeDialog(dialog) {
    if (!dialog?.isConnected) return;
    const controls = [...dialog.querySelectorAll('button, [role="button"]')];
    const close = controls.find((control) => {
      const label = control.getAttribute("aria-label") ||
        control.querySelector("[aria-label]")?.getAttribute("aria-label") ||
        control.querySelector("svg title")?.textContent;
      return /^(close|fechar)$/i.test(label?.trim());
    });
    close?.click();
  }

  function readAccounts(dialog, users) {
    for (const anchor of dialog.querySelectorAll("a[href]")) {
      const path = localPath(anchor);
      if (!profilePattern.test(path)) continue;
      const name = pathName(path);
      if (anchor.textContent.trim().replace(/^@/, "").toLowerCase() === name) users.add(name);
    }
  }

  function findScroller(dialog) {
    return [dialog, ...dialog.querySelectorAll("div, section, ul")].find((node) =>
      node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 2 &&
      /auto|scroll|overlay/.test(getComputedStyle(node).overflowY)
    );
  }

  async function waitFor(check, signal, timeout = 9000) {
    const deadline = performance.now() + timeout;
    do {
      signal.throwIfAborted();
      const result = check();
      if (result) return result;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (performance.now() < deadline);
    return null;
  }

  async function collect(link, label, signal) {
    const expected = exactCount(link);
    if (expected === null) {
      throw new Error(`O Instagram não mostrou o total exato de ${label}. Abra o perfil no navegador e tente novamente quando o total estiver disponível.`);
    }
    if (expected === 0) return new Set();

    link.click();
    const dialog = await waitFor(currentDialog, signal);
    if (!dialog) throw new Error(`O Instagram não abriu a lista de ${label}.`);
    dialogToClose = dialog;
    const users = new Set();
    let lastCount = -1;
    let lastTop = -1;
    let lastHeight = -1;
    let lastProgress = performance.now();

    while (true) {
      signal.throwIfAborted();
      if (!dialog.isConnected || !isVisible(dialog)) {
        throw new Error(`A lista de ${label} foi fechada durante a leitura.`);
      }
      readAccounts(dialog, users);
      status.textContent = `Lendo ${label}… ${users.size} de ${expected}.`;
      if (users.size === expected) break;
      if (users.size > expected) {
        throw new Error(`O total de ${label} mudou ou não corresponde à lista. Atualize seu perfil e tente de novo.`);
      }

      const scroller = findScroller(dialog);
      const top = scroller?.scrollTop ?? 0;
      const height = scroller?.scrollHeight ?? 0;
      if (users.size !== lastCount || top !== lastTop || height !== lastHeight) {
        lastProgress = performance.now();
        lastCount = users.size;
        lastTop = top;
        lastHeight = height;
      } else if (performance.now() - lastProgress > 12000) {
        throw new Error(`Leitura incompleta de ${label} (${users.size} de ${expected}). Tente novamente com a aba do Instagram aberta.`);
      }
      scroller?.scrollBy({top: Math.max(1, Math.floor(scroller.clientHeight / 2)), behavior: "instant"});
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    closeDialog(dialog);
    if (!(await waitFor(() => !dialog.isConnected || !isVisible(dialog), signal, 2500))) {
      throw new Error("Feche a lista do Instagram e inicie a análise novamente.");
    }
    dialogToClose = null;
    return users;
  }

  function render() {
    const term = get("filter").value.trim().replace(/^@/, "").toLowerCase();
    const matches = accounts.filter((name) => name.includes(term));
    get("empty").hidden = matches.length > 0 || !term;
    const rows = document.createDocumentFragment();
    for (const name of matches) {
      const row = document.createElement("li");
      const username = document.createElement("span");
      username.textContent = `@${name}`;
      const link = document.createElement("a");
      link.href = new URL(`/${name}/`, location.origin).href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir perfil";
      link.setAttribute("aria-label", `Abrir perfil de @${name} no Instagram`);
      row.append(username, link);
      rows.append(row);
    }
    get("list").replaceChildren(rows);
  }

  start.addEventListener("click", async () => {
    get("results").hidden = true;
    const profile = profileOnPage();
    if (!profile) {
      status.textContent = "Abra seu próprio perfil pelo menu Perfil do Instagram. Se a página recarregar, clique novamente no ícone da extensão.";
      return;
    }
    if (currentDialog()) {
      status.textContent = "Feche a janela aberta no Instagram e tente de novo.";
      return;
    }

    controller = new AbortController();
    const {signal} = controller;
    start.disabled = true;
    status.textContent = `Analisando @${profile.user}… mantenha esta aba aberta.`;
    try {
      const followers = await collect(profile.followers, "seguidores", signal);
      const followingLink = profileOnPage()?.following;
      if (!followingLink) throw new Error("Volte ao seu perfil para analisar novamente.");
      const following = await collect(followingLink, "contas seguidas", signal);
      signal.throwIfAborted();
      accounts = [...following].filter((name) => !followers.has(name)).sort();
      status.textContent = `@${profile.user} · ${followers.size} seguidores · ${following.size} seguindo`;
      get("summary").textContent = accounts.length === 0
        ? "Todas as contas que você segue seguem você de volta."
        : `${accounts.length} ${accounts.length === 1 ? "perfil não segue" : "perfis não seguem"} você de volta. Abra o perfil para deixar de seguir no Instagram.`;
      get("filter").value = "";
      get("filter").hidden = accounts.length === 0;
      render();
      get("results").hidden = false;
    } catch (error) {
      if (!signal.aborted) status.textContent = error.message;
    } finally {
      closeDialog(dialogToClose);
      dialogToClose = null;
      controller = null;
      start.disabled = false;
    }
  });

  get("filter").addEventListener("input", render);
  get("close").addEventListener("click", () => {
    controller?.abort();
    closeDialog(dialogToClose);
    host.remove();
  });
  document.body.append(host);
})();
