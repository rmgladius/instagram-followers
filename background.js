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
