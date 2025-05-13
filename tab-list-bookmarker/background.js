// background.js

// Import utility and DB functions
import { getOriginalTabInfo } from "./utils.js"; // Assuming utils.js exports this
import {
  openDB, // Keep openDB for initial setup/upgrade check if needed elsewhere, or remove if unused
  stashOrUpdateItemDB,
  updateStashItemConsumedDB, // Use the function that takes URL
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

  // Attempt to open DB on install/update to trigger upgrades if needed
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
    contexts: ["page"], // Show for pages
  });
  chrome.contextMenus.create({
    id: "markStashedTabConsumed",
    title: "Mark Stashed Tab as Consumed",
    contexts: ["page"], // Show for pages
  });
  console.log("BG: Context menus created.");
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("BG: Context menu clicked:", info.menuItemId, "on tab:", tab);

  // --- Basic Validation ---
  if (!tab || !tab.url || !tab.id) {
    console.warn("BG: Context menu click ignored - Invalid tab object:", tab);
    return;
  }

  // --- Get Original URL/Title (Handles Suspended Tabs) ---
  // Use getOriginalTabInfo from utils.js
  const originalInfo = getOriginalTabInfo(tab.url, tab.title);
  console.log("BG: Original info extracted:", originalInfo);

  // --- Check if URL is valid for stashing/marking ---
  if (
    !originalInfo.url || // Must have a URL after processing
    originalInfo.url.startsWith("chrome://") ||
    (originalInfo.url.startsWith("chrome-extension://") &&
      !originalInfo.isSuspended) || // Allow suspended extension URLs, block others
    originalInfo.url.startsWith("about:") ||
    originalInfo.url.startsWith("file:")
  ) {
    console.warn(
      `BG: Context menu click ignored - Invalid/Internal URL: ${originalInfo.url}`
    );
    // Optionally notify user? (Difficult from background script)
    return;
  }

  // --- Handle Specific Menu Item Actions ---
  if (info.menuItemId === "stashTab") {
    console.log(`BG: Handling 'stashTab' for URL: ${originalInfo.url}`);
    try {
      const itemData = {
        title: originalInfo.title || originalInfo.url,
        url: originalInfo.url,
        tags: [], // Context menu doesn't support tags directly
        // Let db.js handle dateCreated, dateUpdated, favorite, consumed defaults
      };
      // *** Use imported function from db.js ***
      const result = await stashOrUpdateItemDB(itemData);
      console.log(
        `BG: Stashed/Updated via context menu: ${itemData.title} (Action: ${result.action}, ID: ${result.id}, Count: ${result.count})`
      );
      // Send message to sidebar if open
      chrome.runtime.sendMessage({ action: "stashUpdated" }).catch((err) => {
        if (!err.message.includes("Receiving end does not exist")) {
          console.error("BG: Error sending stashUpdated message:", err);
        } else {
          console.log("BG: Sidebar not open, stashUpdated message not sent.");
        }
      });
      // Update highlighting on active tabs if needed
      // Find tabs with the same URL and update them
      const tabsToUpdate = await chrome.tabs.query({ url: originalInfo.url });
      if (tabsToUpdate.length > 0) {
        console.log(
          `BG: Found ${tabsToUpdate.length} tabs matching the stashed URL to potentially update highlighting.`
        );
        // We need the current highlight state and all URLs to send the update message
        const storageResult = await chrome.storage.local.get(
          "stashHighlightEnabled"
        );
        const isEnabled = !!storageResult["stashHighlightEnabled"];
        if (isEnabled) {
          const allUrls = await getAllStashUrlsDB(); // Fetch all URLs *after* stashing
          tabsToUpdate.forEach((t) => {
            if (t.id && t.url && !t.url.startsWith("chrome")) {
              // Check again if tab is valid
              chrome.tabs
                .sendMessage(t.id, {
                  type: "UPDATE_HIGHLIGHTING",
                  enabled: isEnabled,
                  stashedUrls: allUrls,
                })
                .catch((e) =>
                  console.warn(
                    `BG: Error sending highlight update to tab ${t.id} after context menu stash: ${e.message}`
                  )
                );
            }
          });
        }
      }
    } catch (error) {
      console.error("BG: Error stashing/updating tab via context menu:", error);
      // TODO: How to notify user of failure? Badge text?
    }
  } else if (info.menuItemId === "markStashedTabConsumed") {
    console.log(
      `BG: Handling 'markStashedTabConsumed' for URL: ${originalInfo.url}`
    );
    try {
      // *** Use imported function from db.js ***
      const updatedCount = await updateStashItemConsumedDB(
        originalInfo.url,
        true
      ); // Mark as true (consumed)
      if (updatedCount > 0) {
        console.log(
          `BG: Marked ${updatedCount} stashed item(s) as consumed for URL: ${originalInfo.url}`
        );
        // Send message to sidebar if open
        chrome.runtime.sendMessage({ action: "stashUpdated" }).catch((err) => {
          if (!err.message.includes("Receiving end does not exist")) {
            console.error("BG: Error sending stashUpdated message:", err);
          } else {
            console.log("BG: Sidebar not open, stashUpdated message not sent.");
          }
        });
      } else {
        console.log(
          `BG: No unconsumed stashed items found for URL: ${originalInfo.url}`
        );
        // TODO: Notify user?
      }
    } catch (error) {
      console.error(
        "BG: Error marking stashed tab as consumed via context menu:",
        error
      );
      // TODO: Notify user?
    }
  }
});

// --- Other Background Logic ---
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

// Listener for messages from content scripts or other parts of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle request from content script for initial highlight state
  if (message.type === "GET_INITIAL_HIGHLIGHT_STATE") {
    console.log(
      "BG: Received GET_INITIAL_HIGHLIGHT_STATE request from content script in tab:",
      sender.tab?.id
    );
    // Use an async IIFE to handle the async operations
    (async () => {
      try {
        const storageKey = "stashHighlightEnabled"; // Defined in stash_ui.js
        const storageResult = await chrome.storage.local.get(storageKey);
        const isEnabled = !!storageResult[storageKey];
        let stashedUrls = [];
        if (isEnabled) {
          // Fetch URLs only if highlighting is enabled
          stashedUrls = await getAllStashUrlsDB(); // Use imported function
          console.log(
            `BG: Fetched ${stashedUrls.length} URLs for initial state (Highlighting enabled).`
          );
        } else {
          console.log(
            "BG: Highlighting disabled, sending empty URL list for initial state."
          );
        }
        // Send the response back to the content script
        sendResponse({ enabled: isEnabled, stashedUrls: stashedUrls });
        console.log("BG: Sent initial highlight state to content script:", {
          enabled: isEnabled,
          count: stashedUrls.length,
        });
      } catch (error) {
        console.error("BG: Error getting initial highlight state:", error);
        // Send a default response in case of error
        sendResponse({ enabled: false, stashedUrls: [] });
      }
    })();
    // Return true to indicate that sendResponse will be called asynchronously
    return true;
  }

  // Handle other message types if needed
  // ...

  // Return false or undefined if not handling the message asynchronously
});

console.log("BG: Background service worker started/restarted.");
