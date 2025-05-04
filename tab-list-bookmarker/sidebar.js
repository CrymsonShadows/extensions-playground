// sidebar.js - Main Entry Point

import { setupActionTabs } from "./ui.js";
import {
  renderTabs,
  setupTabsUI,
  clearSelectedTabs as clearTabSelection,
} from "./tabs_ui.js";
import { renderBookmarkTree, setupBookmarksUI } from "./bookmarks_ui.js";
import { setupGroupingUI, loadExistingGroups } from "./grouping_ui.js";
// Import renderStashList specifically if needed by the message listener
import { setupStashUI, renderStashList } from "./stash_ui.js";

// --- Initial Setup ---
document.addEventListener("DOMContentLoaded", async () => {
  // Make async for setupStashUI
  console.log("Sidebar DOM loaded. Initializing UI modules...");
  setupActionTabs();
  setupTabsUI();
  setupBookmarksUI();
  setupGroupingUI();
  await setupStashUI(); // Wait for stash UI setup (loads highlight state)

  // Initial data loading
  renderTabs();
  renderBookmarkTree();
  // loadExistingGroups(); // Called within setupGroupingUI
  renderStashList(); // Initial stash list render
  console.log("Sidebar UI Initialized.");
});

// --- Browser Event Listeners ---

// Tab Events
chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.url ||
    changeInfo.title ||
    changeInfo.status === "complete" ||
    changeInfo.groupId !== undefined ||
    changeInfo.favIconUrl
  ) {
    renderTabs();
    // Also potentially refresh stash if URL changed and highlighting is on
    // This might be too aggressive, consider if needed based on highlight logic
    // if (changeInfo.url && isHighlightingEnabled) { // Need access to highlight state
    //   updateHighlightingOnActiveTab();
    // }
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  // When the active tab changes, update highlighting if enabled
  // Need access to highlight state and update function from stash_ui
  // This requires exporting them or handling it differently.
  // For now, we rely on content script receiving updates when sidebar is interacted with.
  // console.log("Active tab changed, potentially update highlighting");
  // await updateHighlightingOnActiveTab(); // Needs access to this function
});
chrome.tabs.onAttached.addListener(renderTabs);
chrome.tabs.onDetached.addListener(renderTabs);

// Group Events
function handleGroupChange() {
  renderTabs();
  loadExistingGroups();
}
chrome.tabGroups.onCreated.addListener(handleGroupChange);
chrome.tabGroups.onRemoved.addListener(handleGroupChange);
chrome.tabGroups.onUpdated.addListener(handleGroupChange);
chrome.tabGroups.onMoved.addListener(handleGroupChange);

// Bookmark Events
chrome.bookmarks.onCreated.addListener(renderBookmarkTree);
chrome.bookmarks.onRemoved.addListener(renderBookmarkTree);
chrome.bookmarks.onChanged.addListener(renderBookmarkTree);
chrome.bookmarks.onMoved.addListener(renderBookmarkTree);

// --- Message Listener for Background Script Updates ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if the message is from our background script (optional but good practice)
  // if (sender.id !== chrome.runtime.id) return;

  if (message.action === "stashUpdated") {
    console.log("Sidebar: Received stashUpdated message from background.");
    // Check if the stash panel is currently visible before rendering
    const stashPanel = document.getElementById("stash-settings");
    if (stashPanel && stashPanel.classList.contains("active")) {
      renderStashList(); // Refresh the list in the UI
      // Also potentially update highlighting if needed
      // updateHighlightingOnActiveTab(); // Needs access to this function
    } else {
      console.log(
        "Sidebar: Stash panel not active, list will refresh when opened."
      );
      // The list will be rendered fresh when the user switches to the stash tab anyway
    }
    // Optional: Send confirmation back
    // sendResponse({ status: "Stash list refresh triggered" });
    return true; // Indicate potential async response
  }
  // Handle other potential messages if needed
});

console.log("Sidebar script loaded (Modular).");
