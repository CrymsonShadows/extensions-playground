const QUEUE_KEY = "tabQueue";
const CONTEXT_MENU_ID = "addToTabQueue";

// --- Initialization ---

// Function to get the queue from storage
async function getQueue() {
  const result = await chrome.storage.local.get([QUEUE_KEY]);
  return result[QUEUE_KEY] || []; // Return empty array if not found
}

// Function to save the queue to storage
async function saveQueue(queue) {
  await chrome.storage.local.set({ [QUEUE_KEY]: queue });
}

// Create context menu item on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: "Add link to Tab Queue",
    contexts: ["link"], // Show only when right-clicking a link
  });
  console.log("Tab Queue context menu created.");
  // Initialize storage if it doesn't exist
  getQueue().then((queue) => {
    if (!Array.isArray(queue)) {
      saveQueue([]);
      console.log("Initialized empty tab queue in storage.");
    }
  });
});

// --- Event Listeners ---

// Listen for context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.linkUrl) {
    try {
      let queue = await getQueue();
      const urlToAdd = info.linkUrl;

      // Remove existing entry if present (to move it to the top)
      queue = queue.filter((item) => item !== urlToAdd);

      // Add the new URL to the beginning (top) of the queue
      queue.unshift(urlToAdd);

      await saveQueue(queue);
      console.log(`Added/Moved ${urlToAdd} to queue.`);

      // Optional: Open the side panel automatically when adding an item
      // Consider if this is desired user experience
      // if (tab?.windowId) {
      //   chrome.sidePanel.open({ windowId: tab.windowId });
      // }
    } catch (error) {
      console.error("Error handling context menu click:", error);
    }
  }
});

// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background: Received message:", message); // Log incoming message
  if (message.action === "openTab" && message.url) {
    (async () => {
      try {
        // 1. Find the currently active tab
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });

        // 2. Open the new tab next to the active tab
        const newTab = await chrome.tabs.create({
          url: message.url,
          index: activeTab ? activeTab.index + 1 : undefined, // Place right after active tab
          active: true, // Make the new tab active
        });
        console.log(`Opened ${message.url} in new tab ${newTab.id}`);

        // 3. Remove the URL from the queue
        let queue = await getQueue();
        queue = queue.filter((item) => item !== message.url);
        await saveQueue(queue);
        console.log(`Removed ${message.url} from queue.`);

        // Optional: Send confirmation back to side panel if needed
        // sendResponse({ success: true });
      } catch (error) {
        console.error("Error opening tab from queue:", error);
        // Optional: Send error back to side panel if needed
        // sendResponse({ success: false, error: error.message });
      }
    })();
    // Indicate that the response will be sent asynchronously (important!)
    return false;
  }

  if (message.action === "getQueue") {
    console.log("Background: Handling getQueue action.");
    getQueue()
      .then((queue) => {
        console.log(
          `Background: Successfully fetched queue: ${JSON.stringify(queue)}`
        );
        console.log("Background: Sending queue response back to side panel.");
        sendResponse({ queue: queue });
        console.log("Background: Response sent."); // Log after sending
      })
      .catch((error) => {
        // Catch potential errors from getQueue() itself
        console.error(
          "Background: Error fetching queue inside getQueue().then():",
          error
        );
        // Optionally send an error response back
        // sendResponse({ error: "Failed to fetch queue" });
      });

    // Return true MUST be synchronous in the listener callback
    // to keep the message channel open for the async operation.
    console.log(
      "Background: Returning true to keep channel open for getQueue."
    );
    return true;
  }

  return false;
});

// Optional: Handle clicking the extension action icon to open the side panel
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    console.error("Could not get window ID to open side panel.");
  }
});

// Keep the service worker alive when the side panel is open
// This might be necessary if operations take time or rely on listeners
// Note: This is a common pattern, but evaluate if strictly needed for your use case.
let sidePanelPort = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidePanel") {
    sidePanelPort = port;
    console.log("Side panel connected.");
    port.onDisconnect.addListener(() => {
      sidePanelPort = null;
      console.log("Side panel disconnected.");
    });
    // Optional: Handle messages received directly via the port if needed
    // port.onMessage.addListener((msg) => { ... });
  }
});
