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
} from "./db.js"; // Import DB functions

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
    ); // Use DB function

    if (updatedCount > 0) {
      setStashStatusMessage(
        stashStatusMessageElement,
        `Marked "${originalInfo.title.substring(0, 50)}..." as consumed.`
      );
      await renderStashList();
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

    // Sort
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
          return (b.consumed ? 1 : 0) - (a.consumed ? 1 : 0);
        case "consumedFalse":
          return (a.consumed ? 1 : 0) - (b.consumed ? 1 : 0);
        case "dateDesc":
        default:
          return new Date(b.dateCreated) - new Date(a.dateCreated);
      }
    });

    // Render
    stashListElement.innerHTML = "";
    if (items.length === 0) {
      stashListElement.innerHTML = "<p>No stashed items match filters.</p>";
      return;
    }

    items.forEach((item) => {
      const itemDiv = document.createElement("div");
      itemDiv.className = "stash-item";
      itemDiv.dataset.id = item.id;
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

// --- Setup ---
export function setupStashUI() {
  stashCurrentTabBtn.addEventListener("click", handleStashCurrentTabClick);
  markConsumedBtn.addEventListener("click", handleMarkConsumedClick);
  stashSearchInput.addEventListener("input", debouncedRenderStashList); // Use debounced version
  stashSortSelect.addEventListener("change", renderStashList);
  stashFilterSelect.addEventListener("change", renderStashList);
  // Initial render is called from sidebar.js
}
