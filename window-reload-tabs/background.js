const queryOptions = { windowId: chrome.windows.WINDOW_ID_CURRENT };

async function reloadTabs() {
  const tabs = await chrome.tabs.query(queryOptions);
  for (const tab of tabs) {
    chrome.tabs.reload(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  chrome.action.setBadgeText({
    text: "🔄",
  });
});

chrome.action.onClicked.addListener(reloadTabs);
