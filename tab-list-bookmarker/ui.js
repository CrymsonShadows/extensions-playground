// ui.js

// --- Element References ---
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");
const mainTabListArea = document.querySelector(".main-tab-list-area"); // Wrapper for current tabs
const stashListArea = document.getElementById("stash-list-area"); // Get the new stash list wrapper

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

  // Determine if the stash tab is the target
  const isStashTabActive = targetPanelId === "stash-settings";

  // Show/Hide STASH list AREA
  if (stashListArea) {
    // Check if the stash wrapper exists
    if (isStashTabActive) {
      stashListArea.classList.remove("hidden");
    } else {
      stashListArea.classList.add("hidden");
    }
  } else {
    console.error("Could not find #stash-list-area element to hide/show.");
  }

  // Show/Hide MAIN tab list AREA
  if (mainTabListArea) {
    // Check if the main tab list wrapper exists
    if (isStashTabActive) {
      // Hide the main tab list area if Stash tab is active
      mainTabListArea.classList.add("hidden");
    } else {
      // Show the main tab list area for other action tabs
      mainTabListArea.classList.remove("hidden");
    }
  } else {
    console.error("Could not find .main-tab-list-area element to hide/show.");
  }
}

export function setupActionTabs() {
  tabButtons.forEach((button) => {
    button.addEventListener("click", handleTabClick);
  });

  // Ensure the first tab is active on load and set initial visibility
  if (
    tabButtons.length > 0 &&
    tabPanels.length > 0 &&
    stashListArea &&
    mainTabListArea
  ) {
    // Manually trigger the click handler for the first button
    // to ensure the correct initial state (hiding/showing both areas)
    handleTabClick({ currentTarget: tabButtons[0] });
  }
}

// --- Fetch Title Logic --- (No changes needed here)
function waitForTabLoadComplete(tabId, targetUrl) {
  // ... (implementation remains the same)
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
