// background.js

// Import utility and DB functions
import { getOriginalTabInfo } from "./utils.js";
import {
  openDB,
  stashOrUpdateItemDB,
  updateStashItemConsumedDB,
  getAllStashUrlsDB,
} from "./db.js";
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  // ... other constants if needed by background-specific logic ...
} from "./constants.js";

// --- Initial Setup (e.g., DB check, context menus) ---
chrome.runtime.onInstalled.addListener(() => {
  console.log("BG: Extension Installed or Updated.");

  openDB()
    .then((db) => {
      console.log("BG: Database opened successfully on install/update.");
      db.close();
    })
    .catch((error) => {
      console.error("BG: Error opening database on install/update:", error);
    });

  // Create Context Menus
  chrome.contextMenus.create({
    id: "stashTab",
    title: "Stash Tab",
    contexts: ["page"],
  });
  chrome.contextMenus.create({
    id: "markStashedTabConsumed",
    title: "Mark Stashed Tab as Consumed",
    contexts: ["page"],
  });
  console.log("BG: Context menus created.");
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("BG: Context menu clicked:", info.menuItemId, "on tab:", tab);

  if (!tab || !tab.url || !tab.id) {
    console.warn("BG: Context menu click ignored - Invalid tab object:", tab);
    return;
  }

  const originalInfo = getOriginalTabInfo(tab.url, tab.title);
  console.log("BG: Original info extracted:", originalInfo);

  if (
    !originalInfo.url ||
    originalInfo.url.startsWith("chrome://") ||
    (originalInfo.url.startsWith("chrome-extension://") &&
      !originalInfo.isSuspended) ||
    originalInfo.url.startsWith("about:") ||
    originalInfo.url.startsWith("file:")
  ) {
    console.warn(
      `BG: Context menu click ignored - Invalid/Internal URL: ${originalInfo.url}`
    );
    return;
  }

  // --- Handle Specific Menu Item Actions ---
  if (info.menuItemId === "stashTab") {
    await handleStashVideoAction(
      { url: originalInfo.url, title: originalInfo.title },
      "context_menu_tab"
    );
  } else if (info.menuItemId === "markStashedTabConsumed") {
    console.log(
      `BG: Handling 'markStashedTabConsumed' for URL: ${originalInfo.url}`
    );
    try {
      const updatedCount = await updateStashItemConsumedDB(
        originalInfo.url,
        true
      );
      if (updatedCount > 0) {
        console.log(
          `BG: Marked ${updatedCount} stashed item(s) as consumed for URL: ${originalInfo.url}`
        );
        notifySidebarAndHighlight();
      } else {
        console.log(
          `BG: No unconsumed stashed items found for URL: ${originalInfo.url}`
        );
      }
    } catch (error) {
      console.error(
        "BG: Error marking stashed tab as consumed via context menu:",
        error
      );
    }
  }
});

// --- Helper function to handle stashing logic (used by context menu and message listener) ---
async function handleStashVideoAction(payload, source = "unknown") {
  console.log(
    `BG: Handling 'stashVideoAction' from ${source} for URL: ${payload.url}`
  );
  try {
    const itemData = {
      title: payload.title || payload.url,
      url: payload.url,
      tags: payload.tags || [], // Allow tags if provided, default to empty
    };
    const result = await stashOrUpdateItemDB(itemData);
    console.log(
      `BG: Stashed/Updated via ${source}: ${itemData.title} (Action: ${result.action}, ID: ${result.id}, Count: ${result.count})`
    );
    notifySidebarAndHighlight(payload.url);
  } catch (error) {
    console.error(`BG: Error stashing/updating video via ${source}:`, error);
  }
}

// --- Helper to notify sidebar and update highlighting ---
async function notifySidebarAndHighlight(stashedUrl = null) {
  // Send message to sidebar if open
  chrome.runtime.sendMessage({ action: "stashUpdated" }).catch((err) => {
    if (!err.message.includes("Receiving end does not exist")) {
      console.error("BG: Error sending stashUpdated message:", err);
    } else {
      // console.log("BG: Sidebar not open, stashUpdated message not sent.");
    }
  });

  // Update highlighting on active tabs if needed
  try {
    const storageResult = await chrome.storage.local.get(
      "stashHighlightEnabled"
    );
    const isEnabled = !!storageResult["stashHighlightEnabled"];
    if (isEnabled) {
      const allUrls = await getAllStashUrlsDB(); // Fetch all URLs *after* stashing

      // Query all tabs, not just those matching the stashed URL, to update highlighting globally
      const tabsToUpdate = await chrome.tabs.query({});

      tabsToUpdate.forEach((t) => {
        if (
          t.id &&
          t.url &&
          !t.url.startsWith("chrome") &&
          !t.url.startsWith("about") &&
          !t.url.startsWith("file")
        ) {
          chrome.tabs
            .sendMessage(t.id, {
              type: "UPDATE_HIGHLIGHTING",
              enabled: isEnabled,
              stashedUrls: allUrls,
            })
            .catch((e) => {
              if (
                e.message.includes("Receiving end does not exist") ||
                e.message.includes("Could not establish connection")
              ) {
                // console.warn(`BG: Content script not available in tab ${t.id} (${t.url})`);
              } else {
                console.warn(
                  `BG: Error sending highlight update to tab ${t.id}: ${e.message}`
                );
              }
            });
        }
      });
    }
  } catch (error) {
    console.error("BG: Error during highlight update process:", error);
  }
}

// --- Side Panel and Action Setup ---
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("BG: Error setting panel behavior:", error));

// Listener for when the extension action (toolbar icon) is clicked
chrome.action.onClicked.addListener((tab) => {
  console.log("BG: Extension action clicked.");
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    // Fallback for cases where windowId might not be available (less common)
    chrome.sidePanel.open();
    console.warn(
      "BG: Action clicked on a tab without a windowId? Opening default side panel."
    );
  }
});

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle request from content script for initial highlight state
  if (message.type === "GET_INITIAL_HIGHLIGHT_STATE") {
    console.log(
      "BG: Received GET_INITIAL_HIGHLIGHT_STATE request from content script in tab:",
      sender.tab?.id
    );
    (async () => {
      try {
        const storageKey = "stashHighlightEnabled";
        const storageResult = await chrome.storage.local.get(storageKey);
        const isEnabled = !!storageResult[storageKey];
        let stashedUrls = [];
        if (isEnabled) {
          stashedUrls = await getAllStashUrlsDB();
        }
        sendResponse({ enabled: isEnabled, stashedUrls: stashedUrls });
      } catch (error) {
        console.error("BG: Error getting initial highlight state:", error);
        sendResponse({ enabled: false, stashedUrls: [] });
      }
    })();
    return true; // Asynchronous response
  } else if (message.type === "STASH_YOUTUBE_VIDEO") {
    console.log("BG: Received STASH_YOUTUBE_VIDEO message", message.payload);
    handleStashVideoAction(message.payload, "content_script_youtube")
      .then(() => sendResponse({ status: "success", message: "Video stashed" }))
      .catch((err) => sendResponse({ status: "error", message: err.message }));
    return true; // Asynchronous response
  } else if (message.action === "stashUpdated") {
    // This message is usually sent *from* background *to* sidebar.
    // If sidebar sends it for some reason, just log it.
    console.log(
      "BG: Received 'stashUpdated' message (likely from self or sidebar)."
    );
  }
  // Return false or undefined if not handling the message asynchronously for other types
});

console.log("BG: Background service worker started/restarted.");
