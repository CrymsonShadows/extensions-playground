// ui.js

// --- Element References --- (Get references needed for this module)
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const tabsHeader = document.querySelector(".tabs-header"); // Get the header for the main tab list
const tabList = document.getElementById("tab-list"); // Get the main tab list itself

// --- Action Tab Switching Logic ---
function handleTabClick(event) {
  const clickedButton = event.currentTarget;
  const targetPanelId = clickedButton.dataset.target;

  // Remove active class from all buttons and panels
  tabButtons.forEach((btn) => btn.classList.remove("active"));
  tabPanels.forEach((panel) => panel.classList.remove("active"));

  // Add active class to the clicked button and corresponding panel
  clickedButton.classList.add("active");
  const targetPanel = document.getElementById(targetPanelId);
  if (targetPanel) {
    targetPanel.classList.add("active");
  } else {
    console.error("Target panel not found:", targetPanelId);
  }

  // *** NEW: Show/Hide main tab list based on active action tab ***
  if (tabsHeader && tabList) {
    if (targetPanelId === "stash-settings") {
      // Hide the main tab list and its header if Stash is active
      tabsHeader.classList.add("hidden");
      tabList.classList.add("hidden");
    } else {
      // Show the main tab list and its header for other action tabs
      tabsHeader.classList.remove("hidden");
      tabList.classList.remove("hidden");
    }
  } else {
    console.error(
      "Could not find .tabs-header or #tab-list elements to hide/show."
    );
  }
}

export function setupActionTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", handleTabClick);
  });

  // Ensure the first tab is active on load and set initial visibility
  if (tabButtons.length > 0 && tabPanels.length > 0) {
    // Manually trigger the click handler for the first button
    // to ensure the correct initial state (including hiding/showing tab list)
    handleTabClick({ currentTarget: tabButtons[0] });
    // // Or, less ideally, set classes directly:
    // tabButtons[0].classList.add('active');
    // tabPanels[0].classList.add('active');
    // // Explicitly set initial visibility based on the first tab
    // if (tabsHeader && tabList) {
    //     if (tabButtons[0].dataset.target === "stash-settings") {
    //         tabsHeader.classList.add("hidden");
    //         tabList.classList.add("hidden");
    //     } else {
    //         tabsHeader.classList.remove("hidden");
    //         tabList.classList.remove("hidden");
    //     }
    // }
  }
}

// --- Fetch Title Logic --- (No changes needed here)
function waitForTabLoadComplete(tabId, targetUrl) {
  return new Promise((resolve, reject) => {
    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId === tabId) {
        if (changeInfo.status === "complete" && tab.url === targetUrl) {
          cleanupListener();
          resolve(tab);
        } else if (
          changeInfo.status === "complete" &&
          tab.url?.startsWith("chrome-extension://")
        ) {
          console.warn(
            `Tab ${tabId} completed loading but ended on extension URL: ${tab.url}`
          );
          cleanupListener();
          resolve(null);
        }
      }
    };
    const timeoutDuration = 15000;
    let timeoutId = setTimeout(() => {
      console.warn(
        `Timeout waiting for tab ${tabId} (${targetUrl}) to complete loading.`
      );
      cleanupListener();
      resolve(null);
    }, timeoutDuration);
    const cleanupListener = () => {
      chrome.tabs.onUpdated.removeListener(listener);
      clearTimeout(timeoutId);
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (currentTab) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error getting initial tab info:",
          chrome.runtime.lastError
        );
        cleanupListener();
        reject(chrome.runtime.lastError);
      } else if (
        currentTab &&
        currentTab.status === "complete" &&
        currentTab.url === targetUrl
      ) {
        cleanupListener();
        resolve(currentTab);
      }
    });
  });
}
export async function handleFetchTitleClick(event) {
  const button = event.currentTarget;
  const tabId = parseInt(button.dataset.tabId, 10);
  const originalUrl = button.dataset.originalUrl;
  const listItem = button.closest(".tab-item");
  const titleSpan = listItem?.querySelector(".tab-title");
  const checkbox = listItem?.querySelector('input[type="checkbox"]');
  if (isNaN(tabId) || !originalUrl || !listItem || !titleSpan || !checkbox) {
    console.error("Missing elements for fetch title button:", {
      tabId,
      originalUrl,
      listItem,
      titleSpan,
      checkbox,
    });
    return;
  }
  button.innerHTML = "...";
  button.disabled = true;
  button.classList.add("loading");
  console.log(`Attempting to unsuspend tab ${tabId} to URL: ${originalUrl}`);
  try {
    await chrome.tabs.update(tabId, { active: true, url: originalUrl });
    const finalTab = await waitForTabLoadComplete(tabId, originalUrl);
    if (finalTab && finalTab.title && finalTab.url === originalUrl) {
      console.log(
        `Successfully fetched title for tab ${tabId}: ${finalTab.title}`
      );
      titleSpan.textContent = finalTab.title;
      titleSpan.title = finalTab.title;
      checkbox.dataset.tabTitle = finalTab.title;
      button.remove();
    } else {
      console.warn(
        `Failed to fetch title for tab ${tabId}. Tab status:`,
        finalTab?.status,
        "URL:",
        finalTab?.url
      );
      button.innerHTML = "❓";
      button.title = "Failed to load title. Click to retry.";
      button.disabled = false;
      button.classList.remove("loading");
    }
  } catch (error) {
    console.error(`Error unsuspending/fetching title for tab ${tabId}:`, error);
    button.innerHTML = "🔄";
    button.title = "Error loading title. Click to retry.";
    button.disabled = false;
    button.classList.remove("loading");
  }
}
