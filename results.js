const get = (id) => document.getElementById(id);

function renderResult(result) {
  if (result.error || result.phase) {
    get("results").hidden = true;
    get("status").textContent = result.error || result.phase;
    return;
  }

  const {user, followers, following, accounts} = result;
  get("status").textContent = `@${user} · ${followers} seguidores · ${following} seguindo`;
  get("summary").textContent = accounts.length === 0
    ? "Todas as contas que você segue seguem você de volta."
    : `${accounts.length} ${accounts.length === 1 ? "perfil não segue" : "perfis não seguem"} você de volta. Abra o perfil para deixar de seguir no Instagram.`;

  const filter = get("filter");
  function render() {
    const query = filter.value.trim().replace(/^@/, "").toLowerCase();
    const matches = accounts.filter((name) => name.includes(query));
    const rows = document.createDocumentFragment();
    for (const name of matches) {
      const row = document.createElement("li");
      const username = document.createElement("span");
      username.textContent = `@${name}`;
      const link = document.createElement("a");
      link.href = new URL(`/${name}/`, "https://www.instagram.com").href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Abrir perfil";
      link.setAttribute("aria-label", `Abrir perfil de @${name} no Instagram`);
      row.append(username, link);
      rows.append(row);
    }
    get("list").replaceChildren(rows);
    get("empty").hidden = matches.length > 0;
  }

  filter.addEventListener("input", render);
  get("search").hidden = accounts.length === 0;
  render();
  get("results").hidden = false;
}

async function watchResult() {
  const tab = await chrome.tabs.getCurrent();
  const key = `analysis:${tab.id}`;
  let receivedUpdate = false;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "session" || !changes[key]) return;
    receivedUpdate = true;
    if (changes[key].newValue) renderResult(changes[key].newValue);
  });
  const {[key]: result} = await chrome.storage.session.get(key);
  if (!receivedUpdate && result) renderResult(result);
}

watchResult().catch((error) => {
  console.error(error);
  get("status").textContent = "Resultado indisponível. Volte ao seu perfil no Instagram e execute uma nova análise.";
});
