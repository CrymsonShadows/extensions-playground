// background.js

const DB_NAME = "TabStashDB";
const DB_VERSION = 1;
const STORE_NAME = "stashedTabs";

// --- IndexedDB Setup ---
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error("IndexedDB error:", request.error);
      reject("IndexedDB error: " + request.error);
    };

    request.onsuccess = (event) => {
      console.log("Database opened successfully");
      resolve(event.target.result);
    };

    // This event only runs if the database version changes
    request.onupgradeneeded = (event) => {
      console.log("Database upgrade needed");
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log("Creating object store:", STORE_NAME);
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
        // Create indexes for searching/sorting
        store.createIndex("urlIndex", "url", { unique: false }); // Index by URL
        store.createIndex("dateCreatedIndex", "dateCreated", { unique: false });
        store.createIndex("consumedIndex", "consumed", { unique: false });
        store.createIndex("titleIndex", "title", { unique: false }); // For sorting by title
        console.log("Object store and indexes created");
      }
    };
  });
}

// Function to add an item to the stash
async function addStashItem(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.add(item);

    request.onsuccess = (event) => {
      console.log("Item added to stash with ID:", event.target.result);
      resolve(event.target.result); // Resolve with the new ID
    };

    request.onerror = (event) => {
      console.error("Error adding item to stash:", request.error);
      reject("Error adding item: " + request.error);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// Function to check if a URL exists in the stash and mark it consumed
async function markStashedUrlAsConsumed(urlToMark) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index("urlIndex");
    const request = index.getAll(urlToMark); // Get all entries matching the URL

    request.onsuccess = (event) => {
      const results = event.target.result;
      if (results && results.length > 0) {
        let updateCount = 0;
        results.forEach((item) => {
          // Only update if not already consumed
          if (!item.consumed) {
            item.consumed = true;
            item.dateConsumed = new Date().toISOString(); // Optional: add consumed date
            const updateRequest = store.put(item);
            updateRequest.onsuccess = () => {
              updateCount++;
              console.log("Marked item as consumed:", item.id);
              // Resolve once the last update is processed (or immediately if only one)
              if (updateCount === results.filter((i) => !i.consumed).length) {
                // Check against initially non-consumed items
                resolve(updateCount);
              }
            };
            updateRequest.onerror = (err) => {
              console.error(
                "Error updating item:",
                item.id,
                updateRequest.error
              );
              // Potentially reject or just log? For now, log and continue.
              if (updateCount === results.filter((i) => !i.consumed).length) {
                // Check if this was the last attempt
                resolve(updateCount); // Resolve with potentially partial success
              }
            };
          }
        });
        // If all items were already consumed
        if (results.every((i) => i.consumed)) {
          resolve(0); // Indicate nothing was updated
        }
      } else {
        resolve(0); // No matching item found
      }
    };

    request.onerror = (event) => {
      console.error("Error querying stash by URL:", request.error);
      reject("Error querying stash: " + request.error);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

// --- Context Menu Setup ---
chrome.runtime.onInstalled.addListener(() => {
  // Context menu item to stash the current tab
  chrome.contextMenus.create({
    id: "stashTab",
    title: "Stash Tab",
    contexts: ["page"], // Show only when right-clicking on a page
  });

  // Context menu item to mark a stashed tab as consumed
  // Note: We can't dynamically show/hide based on DB content easily here.
  // It's simpler to always show it and handle the logic in the click handler.
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

  // Basic check to avoid acting on internal pages where it might not make sense
  if (
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://")
  ) {
    console.log("Ignoring context menu click on internal page:", tab.url);
    return;
  }

  // --- Get Original Info (Simplified version for background) ---
  // Note: Ideally, share this logic with sidebar.js via a utility script
  let originalUrl = tab.url;
  let originalTitle = tab.title;
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
        // Fallback title if needed
        try {
          const p = new URL(tempUrl);
          originalTitle = p.hostname + (p.pathname === "/" ? "" : p.pathname);
        } catch {
          originalTitle = tempUrl;
        }
      }
    } catch (e) {
      console.warn("BG: Could not parse suspended URL:", tab.url, e);
    }
  }

  if (info.menuItemId === "stashTab") {
    try {
      const newItem = {
        title: originalTitle || originalUrl, // Use original title/url
        url: originalUrl, // Use original URL
        dateCreated: new Date().toISOString(),
        consumed: false,
        // Add other metadata if needed, e.g., originalTabId: tab.id (less useful long-term)
      };
      await addStashItem(newItem);
      // Optional: Send message to sidebar to refresh list if open?
      // chrome.runtime.sendMessage({ action: "refreshStashList" });
      console.log("Stashed tab via context menu:", newItem.title);
    } catch (error) {
      console.error("Error stashing tab via context menu:", error);
      // Optional: Notify user of error?
    }
  } else if (info.menuItemId === "markStashedTabConsumed") {
    try {
      const updateCount = await markStashedUrlAsConsumed(originalUrl);
      if (updateCount > 0) {
        console.log(
          `Marked ${updateCount} stashed item(s) as consumed for URL: ${originalUrl}`
        );
        // Optional: Send message to sidebar to refresh list if open?
        // chrome.runtime.sendMessage({ action: "refreshStashList" });
      } else {
        console.log(
          `No unconsumed stashed items found for URL: ${originalUrl}`
        );
        // Optional: Notify user? e.g., via chrome.scripting.executeScript to show a temporary message
        // This requires the "scripting" permission and host permissions or activeTab.
      }
    } catch (error) {
      console.error(
        "Error marking stashed tab as consumed via context menu:",
        error
      );
    }
  }
});

// --- Other Background Logic ---
// Ensure the side panel opens when the toolbar icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// Optional: Action click listener (often redundant with setPanelBehavior)
chrome.action.onClicked.addListener((tab) => {
  console.log("Toolbar icon clicked.");
  chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log("Background service worker started.");
