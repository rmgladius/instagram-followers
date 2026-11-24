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

function isInstagramAnalysis(message, sender) {
  const result = message?.result;
  const username = /^[a-z0-9._]{1,30}$/i;
  return message?.type === "open-analysis-result" && sender.frameId === 0 &&
    sender.origin === "https://www.instagram.com" && Number.isInteger(sender.tab?.id) &&
    typeof result?.user === "string" && username.test(result.user) &&
    Number.isSafeInteger(result.followers) && result.followers >= 0 &&
    Number.isSafeInteger(result.following) && result.following >= 0 &&
    Array.isArray(result.accounts) && result.accounts.length <= result.following &&
    result.accounts.every((name) => typeof name === "string" && username.test(name));
}

async function openResult(result, sourceTab) {
  const tab = await chrome.tabs.create({active: false, windowId: sourceTab.windowId, openerTabId: sourceTab.id});
  const key = `analysis:${tab.id}`;
  try {
    await chrome.storage.session.set({[key]: result});
    await chrome.tabs.update(tab.id, {url: chrome.runtime.getURL("results.html"), active: true});
  } catch (error) {
    await Promise.allSettled([chrome.storage.session.remove(key), chrome.tabs.remove(tab.id)]);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!isInstagramAnalysis(message, sender)) return false;
  openResult(message.result, sender.tab).then(
    () => respond({opened: true}),
    (error) => {
      console.error("Falha ao abrir resultado", error);
      respond({opened: false});
    }
  );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`analysis:${tabId}`).catch(console.error);
});
