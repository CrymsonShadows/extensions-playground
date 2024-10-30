let domains = new Map();
const queryOptions = { windowId: chrome.windows.WINDOW_ID_CURRENT };
// const tabs = await chrome.tabs.query(queryOptions);
const button = document.querySelector("button");
button.addEventListener("click", groupTabByDomain);

async function groupTabByDomain() {
  const tabs = await chrome.tabs.query(queryOptions);
  for (const tab of tabs) {
    let domain = new URL(tab.url).hostname;
    if (!domains.get(domain)) {
      domains.set(domain, [tab.id]);
      continue;
    }

    domains.get(domain).push(tab.id);
  }
  //   console.log(domains);
  for (let [domainName, tabIDs] of domains) {
    // console.log(`tabIDs of ${domainName}: ${tabIDs}`);
    if (tabIDs.length) {
      const groupID = await chrome.tabs.group({ tabIds: tabIDs });
      await chrome.tabGroups.update(groupID, {
        title: domainName,
        collapsed: true,
      });
    }
  }
}
