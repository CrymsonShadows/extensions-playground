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
  deleteStashItemDB,
  updateStashItemFavoriteDB,
} from "./db.js";
import { getSelectedTabData, clearSelectedTabs } from "./tabs_ui.js";

// --- Constants ---
const HIGHLIGHT_STORAGE_KEY = "stashHighlightEnabled";
const PROFILE_NAME_STORAGE_KEY = "stashProfileName";
const ITEMS_PER_PAGE = 25;
const SCROLL_THRESHOLD = 100;

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
const stashTagsInput = document.getElementById("stash-tags-input");
const stashSelectedBtn = document.getElementById("stash-selected-btn");
const stashCloseSelectedBtn = document.getElementById(
  "stash-close-selected-btn"
);
const exportStashBtn = document.getElementById("export-stash-btn");
const importStashBtn = document.getElementById("import-stash-btn");
const importStashInput = document.getElementById("import-stash-input");
const importExportStatusMessageElement = document.getElementById(
  "import-export-status-message"
);
const profileNameInput = document.getElementById("profile-name-input");

// --- State Variables ---
let isHighlightingEnabled = false;
let allStashedItems = [];
let currentPage = 1;
let isLoadingMore = false;
let isStashingSelected = false;
let isExporting = false;
let isImporting = false;

// --- Helper to set status message for import/export ---
function setImportExportStatus(message, isError = false) {
  setStashStatusMessage(importExportStatusMessageElement, message, isError);
}

// --- Stash Actions ---
async function handleStashCurrentTabClick() {
  setStashStatusMessage(stashStatusMessageElement, "Stashing...");
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab) {
      setStashStatusMessage(
        stashStatusMessageElement,
        "No active tab found.",
        true
      );
      return;
    }

    const originalInfo = getOriginalTabInfo(activeTab.url, activeTab.title);
    console.log(
      "Stash Current: Original Info:",
      originalInfo,
      "From Tab URL:",
      activeTab.url
    );

    if (
      !originalInfo.url ||
      originalInfo.url.startsWith("chrome://") ||
      (originalInfo.url.startsWith("chrome-extension://") &&
        !originalInfo.isSuspended) ||
      originalInfo.url.startsWith("about:")
    ) {
      setStashStatusMessage(
        stashStatusMessageElement,
        "Cannot stash internal Chrome pages or unresolved extension pages.",
        true
      );
      console.warn(
        "Stash Current: Attempted to stash an invalid/internal URL:",
        originalInfo.url
      );
      return;
    }

    const tagsString = stashTagsInput.value.trim();
    const tagsArray = tagsString
      ? tagsString
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "")
      : [];

    const itemData = {
      title: originalInfo.title || originalInfo.url,
      url: originalInfo.url,
      tags: tagsArray,
      // dateCreated and dateUpdated will be handled by db.js
    };
    console.log("Stash Current: Stashing itemData:", itemData);

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
    stashTagsInput.value = "";
    await renderStashList();
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
    if (!activeTab) {
      setStashStatusMessage(
        stashStatusMessageElement,
        "No active tab found.",
        true
      );
      return;
    }
    const originalInfo = getOriginalTabInfo(activeTab.url, activeTab.title);

    if (!originalInfo.url) {
      setStashStatusMessage(
        stashStatusMessageElement,
        "Cannot determine URL of the current tab.",
        true
      );
      return;
    }

    const updatedCount = await updateStashItemConsumedDB(
      originalInfo.url,
      true
    );

    if (updatedCount > 0) {
      setStashStatusMessage(
        stashStatusMessageElement,
        `Marked "${(originalInfo.title || originalInfo.url).substring(
          0,
          50
        )}..." as consumed.`
      );
      const itemDiv = stashListElement.querySelector(
        `[data-url="${CSS.escape(originalInfo.url)}"]`
      );
      if (itemDiv) {
        const statusSpan = itemDiv.querySelector(".stash-item-status");
        const titleLink = itemDiv.querySelector(".stash-item-title");
        if (statusSpan && !statusSpan.classList.contains("consumed")) {
          statusSpan.classList.remove("unread");
          statusSpan.classList.add("consumed");
          statusSpan.textContent = "Read";
          statusSpan.title = `Consumed: ${new Date().toLocaleString()}`;
          titleLink?.classList.add("consumed-title-style");
        }
        const itemIndex = allStashedItems.findIndex(
          (item) => item.url === originalInfo.url
        );
        if (itemIndex !== -1) {
          allStashedItems[itemIndex].consumed = true;
          allStashedItems[itemIndex].dateConsumed = new Date().toISOString();
        }
      } else {
        await renderStashList();
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

async function handleStashSelectedClick(shouldCloseTabs = false) {
  console.log(
    "Stash Selected: Starting operation. shouldCloseTabs:",
    shouldCloseTabs
  );

  if (isStashingSelected) {
    console.warn("Stash selected operation already in progress.");
    return;
  }
  const selectedTabsDataFromUI = getSelectedTabData();
  console.log(
    "Stash Selected: Data from UI checkboxes:",
    selectedTabsDataFromUI
  );

  if (selectedTabsDataFromUI.length === 0) {
    setStashStatusMessage(
      stashStatusMessageElement,
      "No tabs selected to stash.",
      true
    );
    return;
  }

  // --- Confirmation for Stash & Close ---
  if (shouldCloseTabs) {
    if (
      !window.confirm(
        `Are you sure you want to stash ${selectedTabsDataFromUI.length} selected tab(s) and then close them?`
      )
    ) {
      console.log("Stash Selected: User cancelled stash & close operation.");
      return; // User cancelled
    }
  }

  // Ensure isStashingSelected is reset and buttons are re-enabled even if errors occur
  try {
    isStashingSelected = true;
    stashSelectedBtn.disabled = true;
    stashCloseSelectedBtn.disabled = true;
    const operationText = shouldCloseTabs ? "Stashing & Closing" : "Stashing";
    setStashStatusMessage(
      stashStatusMessageElement,
      `${operationText} ${selectedTabsDataFromUI.length} tab(s)...`
    );

    const tagsString = stashTagsInput.value.trim();
    const tagsArray = tagsString
      ? tagsString
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== "")
      : [];
    console.log("Stash Selected: Applying tags:", tagsArray);

    let successCount = 0;
    let errorCount = 0;
    const successfullyStashedOriginalTabIds = [];

    const stashPromises = selectedTabsDataFromUI.map(async (tabData) => {
      const originalInfo = getOriginalTabInfo(tabData.url, tabData.title);
      console.log(
        `Stash Selected: Processing Tab ID ${tabData.id}, Original URL from checkbox data: ${tabData.url}, Parsed Original Info:`,
        originalInfo
      );

      if (
        !originalInfo.url ||
        originalInfo.url.startsWith("chrome://") ||
        (originalInfo.url.startsWith("chrome-extension://") &&
          !originalInfo.isSuspended) ||
        originalInfo.url.startsWith("about:")
      ) {
        console.warn(
          `Stash Selected: Skipping invalid/internal URL: ${originalInfo.url} (Original tab ID: ${tabData.id})`
        );
        return {
          status: "skipped",
          reason: "Invalid or internal URL",
          tabId: tabData.id,
        };
      }

      console.log(
        `Stash Selected: Preparing to stash tabId: ${tabData.id}, Stash URL: ${originalInfo.url}`
      );
      const itemToStash = {
        title: originalInfo.title || originalInfo.url,
        url: originalInfo.url,
        tags: tagsArray,
        // dateCreated and dateUpdated handled by db.js
      };

      try {
        const result = await stashOrUpdateItemDB(itemToStash);
        console.log(
          `Stash Selected: Stash successful for tabId: ${tabData.id}, Result:`,
          result
        );
        return { ...result, tabId: tabData.id, stashed: true };
      } catch (error) {
        console.error(
          `Stash Selected: Stash failed for tabId: ${tabData.id}, URL: ${itemToStash.url}, Error:`,
          error
        );
        return { error: error, tabId: tabData.id, stashed: false };
      }
    });

    const results = await Promise.allSettled(stashPromises);
    console.log(
      "Stash Selected: Stash operation results (allSettled):",
      results
    );

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        if (result.value.stashed && result.value.action) {
          successCount++;
          if (result.value.tabId !== undefined) {
            successfullyStashedOriginalTabIds.push(result.value.tabId);
          }
        } else if (result.value.status === "skipped") {
          console.log(
            `Stash Selected: Skipped tab ID ${
              result.value.tabId || "unknown"
            }:`,
            result.value.reason
          );
        } else if (result.value.error) {
          errorCount++;
        }
      } else if (result.status === "rejected") {
        errorCount++;
        console.error(
          `Stash Selected: Promise rejected (unexpected). Tab ID ${
            result.reason?.tabId || "unknown"
          }. Reason:`,
          result.reason?.error || result.reason
        );
      }
    });

    console.log(
      "Stash Selected: Successfully stashed tab IDs to potentially close:",
      successfullyStashedOriginalTabIds
    );
    console.log(
      `Stash Selected: Final counts - Success: ${successCount}, Error: ${errorCount}`
    );

    let finalMessage = `${operationText} complete. Stashed/Updated: ${successCount}.`;
    if (errorCount > 0) {
      finalMessage += ` Errors: ${errorCount}.`;
    }
    setStashStatusMessage(
      stashStatusMessageElement,
      finalMessage,
      errorCount > 0
    );

    stashTagsInput.value = "";
    // Always clear selected tabs, regardless of success or failure to ensure consistent state
    clearSelectedTabs();

    console.log(
      `Stash Selected: Checking close condition: shouldCloseTabs=${shouldCloseTabs}, successfullyStashedOriginalTabIds.length=${successfullyStashedOriginalTabIds.length}`
    );
    if (shouldCloseTabs && successfullyStashedOriginalTabIds.length > 0) {
      setStashStatusMessage(
        stashStatusMessageElement,
        `${finalMessage} Closing ${successfullyStashedOriginalTabIds.length} tab(s)...`,
        errorCount > 0
      );
      console.log(
        "Stash Selected: Attempting to close tabs:",
        successfullyStashedOriginalTabIds
      );
      try {
        await chrome.tabs.remove(successfullyStashedOriginalTabIds);
        console.log("Stash Selected: Tabs closed successfully.");
        setStashStatusMessage(
          stashStatusMessageElement,
          `${operationText} ${successCount} tab(s) and closed them.`,
          errorCount > 0
        );
      } catch (closeError) {
        console.error(
          "Stash Selected: Error closing stashed tabs:",
          closeError
        );
        setStashStatusMessage(
          stashStatusMessageElement,
          "Stashing complete, but error occurred during tab closing.",
          true
        );
      }
    } else {
      console.log(
        "Stash Selected: Skipping tab closing (condition not met or no tabs successfully stashed)."
      );
    }

    console.log("Stash Selected: Refreshing stash list and highlighting.");
    await renderStashList();
    await updateHighlightingOnActiveTab();
  } catch (error) {
    // Catch any unexpected errors from the main try block
    console.error("Stash Selected: Unhandled error during operation:", error);
    setStashStatusMessage(
      stashStatusMessageElement,
      "An unexpected error occurred during stashing.",
      true
    );
  } finally {
    isStashingSelected = false;
    stashSelectedBtn.disabled = false;
    stashCloseSelectedBtn.disabled = false;
  }
  console.log("Stash Selected: Operation finished.");
}

// --- Stash List Rendering & Infinite Scroll ---

function createSingleStashItemElement(item) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "stash-item";
  itemDiv.dataset.id = item.id;
  itemDiv.dataset.url = item.url;

  // --- Status Area (Left) ---
  const statusArea = document.createElement("div");
  statusArea.className = "stash-item-status-area";

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
  statusArea.appendChild(statusSpan);

  // Favorite Button
  const favoriteBtn = document.createElement("button");
  favoriteBtn.className = "stash-item-favorite-btn";
  favoriteBtn.innerHTML = item.favorite ? "★" : "☆";
  favoriteBtn.title = item.favorite
    ? "Remove from favorites"
    : "Add to favorites";
  favoriteBtn.dataset.itemId = item.id;
  if (item.favorite) {
    favoriteBtn.classList.add("favorited");
  }
  statusArea.appendChild(favoriteBtn);

  itemDiv.appendChild(statusArea);

  // --- Main Info (Center) ---
  const infoDiv = document.createElement("div");
  infoDiv.className = "stash-item-info";
  const titleLink = document.createElement("a");
  titleLink.className = "stash-item-title";
  titleLink.textContent = item.title || item.url;
  titleLink.href = item.url;
  titleLink.title = item.url;
  titleLink.target = "_blank";
  if (item.consumed) {
    titleLink.classList.add("consumed-title-style");
  }
  infoDiv.appendChild(titleLink);
  const urlSpan = document.createElement("span");
  urlSpan.className = "stash-item-url";
  try {
    urlSpan.textContent = new URL(item.url).hostname;
  } catch {
    urlSpan.textContent = item.url;
  }
  infoDiv.appendChild(urlSpan);
  if (item.tags && item.tags.length > 0) {
    const tagsContainer = document.createElement("div");
    tagsContainer.className = "stash-item-tags";
    item.tags.forEach((tag) => {
      const tagSpan = document.createElement("span");
      tagSpan.className = "stash-tag";
      tagSpan.textContent = tag;
      tagsContainer.appendChild(tagSpan);
    });
    infoDiv.appendChild(tagsContainer);
  }
  itemDiv.appendChild(infoDiv);

  // --- Actions Container (Right) ---
  const actionsContainer = document.createElement("div");
  actionsContainer.className = "stash-item-actions-container";

  const countSpan = document.createElement("span");
  countSpan.className = "stash-item-count";
  countSpan.textContent = `(${item.stashCount || 1})`;
  countSpan.title = `Stashed ${item.stashCount || 1} time(s)`;
  actionsContainer.appendChild(countSpan);

  const removeBtn = document.createElement("button");
  removeBtn.className = "stash-item-remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove this item from stash";
  removeBtn.dataset.itemId = item.id;
  actionsContainer.appendChild(removeBtn);

  itemDiv.appendChild(actionsContainer);

  // Date Stashed (Hidden by CSS, used for sorting and tooltip)
  const dateSpan = document.createElement("span");
  dateSpan.className = "stash-item-date"; // Keep for potential CSS use
  // Display the *last updated* date in the tooltip for clarity with new sorting
  const displayDate = item.dateUpdated || item.dateCreated;
  dateSpan.textContent = new Date(displayDate).toLocaleDateString();
  dateSpan.title = `Last Stashed: ${new Date(displayDate).toLocaleString()}`;
  dateSpan.style.display = "none";
  infoDiv.appendChild(dateSpan); // Append to infoDiv to associate with title/url

  return itemDiv;
}

function appendItemsPage() {
  if (isLoadingMore) return;
  isLoadingMore = true;

  const existingLoader = stashListElement.querySelector(".loading-indicator");
  if (existingLoader) existingLoader.remove();

  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const itemsToRender = allStashedItems.slice(startIndex, endIndex);

  if (itemsToRender.length === 0 && currentPage === 1) {
    const currentSearch = stashSearchInput.value.trim();
    const currentFilter = stashFilterSelect.value;
    let message = "No stashed items found.";
    if (currentFilter === "favorites") {
      message = "No favorite items found.";
    } else if (currentFilter === "unread") {
      message = "No unread items found.";
    }
    if (currentSearch) {
      message += ` Matching "${currentSearch}".`;
    }
    stashListElement.innerHTML = `<p>${message}</p>`;
    isLoadingMore = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  itemsToRender.forEach((item) => {
    fragment.appendChild(createSingleStashItemElement(item));
  });
  stashListElement.appendChild(fragment);

  currentPage++;
  isLoadingMore = false;

  if (endIndex < allStashedItems.length) {
    const loader = document.createElement("div");
    loader.className = "loading-indicator";
    loader.textContent = "Loading more...";
    stashListElement.appendChild(loader);
  }
}

export async function renderStashList() {
  try {
    if (currentPage === 1 && !stashListElement.hasChildNodes()) {
      stashListElement.innerHTML = "<p>Loading stashed items...</p>";
    }

    let items = await getAllStashItemsDB();

    const filterValue = stashFilterSelect.value;
    if (filterValue === "unread") {
      items = items.filter((item) => !item.consumed);
    } else if (filterValue === "favorites") {
      items = items.filter((item) => item.favorite === true);
    }

    const fullSearchTerm = stashSearchInput.value.trim();
    const fullSearchTermLower = fullSearchTerm.toLowerCase();
    const searchTags = fullSearchTerm
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag !== "");

    if (fullSearchTermLower) {
      items = items.filter((item) => {
        const titleMatch =
          item.title && item.title.toLowerCase().includes(fullSearchTermLower);
        const urlMatch =
          item.url && item.url.toLowerCase().includes(fullSearchTermLower);
        let tagsMatch = false;
        if (
          searchTags.length > 0 &&
          Array.isArray(item.tags) &&
          item.tags.length > 0
        ) {
          const itemTagsLower = item.tags.map((t) => t.toLowerCase());
          tagsMatch = searchTags.every((searchTag) =>
            itemTagsLower.includes(searchTag)
          );
        }
        return titleMatch || urlMatch || tagsMatch;
      });
    }

    const sortValue = stashSortSelect.value;
    items.sort((a, b) => {
      switch (sortValue) {
        case "dateAsc": // Oldest (based on last update)
          return (
            new Date(a.dateUpdated || a.dateCreated) -
            new Date(b.dateUpdated || b.dateCreated)
          );
        case "titleAsc":
          return (a.title || "").localeCompare(b.title || "");
        case "titleDesc":
          return (b.title || "").localeCompare(a.title || "");
        case "consumedTrue":
          return a.consumed === b.consumed ? 0 : a.consumed ? -1 : 1;
        case "consumedFalse":
          return a.consumed === b.consumed ? 0 : a.consumed ? 1 : -1;
        // *** ADDED CASES FOR STASH COUNT SORTING ***
        case "stashCountDesc": // Most stashed
          return (b.stashCount || 0) - (a.stashCount || 0);
        case "stashCountAsc": // Least stashed
          return (a.stashCount || 0) - (b.stashCount || 0);
        // *** END ADDED CASES ***
        case "dateDesc": // Newest (based on last update) - DEFAULT
        default:
          return (
            new Date(b.dateUpdated || b.dateCreated) -
            new Date(a.dateUpdated || a.dateCreated)
          );
      }
    });

    allStashedItems = items;
    currentPage = 1;
    stashListElement.innerHTML = "";
    appendItemsPage();
  } catch (error) {
    console.error("Error rendering stash list:", error);
    allStashedItems = [];
    stashListElement.innerHTML = "<p>Error loading stashed items.</p>";
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error loading stash.",
      true
    );
  }
}

const debouncedRenderStashList = debounce(renderStashList, 300);

const handleScroll = debounce(() => {
  if (isLoadingMore) return;
  const nearBottom =
    stashListElement.scrollHeight -
      stashListElement.scrollTop -
      stashListElement.clientHeight <
    SCROLL_THRESHOLD;
  const hasMoreItems =
    (currentPage - 1) * ITEMS_PER_PAGE < allStashedItems.length;

  if (nearBottom && hasMoreItems) {
    console.log("Near bottom and more items exist, loading next page...");
    appendItemsPage();
  }
}, 100);

async function handleRemoveItemClick(event) {
  const button = event.target.closest(".stash-item-remove-btn");
  if (!button) return;

  const itemId = parseInt(button.dataset.itemId, 10);
  const itemDiv = button.closest(".stash-item");
  const itemUrl = itemDiv?.dataset.url;

  if (isNaN(itemId) || !itemDiv) {
    console.error("Could not find item ID or parent element for removal.");
    return;
  }
  try {
    button.disabled = true;
    button.textContent = "...";
    await deleteStashItemDB(itemId);
    itemDiv.remove();
    const itemIndex = allStashedItems.findIndex((item) => item.id === itemId);
    if (itemIndex > -1) {
      allStashedItems.splice(itemIndex, 1);
    }
    setStashStatusMessage(stashStatusMessageElement, "Item removed.");
    console.log(`Removed stashed item with ID: ${itemId}`);
    if (itemUrl) {
      await updateHighlightingOnActiveTab();
    }
  } catch (error) {
    console.error(`Error removing stashed item ${itemId}:`, error);
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error removing item.",
      true
    );
    button.disabled = false;
    button.textContent = "×";
  }
}

async function handleToggleFavoriteClick(event) {
  const button = event.target.closest(".stash-item-favorite-btn");
  if (!button) return;

  const itemId = parseInt(button.dataset.itemId, 10);
  if (isNaN(itemId)) {
    console.error("Invalid item ID for favorite toggle.");
    return;
  }
  const itemDiv = button.closest(".stash-item");
  if (!itemDiv) {
    console.error("Could not find parent item div for favorite toggle.");
    return;
  }
  const isCurrentlyFavorite = button.classList.contains("favorited");
  const newFavoriteState = !isCurrentlyFavorite;
  console.log(`Toggling favorite for item ${itemId} to ${newFavoriteState}`);

  button.classList.toggle("favorited", newFavoriteState);
  button.innerHTML = newFavoriteState ? "★" : "☆";
  button.title = newFavoriteState
    ? "Remove from favorites"
    : "Add to favorites";
  try {
    await updateStashItemFavoriteDB(itemId, newFavoriteState);
    console.log(
      `Successfully updated favorite status in DB for item ${itemId}`
    );
    const itemIndex = allStashedItems.findIndex((item) => item.id === itemId);
    if (itemIndex !== -1) {
      allStashedItems[itemIndex].favorite = newFavoriteState;
      console.log(
        `Local cache 'allStashedItems' updated for item ${itemId}. New state: ${newFavoriteState}`
      );
    } else {
      console.warn(
        `Item ${itemId} not found in current 'allStashedItems' cache after favorite update.`
      );
    }
    if (stashFilterSelect.value === "favorites" && !newFavoriteState) {
      console.log(
        `Item ${itemId} unfavorited while 'Favorites Only' filter is active. Removing from DOM.`
      );
      itemDiv.remove();
      if (!stashListElement.hasChildNodes()) {
        stashListElement.innerHTML = `<p>No favorite items found.</p>`;
      }
    }
  } catch (error) {
    console.error(`Error updating favorite status for item ${itemId}:`, error);
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error updating favorite.",
      true
    );
    button.classList.toggle("favorited", isCurrentlyFavorite);
    button.innerHTML = isCurrentlyFavorite ? "★" : "☆";
    button.title = isCurrentlyFavorite
      ? "Remove from favorites"
      : "Add to favorites";
  }
}

async function loadHighlightState() {
  try {
    const result = await chrome.storage.local.get(HIGHLIGHT_STORAGE_KEY);
    isHighlightingEnabled = !!result[HIGHLIGHT_STORAGE_KEY];
    console.log("Highlight state loaded:", isHighlightingEnabled);
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
    console.log("Highlight state saved:", isHighlightingEnabled);
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
export async function updateHighlightingOnActiveTab() {
  let stashedUrls = [];
  if (isHighlightingEnabled) {
    try {
      stashedUrls = await getAllStashUrlsDB();
      console.log(`Highlighting: Fetched ${stashedUrls.length} URLs from DB.`);
    } catch (error) {
      console.error("Error fetching stashed URLs for highlighting:", error);
      stashedUrls = [];
      setStashStatusMessage(
        stashStatusMessageElement,
        "Error fetching URLs for highlighting.",
        true
      );
    }
  } else {
    console.log("Highlighting: Disabled, sending empty URL list.");
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
      !activeTab.url.startsWith("chrome:") &&
      !activeTab.url.startsWith("about:") &&
      !activeTab.url.startsWith("moz-extension:") &&
      !activeTab.url.startsWith("file:") &&
      !activeTab.url.startsWith(chrome.runtime.getURL(""))
    ) {
      console.log(
        `Highlighting: Sending UPDATE_HIGHLIGHTING to tab ${activeTab.id}: enabled=${isHighlightingEnabled}, urlCount=${stashedUrls.length}`
      );
      try {
        await chrome.tabs.sendMessage(activeTab.id, {
          type: "UPDATE_HIGHLIGHTING",
          enabled: isHighlightingEnabled,
          stashedUrls: stashedUrls,
        });
        console.log(
          `Highlighting: Message sent successfully to tab ${activeTab.id}.`
        );
      } catch (sendError) {
        if (
          sendError.message.includes("Could not establish connection") ||
          sendError.message.includes("Receiving end does not exist")
        ) {
          console.warn(
            `Highlighting: Could not send message to active tab ${activeTab?.id}. Content script might not be injected or ready. Error: ${sendError.message}`
          );
        } else {
          console.error(
            `Highlighting: Error sending update message to tab ${activeTab?.id}:`,
            sendError
          );
          setStashStatusMessage(
            stashStatusMessageElement,
            "Error sending highlight update.",
            true
          );
        }
      }
    } else {
      console.log(
        "Highlighting: No suitable active tab found to send highlight update (might be internal page or no URL).",
        activeTab?.url
      );
    }
  } catch (queryError) {
    console.error("Highlighting: Error querying active tab:", queryError);
    setStashStatusMessage(
      stashStatusMessageElement,
      "Error finding active tab.",
      true
    );
  }
}
async function handleHighlightToggleClick() {
  isHighlightingEnabled = !isHighlightingEnabled;
  console.log("Highlight toggle clicked. New state:", isHighlightingEnabled);
  updateHighlightButtonState();
  await saveHighlightState();
  await updateHighlightingOnActiveTab();
}

async function loadProfileName() {
  if (!profileNameInput) return;
  try {
    const result = await chrome.storage.local.get(PROFILE_NAME_STORAGE_KEY);
    const savedName = result[PROFILE_NAME_STORAGE_KEY] || "";
    profileNameInput.value = savedName;
    console.log("Profile name loaded:", savedName);
  } catch (error) {
    console.error("Error loading profile name:", error);
    profileNameInput.value = "";
  }
}

async function saveProfileName() {
  if (!profileNameInput) return;
  const nameToSave = profileNameInput.value.trim();
  try {
    await chrome.storage.local.set({ [PROFILE_NAME_STORAGE_KEY]: nameToSave });
    console.log("Profile name saved:", nameToSave);
  } catch (error) {
    console.error("Error saving profile name:", error);
  }
}
const debouncedSaveProfileName = debounce(saveProfileName, 500);

async function handleExportClick() {
  if (isExporting) return;
  isExporting = true;
  exportStashBtn.disabled = true;
  setImportExportStatus("Exporting stash...");
  try {
    const items = await getAllStashItemsDB();
    if (items.length === 0) {
      setImportExportStatus("Stash is empty, nothing to export.");
      isExporting = false;
      exportStashBtn.disabled = false;
      return;
    }
    const profileName = profileNameInput.value.trim();
    const safeProfileName = profileName
      ? profileName.replace(/[^a-z0-9]/gi, "_").toLowerCase()
      : "profile";
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, "-");
    const filename = `${safeProfileName}-stash-export-${timestamp}.json`;
    const dataStr = JSON.stringify(items, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportExportStatus(
      `Exported ${items.length} items successfully to ${filename}.`
    );
    console.log(`Exported ${items.length} items to ${filename}.`);
  } catch (error) {
    console.error("Error exporting stash:", error);
    setImportExportStatus("Error exporting stash.", true);
  } finally {
    isExporting = false;
    exportStashBtn.disabled = false;
  }
}

function handleImportClick() {
  try {
    importStashInput.value = null;
    console.log("Import Stash: Reset input value before click.");
  } catch (e) {
    console.warn("Import Stash: Could not reset input value before click.", e);
  }
  importStashInput.click();
}

async function handleFileSelect(event) {
  console.log("Import Stash: File selection event triggered.");
  const currentInput = event.target;

  if (isImporting) {
    console.warn("Import Stash: Import already in progress. Ignoring.");
    currentInput.value = null;
    return;
  }
  const file = currentInput.files[0];
  if (!file) {
    console.log("Import Stash: No file selected (user likely cancelled).");
    currentInput.value = null;
    return;
  }

  isImporting = true;
  importStashBtn.disabled = true;
  setImportExportStatus(`Importing from ${file.name}...`);
  console.log(`Import Stash: Starting import from file: ${file.name}`);

  const reader = new FileReader();
  reader.onload = async (e) => {
    console.log("Import Stash: File loaded by FileReader.");
    let importedItems;
    try {
      importedItems = JSON.parse(e.target.result);
      if (!Array.isArray(importedItems)) {
        throw new Error("Invalid format: Imported file is not a JSON array.");
      }
      console.log(
        `Import Stash: Parsed ${importedItems.length} items from JSON.`
      );
    } catch (error) {
      console.error("Import Stash: Error parsing import file:", error);
      setImportExportStatus(`Error reading file: ${error.message}`, true);
      isImporting = false;
      importStashBtn.disabled = false;
      console.log(
        "Import Stash (Parse Error): Resetting file input value before:",
        currentInput.value
      );
      currentInput.value = null;
      console.log(
        "Import Stash (Parse Error): Resetting file input value after:",
        currentInput.value
      );
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    const importPromises = importedItems.map((item) => {
      if (
        !item ||
        typeof item.url !== "string" ||
        typeof item.title !== "string"
      ) {
        console.warn("Import Stash: Skipping invalid item structure:", item);
        return Promise.resolve({
          status: "skipped",
          reason: "Invalid item structure",
        });
      }
      // *** Prepare itemData with ALL fields, including dateCreated and dateUpdated ***
      const itemData = {
        url: item.url,
        title: item.title,
        tags: Array.isArray(item.tags) ? item.tags : [],
        dateCreated: item.dateCreated, // Pass along if present
        dateUpdated: item.dateUpdated, // Pass along if present
        favorite: typeof item.favorite === "boolean" ? item.favorite : false,
        consumed: typeof item.consumed === "boolean" ? item.consumed : false,
        dateConsumed: item.dateConsumed, // Pass along if present
        stashCount:
          typeof item.stashCount === "number" && item.stashCount > 0
            ? item.stashCount
            : 1,
      };
      return stashOrUpdateItemDB(itemData);
    });

    const results = await Promise.allSettled(importPromises);
    console.log("Import Stash: DB operation results:", results);

    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value.action) {
        successCount++;
      } else if (result.status === "rejected") {
        errorCount++;
        console.error("Import Stash: Error importing one item:", result.reason);
      }
    });

    let finalMessage = `Import complete. Added/Updated: ${successCount}.`;
    if (errorCount > 0) {
      finalMessage += ` Errors: ${errorCount}.`;
    }
    setImportExportStatus(finalMessage, errorCount > 0);
    console.log("Import Stash: ", finalMessage);

    await renderStashList();
    await updateHighlightingOnActiveTab();

    isImporting = false;
    importStashBtn.disabled = false;
    console.log(
      "Import Stash (Success): Resetting file input value before:",
      currentInput.value
    );
    currentInput.value = null;
    console.log(
      "Import Stash (Success): Resetting file input value after:",
      currentInput.value
    );
  };

  reader.onerror = (e) => {
    console.error("Import Stash: File reading error:", e);
    setImportExportStatus("Error reading file.", true);
    isImporting = false;
    importStashBtn.disabled = false;
    console.log(
      "Import Stash (Read Error): Resetting file input value before:",
      currentInput.value
    );
    currentInput.value = null;
    console.log(
      "Import Stash (Read Error): Resetting file input value after:",
      currentInput.value
    );
  };
  reader.readAsText(file);
}

export async function setupStashUI() {
  if (stashCurrentTabBtn.dataset.listenerAttached === "true") {
    console.warn("Stash UI listeners already attached.");
    return;
  }
  console.log("Attaching Stash UI listeners...");

  stashCurrentTabBtn.addEventListener("click", handleStashCurrentTabClick);
  markConsumedBtn.addEventListener("click", handleMarkConsumedClick);
  highlightToggleButton.addEventListener("click", handleHighlightToggleClick);
  stashSelectedBtn.addEventListener("click", () =>
    handleStashSelectedClick(false)
  );
  stashCloseSelectedBtn.addEventListener("click", () =>
    handleStashSelectedClick(true)
  );
  exportStashBtn.addEventListener("click", handleExportClick);
  importStashBtn.addEventListener("click", handleImportClick);
  importStashInput.addEventListener("change", handleFileSelect);

  if (profileNameInput) {
    profileNameInput.addEventListener("input", debouncedSaveProfileName);
  }

  stashSearchInput.addEventListener("input", debouncedRenderStashList);
  stashSortSelect.addEventListener("change", renderStashList);
  stashFilterSelect.addEventListener("change", renderStashList);

  stashTagsInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      handleStashCurrentTabClick();
    }
  });

  stashListElement.addEventListener("scroll", handleScroll);
  stashListElement.addEventListener("click", (event) => {
    if (event.target.closest(".stash-item-remove-btn")) {
      handleRemoveItemClick(event);
    } else if (event.target.closest(".stash-item-favorite-btn")) {
      handleToggleFavoriteClick(event);
    }
  });

  stashCurrentTabBtn.dataset.listenerAttached = "true";
  await loadHighlightState();
  await loadProfileName();
  console.log("Stash UI setup complete.");
}
