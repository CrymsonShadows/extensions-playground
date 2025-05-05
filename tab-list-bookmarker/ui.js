// ui.js

// --- Element References ---
// Settings Elements
const settingsSection = document.getElementById("settings-section");
const settingsHeader = document.querySelector(".settings-header");
const settingsToggleIndicator = document.getElementById(
  "settings-toggle-indicator"
);
const actionTabsContainer = document.querySelector(".action-tabs-container");
const actionTabButtons = document.querySelectorAll(".tab-btn"); // Settings tabs
const actionTabPanels = document.querySelectorAll(".tab-panel"); // Settings panels

// List Elements
const listTabButtons = document.querySelectorAll(".list-tab-btn"); // List tabs
const listPanels = document.querySelectorAll(".list-panel"); // List panels (wrappers)
// We don't need direct references to mainTabListArea/stashListArea here anymore

// --- Constants ---
const SETTINGS_COLLAPSED_KEY = "settingsCollapsed";
const ACTIVE_LIST_TAB_KEY = "activeListTab";

// --- Settings Collapse/Expand Logic ---
// toggleSettings, loadSettingsCollapsedState remain the same
async function toggleSettings(event) {
  if (!settingsSection) return;
  const isCollapsed = settingsSection.classList.toggle("collapsed");
  console.log("Toggled settings collapsed state:", isCollapsed);
  try {
    await chrome.storage.local.set({ [SETTINGS_COLLAPSED_KEY]: isCollapsed });
    console.log("Saved collapsed state:", isCollapsed);
  } catch (error) {
    console.error("Error saving settings collapsed state:", error);
  }
}

async function loadSettingsCollapsedState() {
  if (!settingsSection) return;
  try {
    const result = await chrome.storage.local.get(SETTINGS_COLLAPSED_KEY);
    const isCollapsed = !!result[SETTINGS_COLLAPSED_KEY];
    settingsSection.classList.toggle("collapsed", isCollapsed);
    console.log("Loaded settings collapsed state:", isCollapsed);
  } catch (error) {
    console.error("Error loading settings collapsed state:", error);
    settingsSection.classList.remove("collapsed");
  }
}

// --- Settings Tab Switching Logic ---
// *** SIMPLIFIED: Only switches settings panels ***
function handleActionTabClick(event) {
  const clickedButton = event.currentTarget;
  const targetPanelId = clickedButton.dataset.target;

  // Remove active class from all action buttons and panels
  actionTabButtons.forEach((btn) => btn.classList.remove("active"));
  actionTabPanels.forEach((panel) => panel.classList.remove("active"));

  // Add active class to the clicked button and corresponding panel
  clickedButton.classList.add("active");
  const targetPanel = document.getElementById(targetPanelId);
  if (targetPanel && targetPanel.classList.contains("tab-panel")) {
    // Check it's a settings panel
    targetPanel.classList.add("active");
    console.log(`Switched to settings panel: ${targetPanelId}`);
  } else {
    console.error("Target settings panel not found or invalid:", targetPanelId);
    // Fallback: activate the first settings panel if target is invalid
    if (actionTabButtons.length > 0 && actionTabPanels.length > 0) {
      actionTabButtons[0].classList.add("active");
      actionTabPanels[0].classList.add("active");
    }
  }
  // ** REMOVED logic that hid/showed list areas **
}

// --- List Tab Switching Logic ---
// handleListTabClick, loadActiveListTab remain the same
function handleListTabClick(event) {
  const clickedButton = event.currentTarget;
  const targetPanelId = clickedButton.dataset.target;

  listTabButtons.forEach((btn) => btn.classList.remove("active"));
  listPanels.forEach((panel) => panel.classList.remove("active"));

  clickedButton.classList.add("active");
  const targetPanel = document.getElementById(targetPanelId);
  if (targetPanel && targetPanel.classList.contains("list-panel")) {
    targetPanel.classList.add("active");
    console.log(`Switched to list panel: ${targetPanelId}`);
    chrome.storage.local
      .set({ [ACTIVE_LIST_TAB_KEY]: targetPanelId })
      .catch((err) => {
        console.error("Error saving active list tab:", err);
      });
  } else {
    console.error("Target list panel not found or invalid:", targetPanelId);
    if (listTabButtons.length > 0 && listPanels.length > 0) {
      listTabButtons[0].classList.add("active");
      listPanels[0].classList.add("active");
      chrome.storage.local
        .set({ [ACTIVE_LIST_TAB_KEY]: listPanels[0].id })
        .catch((err) => {});
    }
  }
}

async function loadActiveListTab() {
  try {
    const result = await chrome.storage.local.get(ACTIVE_LIST_TAB_KEY);
    const activeTabId =
      result[ACTIVE_LIST_TAB_KEY] ||
      (listPanels.length > 0 ? listPanels[0].id : null);

    if (activeTabId) {
      let foundActive = false;
      listTabButtons.forEach((btn) => {
        const isActive = btn.dataset.target === activeTabId;
        btn.classList.toggle("active", isActive);
        if (isActive) foundActive = true;
      });
      listPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.id === activeTabId);
      });

      if (!foundActive && listTabButtons.length > 0 && listPanels.length > 0) {
        listTabButtons[0].classList.add("active");
        listPanels[0].classList.add("active");
      }
      console.log("Loaded active list tab:", activeTabId);
    } else {
      console.log("No active list tab saved, defaulting to first.");
      if (listTabButtons.length > 0 && listPanels.length > 0) {
        listTabButtons[0].classList.add("active");
        listPanels[0].classList.add("active");
      }
    }
  } catch (error) {
    console.error("Error loading active list tab state:", error);
    if (listTabButtons.length > 0 && listPanels.length > 0) {
      listTabButtons[0].classList.add("active");
      listPanels[0].classList.add("active");
    }
  }
}

// --- Setup ---
// setupActionTabs and setupListTabs remain largely the same,
// just ensure they target the correct elements.
export function setupActionTabs() {
  actionTabButtons.forEach((button) => {
    if (button.dataset.tabListenerAttached !== "true") {
      button.addEventListener("click", handleActionTabClick);
      button.dataset.tabListenerAttached = "true";
    }
  });

  if (
    settingsHeader &&
    settingsHeader.dataset.toggleListenerAttached !== "true"
  ) {
    settingsHeader.addEventListener("click", toggleSettings);
    settingsHeader.dataset.toggleListenerAttached = "true";
    console.log("Attaching settings toggle listener to header.");
    loadSettingsCollapsedState();
  } else if (!settingsHeader) {
    console.error("Could not find settings header element.");
  }

  // Set initial active SETTINGS tab (if not collapsed)
  if (!settingsSection || !settingsSection.classList.contains("collapsed")) {
    const firstActionTabButton =
      actionTabButtons.length > 0 ? actionTabButtons[0] : null;
    if (firstActionTabButton && actionTabPanels.length > 0) {
      let activeActionBtn =
        document.querySelector(".tab-btn.active") || firstActionTabButton;
      const targetActionPanelId = activeActionBtn.dataset.target;
      const targetActionPanel = document.getElementById(targetActionPanelId);
      if (
        !targetActionPanel ||
        !targetActionPanel.classList.contains("tab-panel")
      ) {
        // Verify it's a settings panel
        activeActionBtn.classList.remove("active");
        activeActionBtn = firstActionTabButton;
        activeActionBtn.classList.add("active");
      }
      actionTabPanels.forEach((panel) => panel.classList.remove("active"));
      const activePanel = document.getElementById(
        activeActionBtn.dataset.target
      );
      if (activePanel) activePanel.classList.add("active");
    }
  }
}

export function setupListTabs() {
  listTabButtons.forEach((button) => {
    if (button.dataset.listTabListener !== "true") {
      button.addEventListener("click", handleListTabClick);
      button.dataset.listTabListener = "true";
    }
  });
  loadActiveListTab();
}

// --- Fetch Title Logic --- (No changes needed here)
// waitForTabLoadComplete, handleFetchTitleClick remain the same
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
