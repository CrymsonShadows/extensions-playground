// background.js

import { getAllStashUrlsDB } from "./db.js"; // Assuming db.js exports this
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  URL_INDEX,
  DATE_INDEX,
  CONSUMED_INDEX,
  TITLE_INDEX,
  STASH_COUNT_INDEX,
} from "./constants.js";

// --- IndexedDB Setup ---
function openDB() {
  return new Promise((resolve, reject) => {
    // console.log(`BG: Opening database ${DB_NAME} version ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("BG: IndexedDB error:", request.error);
      reject("IndexedDB error: " + request.error);
    };

    request.onsuccess = (event) => {
      // console.log("BG: Database opened successfully");
      resolve(event.target.result);
    };

    request.onupgradeneeded = (event) => {
      console.log(
        "BG: Database upgrade needed. Old version:",
        event.oldVersion,
        "New version:",
        event.newVersion
      );
      const db = event.target.result;
      const transaction = event.target.transaction;
      let store;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log("BG: Creating object store:", STORE_NAME);
        store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      } else {
        store = transaction.objectStore(STORE_NAME);
        console.log("BG: Object store already exists.");
      }

      // Handle URL Index Uniqueness (Upgrade from v2 to v3)
      if (event.oldVersion < 3) {
        console.log("BG: Upgrading to v3: Enforcing unique URL index.");
        // *** Robust Migration Steps (Mirrors db.js) ***
        const getAllRequest = store.getAll();
        getAllRequest.onerror = (e) => {
          console.error(
            "BG: Migration Error: Failed to read existing data.",
            e.target.error
          );
          transaction.abort();
          reject("Migration failed: Cannot read data.");
        };
        getAllRequest.onsuccess = (e) => {
          const allItems = e.target.result;
          console.log(`BG: Migration: Read ${allItems.length} items.`);
          const uniqueItemsMap = new Map();
          allItems.forEach((item) => {
            if (!uniqueItemsMap.has(item.url)) {
              item.stashCount = item.stashCount || 1;
              uniqueItemsMap.set(item.url, item);
            } else {
              console.log(
                `BG: Migration: Duplicate URL (${item.url}), discarding ID: ${item.id}`
              );
            }
          });
          const itemsToKeep = Array.from(uniqueItemsMap.values());
          console.log(
            `BG: Migration: ${itemsToKeep.length} unique items identified.`
          );
          const clearRequest = store.clear();
          clearRequest.onerror = (e_clear) => {
            console.error(
              "BG: Migration Error: Failed to clear store.",
              e_clear.target.error
            );
            transaction.abort();
            reject("Migration failed: Cannot clear store.");
          };
          clearRequest.onsuccess = (e_clear) => {
            console.log("BG: Migration: Store cleared.");
            console.log("BG: Migration: Repopulating store...");
            let itemsAdded = 0;
            const totalItems = itemsToKeep.length;
            const handleAddSuccess = () => {
              itemsAdded++;
              if (itemsAdded === totalItems) finishMigration();
            };
            const handleAddError = (e_add, item) => {
              console.error(
                "BG: Migration Error: Failed to add unique item.",
                item,
                e_add.target.error
              );
              transaction.abort();
              reject("Migration failed: Repopulation error.");
            };
            const finishMigration = () => {
              console.log("BG: Migration: Store repopulated.");
              try {
                if (store.indexNames.contains(URL_INDEX)) {
                  console.log("BG: Migration: Deleting old URL index.");
                  store.deleteIndex(URL_INDEX);
                }
                console.log("BG: Migration: Creating unique URL index.");
                store.createIndex(URL_INDEX, "url", { unique: true });
                console.log("BG: Migration: Unique URL index created.");
              } catch (indexError) {
                console.error(
                  "BG: Migration Error: Failed to update URL index.",
                  indexError
                );
                transaction.abort();
                reject("Migration failed: Index creation error.");
              }
            };

            if (totalItems === 0) {
              console.log("BG: Migration: No unique items to repopulate.");
              finishMigration();
            } else {
              itemsToKeep.forEach((item) => {
                delete item.id; // Remove old ID before adding
                const addRequest = store.add(item);
                addRequest.onsuccess = handleAddSuccess;
                addRequest.onerror = (e_add) => handleAddError(e_add, item);
              });
            }
          }; // End clearRequest.onsuccess
        }; // End getAllRequest.onsuccess
      } // End of v3 upgrade block

      // Create other indexes if they don't exist
      if (!store.indexNames.contains(DATE_INDEX))
        store.createIndex(DATE_INDEX, "dateCreated", { unique: false });
      if (!store.indexNames.contains(CONSUMED_INDEX))
        store.createIndex(CONSUMED_INDEX, "consumed", { unique: false });
      if (!store.indexNames.contains(TITLE_INDEX))
        store.createIndex(TITLE_INDEX, "title", { unique: false });
      if (!store.indexNames.contains(STASH_COUNT_INDEX))
        store.createIndex(STASH_COUNT_INDEX, "stashCount", { unique: false });

      console.log("BG: Database upgrade process finished in onupgradeneeded.");
    }; // End onupgradeneeded
  });
} // End openDB

// Stash/Update function (mirrors db.js)
async function stashOrUpdateItemDB(itemData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(URL_INDEX);
    const getRequest = index.get(itemData.url);

    getRequest.onerror = (event) =>
      reject("BG: Error querying stash: " + getRequest.error);

    getRequest.onsuccess = (event) => {
      const existingItem = event.target.result;
      let request;
      let actionResult; // To store result before closing transaction

      if (existingItem) {
        // console.log(`BG: Found existing item for URL: ${itemData.url}. Updating.`);
        existingItem.title = itemData.title; // Update title
        existingItem.dateCreated = new Date().toISOString(); // Update timestamp
        existingItem.stashCount = (existingItem.stashCount || 0) + 1; // Increment count
        existingItem.consumed = false; // Mark as unread on re-stash
        delete existingItem.dateConsumed; // Remove consumed date
        request = store.put(existingItem);
        actionResult = {
          action: "updated",
          id: existingItem.id,
          count: existingItem.stashCount,
        };
      } else {
        // console.log(`BG: No existing item found for URL: ${itemData.url}. Adding new.`);
        const newItem = {
          ...itemData,
          dateCreated: new Date().toISOString(),
          consumed: false,
          stashCount: 1, // Initial count
        };
        request = store.add(newItem);
        // We need the ID, so we resolve inside onsuccess for add
        request.onsuccess = (event_add) => {
          resolve({ action: "added", id: event_add.target.result, count: 1 });
        };
        request.onerror = (event_add) => {
          console.error("BG: Error adding item:", request.error);
          // Handle ConstraintError specifically for retrying, as before
          if (request.error.name === "ConstraintError") {
            console.warn(
              `BG: ConstraintError adding item for URL ${itemData.url}. This might indicate a race condition.`
            );
            // Don't automatically retry here, let the caller handle it if needed
            reject("BG: Error adding item (Constraint): " + request.error);
          } else {
            reject("BG: Error adding item: " + request.error);
          }
        };
        // Don't resolve here for 'add', it's handled in request.onsuccess
        return; // Exit early for 'add' case
      }

      // For 'put' (update), resolve inside its onsuccess
      request.onsuccess = (event_put) => {
        resolve(actionResult);
      };
      request.onerror = (event_put) => {
        reject("BG: Error updating item: " + request.error);
      };
    }; // end getRequest.onsuccess

    transaction.oncomplete = () => {
      // console.log("BG: Stash/Update transaction completed.");
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("BG: Transaction error:", transaction.error);
      // Don't reject here if already rejected inside request.onerror
      // reject("BG: Transaction error: " + transaction.error);
      db.close(); // Ensure DB is closed on transaction error too
    };
  });
}

// Mark Consumed function (mirrors db.js)
async function markStashedUrlAsConsumed(urlToMark) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(URL_INDEX);
    const request = index.get(urlToMark);

    request.onerror = (event) =>
      reject("BG: Error querying stash for consumption: " + request.error);

    request.onsuccess = (event) => {
      const item = event.target.result;
      if (!item || item.consumed) {
        resolve(0); // Not found or already consumed
        return;
      }

      item.consumed = true;
      item.dateConsumed = new Date().toISOString();
      const putRequest = store.put(item);

      putRequest.onsuccess = () => {
        resolve(1); // Successfully updated one item
      };
      putRequest.onerror = (err) => {
        console.error(
          "BG: Error updating item to consumed:",
          item.id,
          putRequest.error
        );
        reject("BG: Error updating item: " + putRequest.error);
      };
    };

    transaction.oncomplete = () => db.close();
    transaction.onerror = (event) => {
      console.error(
        "BG: Transaction error marking consumed:",
        transaction.error
      );
      reject("BG: Transaction error marking consumed: " + transaction.error);
      db.close();
    };
  });
}

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
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
});

// --- Context Menu Click Handler ---
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.url || !tab.id) {
    console.warn("Context menu clicked without valid tab info.");
    return;
  }
  // Ignore internal pages
  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:")
  ) {
    console.log(
      "BG: Ignoring context menu click on internal/special page:",
      tab.url
    );
    return;
  }

  // Get original URL/Title (handles suspended tabs)
  let originalUrl = tab.url;
  let originalTitle = tab.title;
  // (Keep the suspended tab URL parsing logic as before)
  if (tab.url.startsWith("chrome-extension://") && tab.url.includes("url=")) {
    try {
      const urlObject = new URL(tab.url);
      const params = new URLSearchParams(urlObject.search);
      const tempUrl = params.get("url");
      const tempTitle = params.get("title");
      if (tempUrl) {
        originalUrl = tempUrl;
      }
      if (tempTitle) {
        originalTitle = tempTitle;
      } else if (tempUrl && !tempTitle) {
        try {
          const p = new URL(tempUrl);
          originalTitle = p.hostname + (p.pathname === "/" ? "" : p.pathname);
        } catch {
          originalTitle = tempUrl; // Fallback
        }
      }
    } catch (e) {
      console.warn("BG: Could not parse suspended URL:", tab.url, e);
    }
  }

  // --- Handle Stash Action ---
  if (info.menuItemId === "stashTab") {
    try {
      const itemData = {
        title: originalTitle || originalUrl, // Use URL as fallback title
        url: originalUrl,
      };
      const result = await stashOrUpdateItemDB(itemData);
      console.log(
        `BG: Stashed/Updated via context menu: ${itemData.title} (Action: ${result.action}, ID: ${result.id}, Count: ${result.count})`
      );

      // Send message to sidebar to refresh
      chrome.runtime.sendMessage({ action: "stashUpdated" }).catch((err) => {
        if (!err.message.includes("Receiving end does not exist")) {
          console.error("BG: Error sending stashUpdated message:", err);
        }
      });
    } catch (error) {
      console.error("BG: Error stashing/updating tab via context menu:", error);
    }
  }
  // --- Handle Mark Consumed Action ---
  else if (info.menuItemId === "markStashedTabConsumed") {
    try {
      const updateCount = await markStashedUrlAsConsumed(originalUrl);
      if (updateCount > 0) {
        console.log(
          `BG: Marked ${updateCount} stashed item(s) as consumed for URL: ${originalUrl}`
        );
        // Send message to sidebar to refresh
        chrome.runtime.sendMessage({ action: "stashUpdated" }).catch((err) => {
          if (!err.message.includes("Receiving end does not exist")) {
            console.error("BG: Error sending stashUpdated message:", err);
          }
        });
      } else {
        console.log(
          `BG: No unconsumed stashed items found for URL: ${originalUrl}`
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

// --- Other Background Logic ---
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// Listener for when the action icon is clicked (opens the sidebar)
chrome.action.onClicked.addListener((tab) => {
  // console.log("Toolbar icon clicked.");
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    console.warn("Action clicked on a tab without a windowId?");
  }
});

// --- NEW: Listener for Messages from Content/Sidebar ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_INITIAL_HIGHLIGHT_STATE") {
    console.log(
      "BG: Received GET_INITIAL_HIGHLIGHT_STATE request from content script."
    );
    // We need to get the current state (enabled status and URLs)
    // This requires async operations, so return true to keep the channel open
    (async () => {
      try {
        // 1. Get enabled state from storage
        const storageKey = "stashHighlightEnabled"; // Match stash_ui.js
        const storageResult = await chrome.storage.local.get(storageKey);
        const isEnabled = !!storageResult[storageKey];

        // 2. Get stashed URLs if enabled
        let stashedUrls = [];
        if (isEnabled) {
          // Use the DB function directly if available, otherwise might need another message
          // Assuming getAllStashUrlsDB is accessible here (imported)
          stashedUrls = await getAllStashUrlsDB();
          console.log(
            `BG: Fetched ${stashedUrls.length} URLs for initial state.`
          );
        }

        // 3. Send response back to content script
        sendResponse({
          enabled: isEnabled,
          stashedUrls: stashedUrls,
        });
        console.log("BG: Sent initial highlight state to content script:", {
          enabled: isEnabled,
          count: stashedUrls.length,
        });
      } catch (error) {
        console.error("BG: Error getting initial highlight state:", error);
        // Send back a default/error state if needed, or let it timeout
        sendResponse({ enabled: false, stashedUrls: [] });
      }
    })(); // Immediately invoke the async function

    return true; // Indicate asynchronous response
  }

  // Handle other messages if needed (like stashUpdated from context menu handler)
  if (message.action === "stashUpdated") {
    // This message is intended for the sidebar, background doesn't need to act on it
    // console.log("BG: Relaying stashUpdated message (or ignoring if sidebar handles it)");
  }

  // Return false if not handling the message asynchronously
  // return false; // Only return true for async responses
});

console.log("Background service worker started.");
