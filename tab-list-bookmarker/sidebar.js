// sidebar.js - Main Entry Point

import { setupActionTabs } from "./ui.js";
import {
  renderTabs,
  setupTabsUI,
  clearSelectedTabs as clearTabSelection,
} from "./tabs_ui.js"; // Renamed clear function
import { renderBookmarkTree, setupBookmarksUI } from "./bookmarks_ui.js";
import { setupGroupingUI, loadExistingGroups } from "./grouping_ui.js";
import { setupStashUI, renderStashList } from "./stash_ui.js";

// --- Initial Setup ---
document.addEventListener("DOMContentLoaded", () => {
  console.log("Sidebar DOM loaded. Initializing UI modules...");
  setupActionTabs();
  setupTabsUI();
  setupBookmarksUI();
  setupGroupingUI();
  setupStashUI();

  // Initial data loading
  renderTabs();
  renderBookmarkTree();
  // loadExistingGroups(); // Called within setupGroupingUI
  renderStashList(); // Called within setupStashUI
  console.log("Sidebar UI Initialized.");
});

// --- Browser Event Listeners ---
// These listeners trigger re-rendering functions from the appropriate modules

// Tab Events
chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs); // tabs_ui handles cleaning checkedTabIds
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Re-render if significant properties change
  if (
    changeInfo.url ||
    changeInfo.title ||
    changeInfo.status === "complete" ||
    changeInfo.groupId !== undefined ||
    changeInfo.favIconUrl
  ) {
    renderTabs();
  }
});
chrome.tabs.onAttached.addListener(renderTabs);
chrome.tabs.onDetached.addListener(renderTabs);

// Group Events (Render tabs and reload group dropdown)
function handleGroupChange() {
  renderTabs();
  loadExistingGroups(); // Reload group dropdown in grouping_ui
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

// Optional: Listen for messages from background script (e.g., after context menu action)
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//     if (message.action === "refreshStashList") {
//         console.log("Received message to refresh stash list.");
//         renderStashList();
//     }
//     // Handle other messages if needed
// });

console.log("Sidebar script loaded (Modular).");
