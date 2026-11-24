chrome.action.onClicked.addListener(async (tab) => {
  let isInstagram = false;
  try {
    isInstagram = new URL(tab.url).origin === "https://www.instagram.com";
  } catch {
    // A aba pode não oferecer um endereço para a extensão.
  }

  if (!isInstagram) {
    await chrome.tabs.create({url: "https://www.instagram.com/"});
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: {tabId: tab.id},
      files: ["panel.js"]
    });
  } catch (error) {
    console.error("Falha ao abrir o painel", error);
    await chrome.action.setBadgeText({tabId: tab.id, text: "!"});
  }
});


const runKey = (tabId) => `run:${tabId}`;
const resultKey = (tabId) => `analysis:${tabId}`;
const session = chrome.storage.session;

async function readRun(tabId) {
  const key = runKey(tabId);
  return (await session.get(key))[key];
}

async function finish(run, tabId, data) {
  await session.set({[resultKey(run.resultTabId)]: data});
  await session.remove(runKey(tabId));
  await chrome.tabs.update(run.resultTabId, {active: true});
}

async function handleAnalysis(message, sender) {
  const tabId = sender.tab.id;
  const key = runKey(tabId);
  const run = await readRun(tabId);

  if (message.type === "analysis-start") {
    if (run) throw new Error("Já há uma análise em andamento nesta aba.");
    const tab = await chrome.tabs.create({
      active: false, windowId: sender.tab.windowId, openerTabId: tabId,
      url: chrome.runtime.getURL("results.html")
    });
    try {
      await session.set({
        [key]: {resultTabId: tab.id, documentId: sender.documentId, user: message.user},
        [resultKey(tab.id)]: {phase: "Lendo seguidores… volte à aba do Instagram e mantenha-a aberta."}
      });
    } catch (error) {
      await chrome.tabs.remove(tab.id);
      throw error;
    }
    return {};
  }

  if (!run) return {idle: true};

  if (message.type === "analysis-resume") {
    if (run.documentId === sender.documentId) return {idle: true};
    if (!run.followers || message.user !== run.user) {
      await finish(run, tabId, {error: "O Instagram recarregou ou mudou de página antes de concluir a leitura. Abra seu perfil e inicie outra análise."});
      return {idle: true};
    }
    await session.set({[key]: {...run, documentId: sender.documentId}});
    return {followers: run.followers};
  }

  if (run.documentId !== sender.documentId) return {idle: true};
  switch (message.type) {
    case "analysis-followers":
      await session.set({
        [key]: {...run, followers: message.followers},
        [resultKey(run.resultTabId)]: {phase: "Seguidores lidos. Lendo quem você segue na aba do Instagram…"}
      });
      break;
    case "analysis-progress":
      await session.set({[resultKey(run.resultTabId)]: {phase: message.phase}});
      break;
    case "analysis-complete": {
      const following = message.following;
      const followers = new Set(run.followers);
      const accounts = following.filter((name) => !followers.has(name)).sort();
      await finish(run, tabId, {user: run.user, followers: followers.size, following: following.length, accounts});
      break;
    }
    case "analysis-error":
      await finish(run, tabId, {error: message.error});
      break;
    case "analysis-cancel":
      await session.remove(key);
      await session.set({[resultKey(run.resultTabId)]: {error: "Análise cancelada no painel do Instagram."}});
      break;
  }
  return {};
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message?.type?.startsWith("analysis-") || sender.frameId !== 0 ||
      !sender.url?.startsWith("https://www.instagram.com/") ||
      !Number.isInteger(sender.tab?.id)) return false;
  handleAnalysis(message, sender).then(respond, (error) => respond({error: error.message}));
  return true;
});

chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (change.status !== "complete") return;
  const run = await readRun(tabId);
  if (!run) return;
  try {
    await chrome.scripting.executeScript({target: {tabId}, files: ["panel.js"]});
  } catch {
    const pending = await readRun(tabId);
    if (pending) await finish(pending, tabId, {error: "O Chrome perdeu o acesso à aba do Instagram durante a análise."});
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const run = await readRun(tabId);
  if (run) await finish(run, tabId, {error: "A aba do Instagram foi fechada durante a análise."}).catch(console.error);
  const entries = await session.get(null);
  const keys = Object.keys(entries).filter((key) => key.startsWith("run:") && entries[key].resultTabId === tabId);
  await session.remove([resultKey(tabId), ...keys]);
});
