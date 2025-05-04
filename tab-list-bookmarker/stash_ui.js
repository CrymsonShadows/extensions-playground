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
  getAllStashUrlsDB,
  deleteStashItemDB, // Import the new delete function
} from "./db.js"; // Make sure db.js exports getAllStashUrlsDB and deleteStashItemDB

// --- Constants ---
const HIGHLIGHT_STORAGE_KEY = "stashHighlightEnabled";
const ITEMS_PER_PAGE = 25; // Number of items to load per "page" for infinite scroll
const SCROLL_THRESHOLD = 100; // Pixels from bottom to trigger loading more

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
const highlightToggleButton = document.getElementById("highlight-toggle-btn");

// --- State Variables ---
let isHighlightingEnabled = false;
let allStashedItems = []; // Holds all items matching current filters/sort
let currentPage = 1; // Current page number for infinite scroll
let isLoadingMore = false; // Flag to prevent multiple simultaneous loads

// --- Stash Actions ---
async function handleStashCurrentTabClick() {
  setStashStatusMessage(stashStatusMessageElement, "Stashing...");
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab || !activeTab.url) {
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
    const result = await stashOrUpdateItemDB(itemData);

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
    await renderStashList(); // Refresh list completely
    await updateHighlightingOnActiveTab();
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
    );

    if (updatedCount > 0) {
      setStashStatusMessage(
        stashStatusMessageElement,
        `Marked "${originalInfo.title.substring(0, 50)}..." as consumed.`
      );
      // Update the item in the list visually without full re-render if possible
      const itemDiv = stashListElement.querySelector(
        `[data-url="${CSS.escape(originalInfo.url)}"]`
      );
      if (itemDiv) {
        const statusSpan = itemDiv.querySelector(".stash-item-status");
        if (statusSpan && !statusSpan.classList.contains("consumed")) {
          statusSpan.classList.remove("unread");
          statusSpan.classList.add("consumed");
          statusSpan.textContent = "Read";
          statusSpan.title = `Consumed: ${new Date().toLocaleString()}`;
          // Update the underlying data in allStashedItems as well
          const itemIndex = allStashedItems.findIndex(
            (item) => item.url === originalInfo.url
          );
          if (itemIndex !== -1) {
            allStashedItems[itemIndex].consumed = true;
            allStashedItems[itemIndex].dateConsumed = new Date().toISOString();
          }
        }
      } else {
        await renderStashList(); // Fallback to full re-render if item not found
      }
      await updateHighlightingOnActiveTab();
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

// --- Stash List Rendering & Infinite Scroll ---

/**
 * Appends a "page" of items to the stash list element.
 */
function appendItemsPage() {
  if (isLoadingMore) return; // Avoid concurrent loading

  isLoadingMore = true;
  // Remove existing loading indicator if present
  const existingLoader = stashListElement.querySelector(".loading-indicator");
  if (existingLoader) existingLoader.remove();

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const itemsToRender = allStashedItems.slice(startIndex, endIndex);

  if (itemsToRender.length === 0 && currentPage === 1) {
    stashListElement.innerHTML = "<p>No stashed items match filters.</p>";
    isLoadingMore = false;
    return;
  }

  itemsToRender.forEach((item) => renderSingleStashItem(item));

  currentPage++;
  isLoadingMore = false;

  // Add loading indicator if there are more items to load
  if (endIndex < allStashedItems.length) {
    const loader = document.createElement("div");
    loader.className = "loading-indicator";
    loader.textContent = "Loading more...";
    stashListElement.appendChild(loader);
  }
}

/**
 * Renders a single stash item and appends it to the list.
 * @param {object} item - The stash item object from the database.
 */
function renderSingleStashItem(item) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "stash-item";
  itemDiv.dataset.id = item.id; // Use ID for deletion
  itemDiv.dataset.url = item.url; // Store URL for potential updates

  // Status Indicator
  const statusSpan = document.createElement("span");
  statusSpan.className = "stash-item-status";
  if (item.consumed) {
    statusSpan.classList.add("consumed");
    statusSpan.textContent = "Read";
    statusSpan.title = `Consumed: ${
      item.dateConsumed ? new Date(item.dateConsumed).toLocaleString() : "N/A"
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
  titleLink.target = "_blank";
  infoDiv.appendChild(titleLink);
  const urlSpan = document.createElement("span");
  urlSpan.className = "stash-item-url";
  try {
    urlSpan.textContent = new URL(item.url).hostname;
  } catch {
    urlSpan.textContent = item.url;
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

  // --- NEW: Remove Button ---
  const removeBtn = document.createElement("button");
  removeBtn.className = "stash-item-remove-btn";
  removeBtn.textContent = "×"; // Use '×' symbol
  removeBtn.title = "Remove this item from stash";
  removeBtn.dataset.itemId = item.id; // Set item ID for the handler
  itemDiv.appendChild(removeBtn);
  // --- End Remove Button ---

  stashListElement.appendChild(itemDiv);
}

/**
 * Fetches, filters, sorts, and initiates the rendering of the stash list.
 */
export async function renderStashList() {
  try {
    stashListElement.innerHTML = "<p>Loading stashed items...</p>"; // Initial loading message
    let items = await getAllStashItemsDB();

    // --- Filtering ---
    const filterValue = stashFilterSelect.value;
    if (filterValue === "unread") {
      items = items.filter((item) => !item.consumed);
    }
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
          // Sort consumed (true) items before unread (false) items
          return a.consumed === b.consumed ? 0 : a.consumed ? -1 : 1;
        case "consumedFalse": // Unread first
          // Sort unread (false) items before consumed (true) items
          return a.consumed === b.consumed ? 0 : a.consumed ? 1 : -1;
        case "dateDesc":
        default:
          return new Date(b.dateCreated) - new Date(a.dateCreated);
      }
    });

    // --- Store filtered/sorted list and start rendering ---
    allStashedItems = items; // Store the full list
    currentPage = 1; // Reset page number
    stashListElement.innerHTML = ""; // Clear previous content/loading message
    appendItemsPage(); // Render the first page
  } catch (error) {
    console.error("Error rendering stash list:", error);
    allStashedItems = []; // Clear data on error
    stashListElement.innerHTML = "<p>Error loading stashed items.</p>";
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error loading stash.",
      true
    );
  }
}

// Debounced version for search/filter/sort changes
const debouncedRenderStashList = debounce(renderStashList, 350);

// Scroll event handler for infinite scrolling
const handleScroll = debounce(() => {
  if (isLoadingMore) return;

  const nearBottom =
    stashListElement.scrollHeight -
      stashListElement.scrollTop -
      stashListElement.clientHeight <
    SCROLL_THRESHOLD;

  if (
    nearBottom &&
    (currentPage - 1) * ITEMS_PER_PAGE < allStashedItems.length
  ) {
    // console.log("Near bottom, loading more...");
    appendItemsPage();
  }
}, 100); // Debounce scroll checks slightly

// --- Remove Stashed Item Logic ---
async function handleRemoveItemClick(event) {
  if (!event.target.classList.contains("stash-item-remove-btn")) {
    return; // Ignore clicks not on the remove button
  }

  const button = event.target;
  const itemId = parseInt(button.dataset.itemId, 10);
  const itemDiv = button.closest(".stash-item");
  const itemUrl = itemDiv?.dataset.url; // Get URL for highlighting update

  if (isNaN(itemId) || !itemDiv) {
    console.error("Could not find item ID or parent element for removal.");
    return;
  }

  // Optional: Add confirmation dialog
  // if (!confirm(`Are you sure you want to remove "${itemDiv.querySelector('.stash-item-title')?.textContent || 'this item'}"?`)) {
  //     return;
  // }

  try {
    button.disabled = true; // Prevent double clicks
    button.textContent = "..."; // Indicate processing
    await deleteStashItemDB(itemId); // Call DB function

    // Remove from the DOM
    itemDiv.remove();

    // Remove from the local 'allStashedItems' array
    const itemIndex = allStashedItems.findIndex((item) => item.id === itemId);
    if (itemIndex > -1) {
      allStashedItems.splice(itemIndex, 1);
    }

    setStashStatusMessage(stashStatusMessageElement, "Item removed.");
    console.log(`Removed stashed item with ID: ${itemId}`);

    // Update highlighting if the removed URL was potentially highlighted
    if (itemUrl) {
      await updateHighlightingOnActiveTab(); // Refresh highlights
    }
  } catch (error) {
    console.error(`Error removing stashed item ${itemId}:`, error);
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error removing item.",
      true
    );
    button.disabled = false; // Re-enable button on error
    button.textContent = "×"; // Restore original text
  }
}

// --- Link Highlighting Logic --- (Remains the same as before)

async function loadHighlightState() {
  try {
    const result = await chrome.storage.local.get(HIGHLIGHT_STORAGE_KEY);
    isHighlightingEnabled = !!result[HIGHLIGHT_STORAGE_KEY];
    updateHighlightButtonState();
  } catch (error) {
    console.error("Error loading highlight state:", error);
    isHighlightingEnabled = false;
    updateHighlightButtonState();
  }
}

async function saveHighlightState() {
  try {
    await chrome.storage.local.set({
      [HIGHLIGHT_STORAGE_KEY]: isHighlightingEnabled,
    });
  } catch (error) {
    console.error("Error saving highlight state:", error);
  }
}

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

async function updateHighlightingOnActiveTab() {
  let stashedUrls = [];
  if (isHighlightingEnabled) {
    try {
      // Fetch fresh URLs directly from DB for accuracy after potential deletions
      stashedUrls = await getAllStashUrlsDB();
    } catch (error) {
      console.error("Error fetching stashed URLs for highlighting:", error);
      isHighlightingEnabled = false;
      updateHighlightButtonState();
      await saveHighlightState();
      stashedUrls = [];
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
      // console.log(`Sending highlight update to tab ${activeTab.id}: enabled=${isHighlightingEnabled}, urlCount=${stashedUrls.length}`);
      await chrome.tabs.sendMessage(activeTab.id, {
        type: "UPDATE_HIGHLIGHTING",
        enabled: isHighlightingEnabled,
        stashedUrls: stashedUrls,
      });
    } else {
      // console.log("No suitable active tab found to send highlight update.");
    }
  } catch (error) {
    if (
      error.message.includes("Could not establish connection") ||
      error.message.includes("Receiving end does not exist")
    ) {
      // console.warn(`Could not send highlight update to active tab. Content script might not be injected or ready on this page (${error.message})`);
    } else {
      console.error("Error sending highlight update message:", error);
    }
  }
}

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
  // Use debounced version for inputs/selects that trigger full re-render
  stashSearchInput.addEventListener("input", debouncedRenderStashList);
  stashSortSelect.addEventListener("change", renderStashList); // Full re-render on sort change
  stashFilterSelect.addEventListener("change", renderStashList); // Full re-render on filter change

  // New listener for highlight toggle
  highlightToggleButton.addEventListener("click", handleHighlightToggleClick);

  // New listener for infinite scroll
  stashListElement.addEventListener("scroll", handleScroll);

  // New listener for remove buttons (using event delegation)
  stashListElement.addEventListener("click", handleRemoveItemClick);

  // Load initial highlight state
  await loadHighlightState();

  // Initial render is called from sidebar.js, which will trigger renderStashList
  // renderStashList(); // No longer needed here

  // Send initial highlight state when the sidebar opens/loads
  await updateHighlightingOnActiveTab();
}
