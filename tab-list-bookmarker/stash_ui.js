// stash_ui.js
import {
  setStatusMessage as setStashStatusMessage,
  getOriginalTabInfo,
  debounce,
} from "./utils.js";
import {
  stashOrUpdateItemDB,
  getAllStashItemsDB,
  updateStashItemConsumedDB,
  getAllStashUrlsDB, // Import new DB function to get only URLs
} from "./db.js"; // Make sure db.js exports getAllStashUrlsDB

// --- Constants ---
const HIGHLIGHT_STORAGE_KEY = "stashHighlightEnabled";

// --- Element References ---
const stashCurrentTabBtn = document.getElementById("stash-current-tab-btn");
const markConsumedBtn = document.getElementById("mark-consumed-btn");
const stashStatusMessageElement = document.getElementById(
  "stash-status-message"
);
const stashSearchInput = document.getElementById("stash-search");
const stashSortSelect = document.getElementById("stash-sort");
const stashListElement = document.getElementById("stash-list");
const stashFilterSelect = document.getElementById("stash-filter");
const highlightToggleButton = document.getElementById("highlight-toggle-btn"); // New button

// --- Highlight State ---
let isHighlightingEnabled = false;

// --- Stash Actions ---
async function handleStashCurrentTabClick() {
  setStashStatusMessage(stashStatusMessageElement, "Stashing...");
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab || !activeTab.url) {
      // ... (rest of the function remains the same)
      setStashStatusMessage(
        stashStatusMessageElement,
        "No active tab found or tab has no URL.",
        true
      );
      return;
    }
    if (
      activeTab.url.startsWith("chrome://") ||
      activeTab.url.startsWith("chrome-extension://")
    ) {
      setStashStatusMessage(
        stashStatusMessageElement,
        "Cannot stash internal Chrome pages.",
        true
      );
      return;
    }

    const originalInfo = getOriginalTabInfo(activeTab.url, activeTab.title);
    const itemData = {
      title: originalInfo.title || originalInfo.url,
      url: originalInfo.url,
    };
    const result = await stashOrUpdateItemDB(itemData); // Use DB function

    if (result.action === "added") {
      setStashStatusMessage(
        stashStatusMessageElement,
        `Stashed: ${itemData.title.substring(0, 50)}...`
      );
    } else if (result.action === "updated") {
      setStashStatusMessage(
        stashStatusMessageElement,
        `Updated stash: ${itemData.title.substring(0, 50)}... (Count: ${
          result.count
        })`
      );
    }
    await renderStashList(); // Refresh list
    await updateHighlightingOnActiveTab(); // Update highlighting if enabled
  } catch (error) {
    console.error("Error stashing current tab:", error);
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error stashing tab.",
      true
    );
  }
}

async function handleMarkConsumedClick() {
  setStashStatusMessage(stashStatusMessageElement, "Checking current tab...");
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab || !activeTab.url) {
      // ... (rest of the function remains the same)
      setStashStatusMessage(
        stashStatusMessageElement,
        "No active tab found or tab has no URL.",
        true
      );
      return;
    }

    const originalInfo = getOriginalTabInfo(activeTab.url, activeTab.title);
    const updatedCount = await updateStashItemConsumedDB(
      originalInfo.url,
      true
    ); // Use DB function

    if (updatedCount > 0) {
      setStashStatusMessage(
        stashStatusMessageElement,
        `Marked "${originalInfo.title.substring(0, 50)}..." as consumed.`
      );
      await renderStashList();
      await updateHighlightingOnActiveTab(); // Update highlighting if enabled
    } else {
      setStashStatusMessage(
        stashStatusMessageElement,
        "Current tab URL not found in stash or already consumed."
      );
    }
  } catch (error) {
    console.error("Error marking tab as consumed:", error);
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error marking tab as consumed.",
      true
    );
  }
}

// --- Stash List Rendering ---
export async function renderStashList() {
  try {
    stashListElement.innerHTML = "<p>Loading stashed items...</p>";
    let items = await getAllStashItemsDB(); // Use DB function

    // --- Filtering ---
    // Filter by Consumed Status
    const filterValue = stashFilterSelect.value;
    if (filterValue === "unread") {
      items = items.filter((item) => !item.consumed);
    }
    // Filter by Search Term
    const searchTerm = stashSearchInput.value.toLowerCase().trim();
    if (searchTerm) {
      items = items.filter(
        (item) =>
          (item.title && item.title.toLowerCase().includes(searchTerm)) ||
          (item.url && item.url.toLowerCase().includes(searchTerm))
      );
    }

    // --- Sorting ---
    const sortValue = stashSortSelect.value;
    items.sort((a, b) => {
      switch (sortValue) {
        case "dateAsc":
          return new Date(a.dateCreated) - new Date(b.dateCreated);
        case "titleAsc":
          return (a.title || "").localeCompare(b.title || "");
        case "titleDesc":
          return (b.title || "").localeCompare(a.title || "");
        case "consumedTrue": // Read first
          return (a.consumed ? 0 : 1) - (b.consumed ? 0 : 1); // Sort false (unread) before true (read)
        case "consumedFalse": // Unread first
          return (a.consumed ? 1 : 0) - (b.consumed ? 1 : 0); // Sort true (read) after false (unread)
        case "dateDesc":
        default:
          return new Date(b.dateCreated) - new Date(a.dateCreated);
      }
    });

    // --- Rendering ---
    stashListElement.innerHTML = "";
    if (items.length === 0) {
      stashListElement.innerHTML = "<p>No stashed items match filters.</p>";
      return;
    }

    // Build list items (same as before)
    items.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "stash-item";
      itemDiv.dataset.id = item.id; // Keep ID for potential future actions

      // Status Indicator
      const statusSpan = document.createElement("span");
      statusSpan.className = "stash-item-status";
      if (item.consumed) {
        statusSpan.classList.add("consumed");
        statusSpan.textContent = "Read";
        statusSpan.title = `Consumed: ${
          item.dateConsumed
            ? new Date(item.dateConsumed).toLocaleString()
            : "N/A"
        }`;
      } else {
        statusSpan.classList.add("unread");
        statusSpan.textContent = "Unread";
      }
      itemDiv.appendChild(statusSpan);

      // Main Info (Title + URL)
      const infoDiv = document.createElement("div");
      infoDiv.className = "stash-item-info";
      const titleLink = document.createElement("a");
      titleLink.className = "stash-item-title";
      titleLink.textContent = item.title || item.url;
      titleLink.href = item.url;
      titleLink.title = item.url;
      titleLink.target = "_blank"; // Open in new tab
      infoDiv.appendChild(titleLink);
      const urlSpan = document.createElement("span");
      urlSpan.className = "stash-item-url";
      try {
        urlSpan.textContent = new URL(item.url).hostname;
      } catch {
        urlSpan.textContent = item.url; // Fallback for invalid URLs
      }
      infoDiv.appendChild(urlSpan);
      itemDiv.appendChild(infoDiv);

      // Stash Count
      const countSpan = document.createElement("span");
      countSpan.className = "stash-item-count";
      countSpan.textContent = `(${item.stashCount || 1})`;
      countSpan.title = `Stashed ${item.stashCount || 1} time(s)`;
      itemDiv.appendChild(countSpan);

      // Date Stashed
      const dateSpan = document.createElement("span");
      dateSpan.className = "stash-item-date";
      dateSpan.textContent = new Date(item.dateCreated).toLocaleDateString();
      dateSpan.title = `Last Stashed: ${new Date(
        item.dateCreated
      ).toLocaleString()}`;
      itemDiv.appendChild(dateSpan);

      stashListElement.appendChild(itemDiv);
    });
  } catch (error) {
    console.error("Error rendering stash list:", error);
    stashListElement.innerHTML = "<p>Error loading stashed items.</p>";
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error loading stash.",
      true
    );
  }
}

// Debounced version of renderStashList for search input
const debouncedRenderStashList = debounce(renderStashList, 300);

// --- Link Highlighting Logic ---

// Function to load the highlight state from storage
async function loadHighlightState() {
  try {
    const result = await chrome.storage.local.get(HIGHLIGHT_STORAGE_KEY);
    isHighlightingEnabled = !!result[HIGHLIGHT_STORAGE_KEY]; // Default to false if not set
    updateHighlightButtonState();
    // Optionally trigger initial highlight on load if enabled
    // await updateHighlightingOnActiveTab();
  } catch (error) {
    console.error("Error loading highlight state:", error);
    isHighlightingEnabled = false; // Default to false on error
    updateHighlightButtonState();
  }
}

// Function to save the highlight state to storage
async function saveHighlightState() {
  try {
    await chrome.storage.local.set({
      [HIGHLIGHT_STORAGE_KEY]: isHighlightingEnabled,
    });
  } catch (error) {
    console.error("Error saving highlight state:", error);
  }
}

// Function to update the button's appearance
function updateHighlightButtonState() {
  if (highlightToggleButton) {
    highlightToggleButton.classList.toggle("active", isHighlightingEnabled);
    highlightToggleButton.textContent = isHighlightingEnabled
      ? "Highlighting On"
      : "Highlight Links";
    highlightToggleButton.title = isHighlightingEnabled
      ? "Click to disable highlighting stashed links on the current page"
      : "Click to enable highlighting stashed links on the current page";
  }
}

// Function to send update message to the active tab's content script
async function updateHighlightingOnActiveTab() {
  let stashedUrls = [];
  if (isHighlightingEnabled) {
    try {
      // Fetch only the URLs needed for highlighting
      stashedUrls = await getAllStashUrlsDB();
    } catch (error) {
      console.error("Error fetching stashed URLs for highlighting:", error);
      // Proceed with highlighting disabled or empty list
      isHighlightingEnabled = false; // Disable if URLs can't be fetched
      updateHighlightButtonState();
      await saveHighlightState(); // Save disabled state
      stashedUrls = []; // Ensure empty list is sent
    }
  }

  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (
      activeTab &&
      activeTab.id &&
      activeTab.url &&
      !activeTab.url.startsWith("chrome") &&
      !activeTab.url.startsWith("about:")
    ) {
      console.log(
        `Sending highlight update to tab ${activeTab.id}: enabled=${isHighlightingEnabled}, urlCount=${stashedUrls.length}`
      );
      await chrome.tabs.sendMessage(activeTab.id, {
        type: "UPDATE_HIGHLIGHTING",
        enabled: isHighlightingEnabled,
        stashedUrls: stashedUrls, // Send the array of URLs
      });
    } else {
      console.log("No suitable active tab found to send highlight update.");
    }
  } catch (error) {
    // Handle errors, e.g., if the content script isn't ready or the tab is protected
    if (
      error.message.includes("Could not establish connection") ||
      error.message.includes("Receiving end does not exist")
    ) {
      console.warn(
        `Could not send highlight update to active tab. Content script might not be injected or ready on this page (${error.message})`
      );
    } else {
      console.error("Error sending highlight update message:", error);
    }
  }
}

// Event listener for the toggle button
async function handleHighlightToggleClick() {
  isHighlightingEnabled = !isHighlightingEnabled;
  updateHighlightButtonState();
  await saveHighlightState();
  await updateHighlightingOnActiveTab();
}

// --- Setup ---
export async function setupStashUI() {
  // Existing listeners
  stashCurrentTabBtn.addEventListener("click", handleStashCurrentTabClick);
  markConsumedBtn.addEventListener("click", handleMarkConsumedClick);
  stashSearchInput.addEventListener("input", debouncedRenderStashList);
  stashSortSelect.addEventListener("change", renderStashList);
  stashFilterSelect.addEventListener("change", renderStashList);

  // New listener for highlight toggle
  highlightToggleButton.addEventListener("click", handleHighlightToggleClick);

  // Load initial highlight state
  await loadHighlightState();

  // Initial render (calls renderStashList)
  // renderStashList(); // Called from sidebar.js

  // Send initial highlight state when the sidebar opens/loads
  // We do this here after loading the state, rather than in loadHighlightState,
  // to ensure the stash list might also be ready if needed.
  await updateHighlightingOnActiveTab();
}

// Make sure to export renderStashList if it's called from sidebar.js
// export { renderStashList }; // Already exported at the top
