// sidebar.js - Main Entry Point

// Import setup functions for different UI sections
import { setupActionTabs, setupListTabs } from "./ui.js";
import {
  renderTabs,
  setupTabsUI,
  clearSelectedTabs as clearTabSelection,
} from "./tabs_ui.js";
import { renderBookmarkTree, setupBookmarksUI } from "./bookmarks_ui.js";
import { setupGroupingUI, loadExistingGroups } from "./grouping_ui.js"; // Ensure setupGroupingUI is imported
import {
  setupStashUI,
  renderStashList,
  updateHighlightingOnActiveTab,
} from "./stash_ui.js";
import { debounce } from "./utils.js";

// --- Debounced Render Functions ---
// Debounce time can be adjusted based on performance needs
const debouncedRenderTabs = debounce(renderTabs, 200);
const debouncedRenderBookmarkTree = debounce(renderBookmarkTree, 250);
const debouncedRenderStashList = debounce(renderStashList, 250);
const debouncedLoadExistingGroups = debounce(loadExistingGroups, 250);

// --- Core Setup and Render Logic ---

/**
 * Performs the initial setup of all UI components.
 * Attaches event listeners. Relies on internal checks
 * within each setup function to prevent duplicate listeners
 * if called multiple times.
 */
async function performSetup() {
  console.log("Performing UI setup...");
  try {
    // Setup functions should ideally check if they've run already
    setupActionTabs();
    setupListTabs();
    setupTabsUI();
    setupBookmarksUI(); // This function already has a check
    setupGroupingUI(); // *** ADDED MISSING CALL ***
    await setupStashUI(); // Ensure this also has checks if necessary
    console.log("UI setup complete.");
  } catch (error) {
    console.error("Error during UI setup:", error);
  }
}

/**
 * Renders all dynamic lists (tabs, bookmarks, stash).
 */
async function renderAllLists() {
  console.log("Rendering all lists...");
  const results = await Promise.allSettled([
    renderTabs(),
    renderBookmarkTree(),
    renderStashList(),
    // loadExistingGroups(), // Load groups separately if needed, or as part of renderTabs
  ]);
  console.log("List rendering finished.");
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      const listName = ["Tabs", "Bookmarks", "Stash"][index];
      console.error(`Error rendering ${listName}:`, result.reason);
    }
  });

  // Update highlighting after lists are rendered
  try {
    await updateHighlightingOnActiveTab();
    console.log("Highlighting updated after list render.");
  } catch (highlightError) {
    console.error("Error updating highlighting after render:", highlightError);
  }
}

// --- Initial Load Trigger ---

// Use DOMContentLoaded to ensure the DOM is ready before setup and rendering
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Sidebar DOM loaded event fired.");
  await performSetup(); // Setup UI elements and listeners
  await renderAllLists(); // Perform the initial render of lists
});

// --- Render on Visibility Change ---
// Re-render lists when the panel becomes visible again for fresh data
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible") {
    console.log("Sidebar became visible. Re-rendering lists.");
    await renderAllLists();
    // Optionally, refresh group list if it can change while panel is hidden
    await loadExistingGroups();
  }
});

// --- Browser Event Listeners (Using Debounced Handlers) ---

// Tab Events
chrome.tabs.onCreated.addListener(debouncedRenderTabs);
chrome.tabs.onRemoved.addListener(debouncedRenderTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Re-render if relevant properties change
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
  // Update highlighting when the active tab changes
  try {
    await updateHighlightingOnActiveTab();
  } catch (highlightError) {
    console.error(
      "Error updating highlighting on tab activation:",
      highlightError
    );
  }
});
chrome.tabs.onAttached.addListener(debouncedRenderTabs);
chrome.tabs.onDetached.addListener(debouncedRenderTabs);

// Group Events
function handleGroupChange() {
  // Re-render tabs list and reload group dropdown
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
    console.log(
      "Sidebar: Received stashUpdated message. Re-rendering stash list."
    );
    // Re-render the stash list whenever the background indicates an update
    debouncedRenderStashList();
    // Indicate that the message was handled (even if async via debounce)
    return true;
  }
  // Return false or undefined if the message is not handled here
});

console.log("Sidebar script loaded (Modular - Grouping Setup Fix).");
