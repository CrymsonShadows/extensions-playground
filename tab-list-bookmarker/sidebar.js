// sidebar.js - Main Entry Point

import { setupActionTabs } from "./ui.js";
import {
  renderTabs,
  setupTabsUI,
  clearSelectedTabs as clearTabSelection,
} from "./tabs_ui.js";
import { renderBookmarkTree, setupBookmarksUI } from "./bookmarks_ui.js";
import { setupGroupingUI, loadExistingGroups } from "./grouping_ui.js";
// Import specific functions from stash_ui
import {
  setupStashUI,
  renderStashList,
  updateHighlightingOnActiveTab, // Import the specific function
} from "./stash_ui.js";
import { debounce } from "./utils.js";

// --- Debounced Render Functions ---
const debouncedRenderTabs = debounce(renderTabs, 250);
const debouncedRenderBookmarkTree = debounce(renderBookmarkTree, 300);
const debouncedRenderStashList = debounce(renderStashList, 300);
const debouncedLoadExistingGroups = debounce(loadExistingGroups, 300);

// --- State ---
let initialSetupComplete = false; // Renamed for clarity

// --- Core Setup and Render Logic ---

// Function to perform the initial setup of UI elements (listeners, etc.)
// This should only run once
async function performInitialSetup() {
  // Prevent running multiple times
  if (initialSetupComplete) return;
  console.log("Performing initial UI setup...");
  try {
    setupActionTabs();
    setupTabsUI();
    setupBookmarksUI();
    setupGroupingUI(); // This calls loadExistingGroups internally
    await setupStashUI(); // Sets up listeners and loads highlight state
    initialSetupComplete = true; // Set flag only after successful setup
    console.log("Initial UI setup complete.");
  } catch (error) {
    console.error("Error during initial UI setup:", error);
    // Handle setup error appropriately, maybe show an error message
  }
}

// Function to render all dynamic content
// Can be called multiple times (e.g., on visibility change)
async function renderAllLists() {
  console.log("Rendering all lists...");
  // Use Promise.allSettled to run renders concurrently
  const results = await Promise.allSettled([
    renderTabs(),
    renderBookmarkTree(),
    renderStashList(),
    // loadExistingGroups is part of setupGroupingUI
  ]);
  console.log("List rendering finished.");
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const listName = ["Tabs", "Bookmarks", "Stash"][index];
      console.error(`Error rendering ${listName}:`, result.reason);
    }
  });

  // Update highlighting *after* lists (especially stash list) are rendered
  if (initialSetupComplete) {
    // Ensure setup (and highlight state load) happened
    try {
      await updateHighlightingOnActiveTab();
      console.log("Highlighting updated after list render.");
    } catch (highlightError) {
      console.error(
        "Error updating highlighting after render:",
        highlightError
      );
    }
  }
}

// --- Initial Load Trigger ---
// Attempt setup and render as soon as the script runs
// This might happen before or after DOMContentLoaded
performInitialSetup().then(() => {
  // Once setup is done (or attempted), render lists
  if (initialSetupComplete && document.readyState !== "loading") {
    // If setup finished and DOM is ready, render immediately
    renderAllLists();
  } else if (initialSetupComplete) {
    // If setup finished but DOM isn't ready, wait for DOMContentLoaded
    document.addEventListener("DOMContentLoaded", renderAllLists, {
      once: true,
    });
  }
  // If setup failed, render won't happen here
});

// Fallback/Redundancy: Ensure setup/render happens on DOMContentLoaded if not already done
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Sidebar DOM loaded event fired.");
  if (!initialSetupComplete) {
    console.log(
      "Initial setup not complete, running setup and render via DOMContentLoaded."
    );
    await performInitialSetup(); // Attempt setup again if it failed earlier
    if (initialSetupComplete) {
      await renderAllLists(); // Perform initial render if setup succeeded
    }
  } else {
    console.log("DOM loaded, but initial setup was already complete.");
    // Optionally, re-render here too if needed, but visibilitychange should cover it
    // await renderAllLists();
  }
});

// --- Render on Visibility Change ---
// This handles cases where the sidebar is re-opened after the initial load
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    console.log("Sidebar became visible.");
    if (!initialSetupComplete) {
      // Should ideally not happen if the above logic works, but as a safeguard:
      console.warn(
        "Sidebar visible but initial setup not complete. Attempting setup and render."
      );
      await performInitialSetup();
      if (initialSetupComplete) {
        await renderAllLists();
      }
    } else {
      // If initial setup is done, just re-render the lists
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
  // Update highlighting when active tab changes
  if (initialSetupComplete) {
    try {
      await updateHighlightingOnActiveTab(); // Call specific function
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
    const stashPanel = document.getElementById("stash-settings");
    const stashListArea = document.getElementById("stash-list-area");

    // Re-render stash list if the stash tab is active or its list area is visible
    if (
      (stashPanel && stashPanel.classList.contains("active")) ||
      (stashListArea && !stashListArea.classList.contains("hidden"))
    ) {
      console.log(
        "Sidebar: Stash area visible, calling debouncedRenderStashList."
      );
      debouncedRenderStashList();
    } else {
      console.log(
        "Sidebar: Stash area not active, list will refresh when opened."
      );
    }
    return true; // Indicate potential async response
  }
  // Return false or undefined if the message is not handled asynchronously
});

console.log("Sidebar script loaded (Modular).");
