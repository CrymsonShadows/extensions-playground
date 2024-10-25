let numTabs = 0;

chrome.runtime.onInstalled.addListener(async () => {
  numTabs = await getNumTabs();
  chrome.action.setBadgeText({
    text: numTabs.toString(),
  });
});

const queryOptions = { windowId: chrome.windows.WINDOW_ID_CURRENT };

async function getNumTabs() {
  const tabs = await chrome.tabs.query(queryOptions);
  return tabs.length;
}

chrome.windows.onFocusChanged.addListener(async () => {
  numTabs = await getNumTabs();
  chrome.action.setBadgeText({
    text: numTabs.toString(),
  });
});

chrome.tabs.onCreated.addListener(async () => {
  chrome.action.setBadgeText({
    text: (++numTabs).toString(),
  });
});

// chrome.tabs.onUpdated.addListener(async () => {
//   chrome.action.setBadgeText({
//     text: await getNumTabs(),
//   });
// });

chrome.tabs.onRemoved.addListener(async () => {
  chrome.action.setBadgeText({
    text: (--numTabs).toString(),
  });
});
