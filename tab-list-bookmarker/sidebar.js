// sidebar.js - Main Entry Point

// Import setup functions for different UI sections
import { setupActionTabs, setupListTabs } from "./ui.js"; // Updated ui.js exports
import {
  renderTabs,
  setupTabsUI,
  clearSelectedTabs as clearTabSelection,
} from "./tabs_ui.js";
import { renderBookmarkTree, setupBookmarksUI } from "./bookmarks_ui.js";
import { setupGroupingUI, loadExistingGroups } from "./grouping_ui.js";
import {
  setupStashUI,
  renderStashList,
  updateHighlightingOnActiveTab,
} from "./stash_ui.js";
import { debounce } from "./utils.js";

// --- Debounced Render Functions ---
const debouncedRenderTabs = debounce(renderTabs, 250);
const debouncedRenderBookmarkTree = debounce(renderBookmarkTree, 300);
const debouncedRenderStashList = debounce(renderStashList, 300);
const debouncedLoadExistingGroups = debounce(loadExistingGroups, 300);

// --- State ---
let initialSetupComplete = false;

// --- Core Setup and Render Logic ---

async function performInitialSetup() {
  if (initialSetupComplete) return;
  console.log("Performing initial UI setup...");
  try {
    // Setup UI sections (listeners, initial states)
    setupActionTabs(); // Sets up settings tabs and collapse listener
    setupListTabs(); // Sets up list tabs listener and loads active list tab
    setupTabsUI(); // Sets up current tabs list listeners (select all etc.)
    setupBookmarksUI(); // Sets up bookmark panel listeners
    setupGroupingUI(); // Sets up group panel listeners (calls loadExistingGroups)
    await setupStashUI(); // Sets up stash listeners and loads highlight state

    initialSetupComplete = true;
    console.log("Initial UI setup complete.");
  } catch (error) {
    console.error("Error during initial UI setup:", error);
  }
}

async function renderAllLists() {
  // Only render if setup is complete
  if (!initialSetupComplete) {
    console.warn(
      "Attempted to render lists before initial setup was complete."
    );
    return;
  }
  console.log("Rendering all lists...");
  const results = await Promise.allSettled([
    renderTabs(),
    renderBookmarkTree(),
    renderStashList(),
  ]);
  console.log("List rendering finished.");
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const listName = ["Tabs", "Bookmarks", "Stash"][index];
      console.error(`Error rendering ${listName}:`, result.reason);
    }
  });

  try {
    await updateHighlightingOnActiveTab();
    console.log("Highlighting updated after list render.");
  } catch (highlightError) {
    console.error("Error updating highlighting after render:", highlightError);
  }
}

// --- Initial Load Trigger ---
performInitialSetup().then(() => {
  if (initialSetupComplete && document.readyState !== "loading") {
    renderAllLists();
  } else if (initialSetupComplete) {
    document.addEventListener("DOMContentLoaded", renderAllLists, {
      once: true,
    });
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  console.log("Sidebar DOM loaded event fired.");
  if (!initialSetupComplete) {
    console.log(
      "Initial setup not complete, running setup and render via DOMContentLoaded."
    );
    await performInitialSetup();
    if (initialSetupComplete) {
      await renderAllLists();
    }
  } else {
    // If setup is done, ensure lists render if DOM was ready before setup finished
    await renderAllLists();
  }
});

// --- Render on Visibility Change ---
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    console.log("Sidebar became visible.");
    if (!initialSetupComplete) {
      console.warn(
        "Sidebar visible but initial setup not complete. Attempting setup and render."
      );
      await performInitialSetup();
      if (initialSetupComplete) {
        await renderAllLists();
      }
    } else {
      console.log("Re-rendering lists on visibility change.");
      await renderAllLists();
    }
  }
});

// --- Browser Event Listeners (Using Debounced Handlers) ---

// Tab Events
chrome.tabs.onCreated.addListener(debouncedRenderTabs);
chrome.tabs.onRemoved.addListener(debouncedRenderTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.url ||
    changeInfo.title ||
    changeInfo.status === "complete" ||
    changeInfo.groupId !== undefined ||
    changeInfo.favIconUrl
  ) {
    debouncedRenderTabs();
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (initialSetupComplete) {
    try {
      await updateHighlightingOnActiveTab();
    } catch (highlightError) {
      console.error(
        "Error updating highlighting on tab activation:",
        highlightError
      );
    }
  }
});
chrome.tabs.onAttached.addListener(debouncedRenderTabs);
chrome.tabs.onDetached.addListener(debouncedRenderTabs);

// Group Events
function handleGroupChange() {
  debouncedRenderTabs();
  debouncedLoadExistingGroups();
}
chrome.tabGroups.onCreated.addListener(handleGroupChange);
chrome.tabGroups.onRemoved.addListener(handleGroupChange);
chrome.tabGroups.onUpdated.addListener(handleGroupChange);
chrome.tabGroups.onMoved.addListener(handleGroupChange);

// Bookmark Events
chrome.bookmarks.onCreated.addListener(debouncedRenderBookmarkTree);
chrome.bookmarks.onRemoved.addListener(debouncedRenderBookmarkTree);
chrome.bookmarks.onChanged.addListener(debouncedRenderBookmarkTree);
chrome.bookmarks.onMoved.addListener(debouncedRenderBookmarkTree);

// --- Message Listener for Background Script Updates ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "stashUpdated") {
    console.log("Sidebar: Received stashUpdated message from background.");
    // Find the active list tab button
    const activeListTab = document.querySelector(".list-tab-btn.active");
    // Re-render stash list only if "Stashed Items" tab is active
    if (activeListTab && activeListTab.dataset.target === "stash-list-area") {
      console.log(
        "Sidebar: Stash list tab active, calling debouncedRenderStashList."
      );
      debouncedRenderStashList();
    } else {
      console.log(
        "Sidebar: Stash list tab not active, list will refresh when selected."
      );
    }
    return true; // Indicate potential async response
  }
});

console.log("Sidebar script loaded (Modular).");
