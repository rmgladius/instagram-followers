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
      header { display: flex; align-items: center; justify-content: space-between; gap: 12px }
      h2 { font-size: 18px; margin: 0 }
      p { margin: 12px 0; overflow-wrap: anywhere }
      button, a { font: inherit }
      button { cursor: pointer; border: 0; border-radius: 8px; padding: 8px 12px; }
      #start { background: #253d96; color: white; font-weight: 650; width: 100% }
      #start:disabled { cursor: default; opacity: .65 }
      #close { background: #edf0f6; color: #182032 }
      a { color: #253d96; white-space: nowrap }
      details { margin-top: 12px; border-top: 1px solid #e6e9ef; padding-top: 12px }
      summary { color: #253d96; cursor: pointer; font-weight: 650 }
      details p { margin: 8px 0 }
    </style>
    <section aria-label="Instagram Followers">
      <header><h2>Instagram Followers</h2><button id="close" aria-label="Fechar painel">×</button></header>
      <p id="status" role="status">Abra seu próprio perfil no Instagram e inicie a análise.</p>
      <button id="start">Analisar meu perfil</button>
      <details>
        <summary>Saiba mais</summary>
        <p>Com o seu perfil aberto, a extensão lê as listas de Seguidores e Seguindo e compara os nomes de usuário. Mantenha a aba aberta até terminar.</p>
        <p>A análise usa sua sessão atual e roda no navegador, sem pedir senha ou enviar suas listas a um servidor. O resultado abre em uma aba da extensão e é descartado ao fechar essa aba ou o Chrome.</p>
        <p>Se alguma lista não carregar por inteiro ou o Instagram exibir apenas um total abreviado, a extensão avisa e não mostra resultados parciais. Se a leitura parar, recarregue seu perfil e tente de novo.</p>
        <p>Para deixar de seguir alguém, abra o perfil pelo resultado e confirme a ação no próprio Instagram.</p>
        <a href="https://github.com/rmgladius/instagram-followers#saiba-mais" target="_blank" rel="noopener noreferrer">Ver documentação no GitHub</a>
      </details>
    </section>`;

  const get = (id) => shadow.getElementById(id);
  const status = get("status");
  const start = get("start");
  let controller;
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

  const followerWords = "seguidor(?:es)?|followers?";
  const followingWords = "seguindo|following";
  const countWords = new RegExp(`^(?:${followerWords}|${followingWords})\\s*|\\s*(?:${followerWords}|${followingWords})$`, "gi");

  function controlLabels(control) {
    return [control.getAttribute("aria-label"), control.innerText ?? control.textContent]
      .filter(Boolean).map((label) => label.trim());
  }

  function profileOnPage() {
    const path = location.pathname;
    const profileError = "Abra seu próprio perfil pelo menu Perfil do Instagram e tente novamente.";
    if (!profilePattern.test(path)) throw new Error(profileError);

    const user = pathName(path);
    const links = [...document.querySelectorAll("a[href]")].filter(isVisible);
    const controls = [...document.querySelectorAll('button, [role="button"], [role="link"], [tabindex="0"]')].filter(isVisible);
    const editProfile = links.some((link) => /^\/accounts\/edit\/?$/.test(localPath(link))) ||
      controls.some((control) => controlLabels(control).some((label) => /^(editar perfil|edit profile)$/i.test(label)));
    const ownNavigation = links.some((link) => {
      if (!profilePattern.test(localPath(link)) || pathName(localPath(link)) !== user) return false;
      const labels = [...controlLabels(link),
        ...[...link.querySelectorAll("[aria-label], svg title")].map(
          (node) => node.getAttribute("aria-label") || node.textContent
        )];
      return labels.some((label) => /^(perfil|profile)$/i.test(label.trim()));
    });
    if (!editProfile && !ownNavigation) throw new Error(profileError);

    function findList(kind, words) {
      const link = links.find((candidate) =>
        localPath(candidate).toLowerCase().replace(/\/$/, "") === `/${user}/${kind}`
      );
      if (link) return link;

      const labelPattern = new RegExp(`^(?:[\\d.,\\s]+(?:[kmb]|mil|mi|bi)?\\s*(?:${words})|(?:${words})\\s*[\\d.,\\s]+(?:[kmb]|mil|mi|bi)?)$`, "i");
      return controls.find((control) => controlLabels(control).some((label) => labelPattern.test(label)));
    }

    const followers = findList("followers", followerWords);
    const following = findList("following", followingWords);
    if (!followers || !following) {
      throw new Error("Seu perfil foi reconhecido, mas a extensão não encontrou os controles de Seguidores e Seguindo. Recarregue a página e tente novamente.");
    }
    return {user, followers, following};
  }

  function exactCount(control) {
    const titleValues = [control, ...control.querySelectorAll("[title]")].map(
      (node) => node.getAttribute("title")?.trim()
    );
    for (const value of [...titleValues, ...controlLabels(control)]) {
      const number = value?.replace(countWords, "").trim();
      if (!number || !/^(?:\d+|\d{1,3}(?:[.,\u00a0\u202f ]\d{3})+)$/.test(number)) continue;
      const count = Number(number.replace(/\D/g, ""));
      if (Number.isSafeInteger(count)) return count;
    }
    return null;
  }

  function currentDialog() {
    return [...document.querySelectorAll('[role="dialog"]')].filter(isVisible).at(-1);
  }

  function closeDialog(dialog) {
    if (!dialog?.isConnected) return;
    const labels = dialog.querySelectorAll("[aria-label], [title], svg title");
    for (const element of labels) {
      const label = element.getAttribute("aria-label") || element.getAttribute("title") ||
        element.textContent;
      if (!/^(close(?: dialog)?|fechar(?: janela)?)$/i.test(label.trim())) continue;
      const control = element.closest('button, [role="button"], [tabindex="0"]');
      const target = control || (element instanceof HTMLElement ? element : element.closest("svg")?.parentElement);
      if (!target || !dialog.contains(target) || !isVisible(target)) continue;
      target.click();
      return;
    }
  }

  function accountLinks(dialog) {
    return [...dialog.querySelectorAll("a[href]")].filter((anchor) => profilePattern.test(localPath(anchor)));
  }

  function accountRow(anchor, dialog, name) {
    const action = /^(seguindo|seguir|remover|following|follow(?: back)?|remove)$/i;
    for (let row = anchor.parentElement; row && row !== dialog; row = row.parentElement) {
      const profiles = accountLinks(row);
      if (profiles.some((link) => pathName(localPath(link)) !== name)) return false;
      const buttons = [...row.querySelectorAll('button, [role="button"]')];
      if (buttons.some((button) => button !== anchor && controlLabels(button).some((label) => action.test(label)))) {
        return true;
      }
    }
    return false;
  }

  function readAccounts(dialog, links, users) {
    for (const anchor of links) {
      const name = pathName(localPath(anchor));
      if (users.has(name)) continue;
      const labels = [...controlLabels(anchor), ...[...anchor.querySelectorAll("span[dir]")].map(
        (element) => element.textContent.trim()
      )];
      if (labels.some((label) => label.replace(/^@/, "").toLowerCase() === name) ||
          accountRow(anchor, dialog, name)) {
        users.add(name);
      }
    }
  }

  function findScroller(dialog, links) {
    const scrollable = (node) => node.clientHeight > 0 && node.scrollHeight > node.clientHeight + 2 &&
      /auto|scroll|overlay/.test(getComputedStyle(node).overflowY);
    const candidates = new Map();
    for (const link of links) {
      for (let node = link.parentElement; node && dialog.contains(node); node = node.parentElement) {
        if (scrollable(node)) candidates.set(node, (candidates.get(node) ?? 0) + 1);
      }
    }
    if (candidates.size) return [...candidates].sort((a, b) => b[1] - a[1])[0][0];
    return [dialog, ...dialog.querySelectorAll("div, section, ul")].find(scrollable);
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
    let furthestTop = -1;
    let retryAt = 4000;
    let lastHeight = -1;
    let lastProgress = performance.now();

    while (true) {
      signal.throwIfAborted();
      if (!dialog.isConnected || !isVisible(dialog)) {
        throw new Error(`A lista de ${label} foi fechada durante a leitura.`);
      }
      const links = accountLinks(dialog);
      readAccounts(dialog, links, users);
      status.textContent = `Lendo ${label}… ${users.size} de ${expected}.`;
      if (users.size === expected) break;
      if (users.size > expected) {
        throw new Error(`O total de ${label} mudou ou não corresponde à lista. Atualize seu perfil e tente de novo.`);
      }

      const scroller = findScroller(dialog, links);
      const top = scroller?.scrollTop ?? 0;
      const height = scroller?.scrollHeight ?? 0;
      if (users.size !== lastCount || top > furthestTop || height !== lastHeight) {
        lastProgress = performance.now();
        lastCount = users.size;
        furthestTop = height !== lastHeight ? top : Math.max(furthestTop, top);
        lastHeight = height;
        retryAt = 4000;
      }

      const idle = performance.now() - lastProgress;
      if (idle > 20000) {
        throw new Error(`Leitura incompleta de ${label} (${users.size} de ${expected}). O total exibido pelo Instagram não bateu com a lista que carregou.`);
      }
      if (scroller) {
        const step = Math.max(1, Math.floor(scroller.clientHeight / 2));
        const atBottom = top + scroller.clientHeight >= height - 2;
        if (atBottom && idle >= retryAt) {
          // Leave the bottom briefly so another scroll can trigger lazy loading.
          scroller.scrollBy({top: -step, behavior: "instant"});
          retryAt += 5000;
        } else if (!atBottom) {
          scroller.scrollBy({top: step, behavior: "instant"});
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 350));
    }

    return users;
  }

  async function send(type, data = {}) {
    const response = await chrome.runtime.sendMessage({type, ...data});
    if (!response || response.error) throw new Error(response?.error || "A extensão perdeu a comunicação com o Chrome.");
    if (response.idle && type !== "analysis-resume" && type !== "analysis-cancel") {
      throw new Error("A análise foi encerrada. Mantenha a aba de resultados aberta durante a leitura.");
    }
    return response;
  }

  async function analyze(profile, savedFollowers) {
    controller = new AbortController();
    const {signal} = controller;
    start.disabled = true;
    let running = savedFollowers !== undefined;
    try {
      if (!running) {
        await send("analysis-start", {user: profile.user});
        running = true;
      }
      if (signal.aborted) {
        await send("analysis-cancel");
        return;
      }
      if (savedFollowers === undefined) {
        const followers = await collect(profile.followers, "seguidores", signal);
        await send("analysis-followers", {followers: [...followers]});
        signal.throwIfAborted();
        const dialog = dialogToClose;
        if (dialog) {
          closeDialog(dialog);
          const closed = () => !dialog.isConnected || !isVisible(dialog);
          if (!(await waitFor(closed, signal, 2500))) {
            status.textContent = "Seguidores lidos. Feche a lista no Instagram para continuar automaticamente.";
            if (!(await waitFor(closed, signal, 45000))) {
              throw new Error("A lista de seguidores continuou aberta. Feche a janela do Instagram e tente novamente.");
            }
          }
          dialogToClose = null;
        }
      }

      const updatedProfile = profileOnPage();
      if (updatedProfile.user !== profile.user) throw new Error("O perfil mudou durante a análise.");
      const following = await collect(updatedProfile.following, "contas seguidas", signal);
      signal.throwIfAborted();
      status.textContent = "Listas completas. Calculando o resultado na aba da extensão…";
      await send("analysis-complete", {following: [...following]});
      status.textContent = "Análise concluída. Veja o resultado na outra aba.";
    } catch (error) {
      if (!signal.aborted) {
        status.textContent = error.message;
        if (running) await send("analysis-error", {error: error.message}).catch(() => {});
      }
    } finally {
      closeDialog(dialogToClose);
      dialogToClose = null;
      controller = null;
      start.disabled = false;
    }
  }

  start.addEventListener("click", () => {
    try {
      if (currentDialog()) throw new Error("Feche a janela aberta no Instagram e tente de novo.");
      void analyze(profileOnPage());
    } catch (error) {
      status.textContent = error.message;
    }
  });

  async function resumeInterruptedAnalysis() {
    const {followers} = await send("analysis-resume", {user: pathName(location.pathname)});
    if (!followers) return;
    start.disabled = true;
    status.textContent = "Seguidores recuperados. Aguardando o perfil carregar…";
    try {
      const signal = new AbortController().signal;
      const profile = await waitFor(() => {
        try {
          return !currentDialog() && profileOnPage();
        } catch {
          return null;
        }
      }, signal, 12000);
      if (!profile) throw new Error("O Instagram não voltou ao seu perfil após a leitura dos seguidores.");
      await analyze(profile, followers);
    } catch (error) {
      status.textContent = error.message;
      await send("analysis-error", {error: error.message});
    } finally {
      start.disabled = false;
    }
  }

  get("close").addEventListener("click", () => {
    controller?.abort();
    void send("analysis-cancel").catch(() => {});
    closeDialog(dialogToClose);
    host.remove();
  });
  document.body.append(host);
  void resumeInterruptedAnalysis().catch((error) => { status.textContent = error.message; });
})();
