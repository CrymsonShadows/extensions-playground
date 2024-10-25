chrome.runtime.onInstalled.addListener(async () => {
  chrome.action.setBadgeText({
    text: await getNumTabs(),
  });
});

const queryOptions = { windowId: chrome.windows.WINDOW_ID_CURRENT };

async function getNumTabs() {
  const tabs = await chrome.tabs.query(queryOptions);
  return tabs.length.toString();
}

chrome.windows.onFocusChanged.addListener(async () => {
  chrome.action.setBadgeText({
    text: await getNumTabs(),
  });
});

chrome.tabs.onCreated.addListener(async () => {
  chrome.action.setBadgeText({
    text: await getNumTabs(),
  });
});

chrome.tabs.onUpdated.addListener(async () => {
  chrome.action.setBadgeText({
    text: await getNumTabs(),
  });
});

chrome.tabs.onRemoved.addListener(async () => {
  chrome.action.setBadgeText({
    text: await getNumTabs(),
  });
});
