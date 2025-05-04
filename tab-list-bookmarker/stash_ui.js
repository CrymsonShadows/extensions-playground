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
  getAllStashUrlsDB, // Ensure this is exported from db.js
  deleteStashItemDB,
} from "./db.js";

// --- Constants ---
const HIGHLIGHT_STORAGE_KEY = "stashHighlightEnabled";
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

// --- State Variables ---
let isHighlightingEnabled = false;
let allStashedItems = [];
let currentPage = 1;
let isLoadingMore = false;

// --- Stash Actions ---
// handleStashCurrentTabClick, handleMarkConsumedClick remain the same
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
    await updateHighlightingOnActiveTab(); // Update highlighting in case new URL added
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
      await updateHighlightingOnActiveTab(); // Update highlighting as consumed status doesn't affect it
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
// createSingleStashItemElement, appendItemsPage, renderStashList remain the same
function createSingleStashItemElement(item) {
  const itemDiv = document.createElement("div");
  itemDiv.className = "stash-item";
  itemDiv.dataset.id = item.id;
  itemDiv.dataset.url = item.url;

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

  const countSpan = document.createElement("span");
  countSpan.className = "stash-item-count";
  countSpan.textContent = `(${item.stashCount || 1})`;
  countSpan.title = `Stashed ${item.stashCount || 1} time(s)`;
  itemDiv.appendChild(countSpan);

  const dateSpan = document.createElement("span");
  dateSpan.className = "stash-item-date";
  dateSpan.textContent = new Date(item.dateCreated).toLocaleDateString();
  dateSpan.title = `Last Stashed: ${new Date(
    item.dateCreated
  ).toLocaleString()}`;
  itemDiv.appendChild(dateSpan);

  const removeBtn = document.createElement("button");
  removeBtn.className = "stash-item-remove-btn";
  removeBtn.textContent = "×";
  removeBtn.title = "Remove this item from stash";
  removeBtn.dataset.itemId = item.id;
  itemDiv.appendChild(removeBtn);

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
    stashListElement.innerHTML = "<p>No stashed items match filters.</p>";
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
    if (currentPage === 1) {
      stashListElement.innerHTML = "<p>Loading stashed items...</p>";
    }
    let items = await getAllStashItemsDB();

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

    const sortValue = stashSortSelect.value;
    items.sort((a, b) => {
      switch (sortValue) {
        case "dateAsc":
          return new Date(a.dateCreated) - new Date(b.dateCreated);
        case "titleAsc":
          return (a.title || "").localeCompare(b.title || "");
        case "titleDesc":
          return (b.title || "").localeCompare(a.title || "");
        case "consumedTrue":
          return a.consumed === b.consumed ? 0 : a.consumed ? -1 : 1;
        case "consumedFalse":
          return a.consumed === b.consumed ? 0 : a.consumed ? 1 : -1;
        case "dateDesc":
        default:
          return new Date(b.dateCreated) - new Date(a.dateCreated);
      }
    });

    allStashedItems = items;
    currentPage = 1;
    stashListElement.innerHTML = ""; // Clear before rendering first page
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
  if (
    nearBottom &&
    (currentPage - 1) * ITEMS_PER_PAGE < allStashedItems.length
  ) {
    appendItemsPage();
  }
}, 100);

// --- Remove Stashed Item Logic ---
// handleRemoveItemClick remains the same
async function handleRemoveItemClick(event) {
  if (!event.target.classList.contains("stash-item-remove-btn")) {
    return;
  }
  const button = event.target;
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

// --- Link Highlighting Logic ---
// loadHighlightState, saveHighlightState, updateHighlightButtonState remain the same
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

// *** EXPORT this function ***
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
      !activeTab.url.startsWith("chrome") &&
      !activeTab.url.startsWith("about:")
    ) {
      console.log(
        `Highlighting: Sending UPDATE_HIGHLIGHTING to tab ${activeTab.id}: enabled=${isHighlightingEnabled}, urlCount=${stashedUrls.length}`
      );
      // Use a try-catch specifically around sendMessage
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
            "Highlighting: Error sending update message:",
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
        "Highlighting: No suitable active tab found to send highlight update.",
        activeTab
      );
    }
  } catch (queryError) {
    // Error querying tabs
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
  await updateHighlightingOnActiveTab(); // Send update immediately
}

// --- Setup ---
export async function setupStashUI() {
  // Listeners
  stashCurrentTabBtn.addEventListener("click", handleStashCurrentTabClick);
  markConsumedBtn.addEventListener("click", handleMarkConsumedClick);
  stashSearchInput.addEventListener("input", debouncedRenderStashList);
  stashSortSelect.addEventListener("change", renderStashList);
  stashFilterSelect.addEventListener("change", renderStashList);
  highlightToggleButton.addEventListener("click", handleHighlightToggleClick);
  stashListElement.addEventListener("scroll", handleScroll);
  stashListElement.addEventListener("click", handleRemoveItemClick);

  // Initial state load
  await loadHighlightState();

  // Initial render is triggered by sidebar.js
  // ** REMOVED: await updateHighlightingOnActiveTab(); **
  // This is now called by sidebar.js after initial renderAllLists
}
