chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeText({
    text: "0",
  });
});

const queryOptions = { windowId: windows.WINDOW_ID_CURRENT };

async function getNumTabs() {
  const tabs = await chrome.tabs.query(queryOptions);
  return tabs.length;
}

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
