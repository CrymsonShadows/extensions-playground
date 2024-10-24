let domains = new Set();
const queryOptions = { windowId: windows.WINDOW_ID_CURRENT };
const tabs = await chrome.tabs.query(queryOptions);
const button = document.querySelector("button");
button.addEventListener("click", async () => {
  const tabIds = tabs.map(({ id }) => id);
  if (tabIds.length) {
    const group = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(group, { title: "DOCS" });
  }
});
