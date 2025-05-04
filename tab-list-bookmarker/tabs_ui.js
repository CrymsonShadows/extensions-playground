// tabs_ui.js
import { groupColorMap, groupBackgroundColorMap } from "./constants.js";
import { getOriginalTabInfo, setStatusMessage } from "./utils.js";
import { handleFetchTitleClick } from "./ui.js";

// --- In-memory state for checked tabs ---
let checkedTabIds = new Set();

// --- Element References ---
const tabListElement = document.getElementById("tab-list");
const selectAllCheckbox = document.getElementById("select-all-checkbox");
const selectedCountSpan = document.getElementById("selected-count");
const headerCloseSelectedBtn = document.getElementById(
  "header-close-selected-btn"
);
const tabListStatusMessageElement = document.getElementById(
  "tab-list-status-message"
);

// --- Checkbox State Management ---
// handleCheckboxChange, handleGroupCheckboxChange, handleSelectAllChange,
// updateSelectAllCheckboxState remain the same
function handleCheckboxChange(event) {
  const checkbox = event.target;
  const tabId = parseInt(checkbox.dataset.tabId, 10);
  const isChecked = checkbox.checked;
  if (isNaN(tabId)) {
    console.warn(
      "Checkbox change ignored: Invalid tab ID",
      checkbox.dataset.tabId
    );
    updateSelectAllCheckboxState();
    return;
  }
  if (isChecked) {
    checkedTabIds.add(tabId);
  } else {
    checkedTabIds.delete(tabId);
  }
  updateSelectAllCheckboxState(); // Update parent checkboxes/counts
}

function handleGroupCheckboxChange(event) {
  const groupCheckbox = event.target;
  const groupId = groupCheckbox.dataset.groupId;
  const isChecked = groupCheckbox.checked;
  const memberTabCheckboxes = tabListElement.querySelectorAll(
    `.tab-item input[type="checkbox"][data-group-id="${groupId}"]`
  );
  memberTabCheckboxes.forEach((tabCheckbox) => {
    const tabId = parseInt(tabCheckbox.dataset.tabId, 10);
    if (isNaN(tabId)) return;
    if (tabCheckbox.checked !== isChecked) {
      tabCheckbox.checked = isChecked;
    }
    if (isChecked) {
      checkedTabIds.add(tabId);
    } else {
      checkedTabIds.delete(tabId);
    }
  });
  updateSelectAllCheckboxState(); // Update parent states
}

function handleSelectAllChange() {
  const isChecked = selectAllCheckbox.checked;
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  individualCheckboxes.forEach((checkbox) => {
    const tabId = parseInt(checkbox.dataset.tabId, 10);
    if (isNaN(tabId)) return;
    if (checkbox.checked !== isChecked) {
      checkbox.checked = isChecked;
    }
    if (isChecked) {
      checkedTabIds.add(tabId);
    } else {
      checkedTabIds.delete(tabId);
    }
  });
  const groupCheckboxes = tabListElement.querySelectorAll(".group-checkbox");
  groupCheckboxes.forEach((groupCheckbox) => {
    groupCheckbox.checked = isChecked;
    groupCheckbox.indeterminate = false;
  });
  updateSelectAllCheckboxState(); // Update parent states
}

function updateSelectAllCheckboxState() {
  const allTabCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  const totalTabs = allTabCheckboxes.length;
  const totalSelectedTabs = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  ).length;
  selectedCountSpan.textContent = `(${totalSelectedTabs})`;
  let allGroupsChecked = true;
  let noGroupsChecked = true;
  let anyGroupIndeterminate = false;
  const groupHeaders = tabListElement.querySelectorAll(".tab-group-header");
  groupHeaders.forEach((header) => {
    const groupId = header.dataset.groupId;
    const groupCheckbox = header.querySelector(".group-checkbox");
    const memberTabCheckboxes = tabListElement.querySelectorAll(
      `.tab-item input[type="checkbox"][data-group-id="${groupId}"]`
    );
    const totalInGroup = memberTabCheckboxes.length;
    const selectedInGroup = tabListElement.querySelectorAll(
      `.tab-item input[type="checkbox"][data-group-id="${groupId}"]:checked`
    ).length;
    if (totalInGroup > 0) {
      if (selectedInGroup === totalInGroup) {
        groupCheckbox.checked = true;
        groupCheckbox.indeterminate = false;
        noGroupsChecked = false;
      } else if (selectedInGroup === 0) {
        groupCheckbox.checked = false;
        groupCheckbox.indeterminate = false;
        allGroupsChecked = false;
      } else {
        groupCheckbox.checked = false;
        groupCheckbox.indeterminate = true;
        allGroupsChecked = false;
        noGroupsChecked = false;
        anyGroupIndeterminate = true;
      }
    } else {
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = false;
      groupCheckbox.disabled = true;
    }
  });
  const ungroupedCheckboxes = tabListElement.querySelectorAll(
    `.tab-item input[type="checkbox"][data-group-id="${chrome.tabGroups.TAB_GROUP_ID_NONE}"]`
  );
  const totalUngrouped = ungroupedCheckboxes.length;
  const selectedUngrouped = tabListElement.querySelectorAll(
    `.tab-item input[type="checkbox"][data-group-id="${chrome.tabGroups.TAB_GROUP_ID_NONE}"]:checked`
  ).length;
  let allUngroupedChecked =
    totalUngrouped > 0 && selectedUngrouped === totalUngrouped;
  let noUngroupedChecked = selectedUngrouped === 0;
  if (totalTabs === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = true;
  } else {
    selectAllCheckbox.disabled = false;
    if (allGroupsChecked && (totalUngrouped === 0 || allUngroupedChecked)) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (
      noGroupsChecked &&
      (totalUngrouped === 0 || noUngroupedChecked) &&
      !anyGroupIndeterminate
    ) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

// --- Tab Actions ---
// closeTab, handleCloseSelectedTabsClick remain the same
async function closeTab(tabId) {
  checkedTabIds.delete(tabId); // Remove from state first
  try {
    await chrome.tabs.remove(tabId);
    // The onRemoved listener in sidebar.js will trigger renderTabs (debounced)
  } catch (error) {
    if (!error.message.toLowerCase().includes("no tab with id")) {
      console.error(`Error closing tab ${tabId}:`, error);
      setStatusMessage(
        tabListStatusMessageElement,
        `Error closing tab: ${error.message}`,
        true
      );
      if (chrome.runtime.lastError) {
        console.error(
          "Chrome runtime error:",
          chrome.runtime.lastError.message
        );
      }
    } else {
      console.log(`Tab ${tabId} already closed.`);
      // renderTabs(); // Re-render no longer needed here, handled by debounced listener
    }
  }
}

async function handleCloseSelectedTabsClick() {
  const selectedIdsSet = getSelectedTabIds(); // Get the Set of IDs
  if (selectedIdsSet.size === 0) {
    setStatusMessage(
      tabListStatusMessageElement,
      "No tabs selected to close.",
      true
    );
    return;
  }

  const tabIdsToClose = Array.from(selectedIdsSet); // Convert Set to Array for API call
  setStatusMessage(
    tabListStatusMessageElement,
    `Closing ${tabIdsToClose.length} selected tab(s)...`
  );
  console.log("Attempting to close tabs:", tabIdsToClose);

  try {
    await chrome.tabs.remove(tabIdsToClose);
    // The onRemoved listener in sidebar.js handles cleanup and re-render (debounced)
    setStatusMessage(
      tabListStatusMessageElement,
      `Closed ${tabIdsToClose.length} tab(s).`
    );
  } catch (error) {
    console.error("Error closing selected tabs:", error);
    setStatusMessage(
      tabListStatusMessageElement,
      `Error closing tabs: ${error.message}`,
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Tab List Rendering ---

/**
 * Creates the DOM element for a single tab item.
 * @param {chrome.tabs.Tab} tab - The Chrome tab object.
 * @param {boolean} isInGroup - Whether the tab is part of a group.
 * @param {string|null} groupColorName - The color name of the group, if any.
 * @returns {HTMLElement} The created tab item div.
 */
function createTabItemElement(tab, isInGroup = false, groupColorName = null) {
  const listItem = document.createElement("div");
  listItem.className = "tab-item" + (isInGroup ? " in-group" : "");
  listItem.dataset.tabId = tab.id;
  listItem.dataset.groupId = tab.groupId;

  const originalInfo = getOriginalTabInfo(tab.url, tab.title);

  // Apply group-specific styling
  if (isInGroup && groupColorName && groupBackgroundColorMap[groupColorName]) {
    listItem.style.backgroundColor = groupBackgroundColorMap[groupColorName];
    listItem.style.borderLeft = `4px solid ${groupColorMap[groupColorName]}`;
    listItem.style.paddingLeft = "21px";
  } else {
    listItem.style.paddingLeft = "15px"; // Default padding for ungrouped
  }

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.tabId = tab.id;
  checkbox.dataset.groupId = tab.groupId;
  checkbox.dataset.tabUrl = originalInfo.url;
  checkbox.dataset.tabTitle = originalInfo.title;
  checkbox.checked = checkedTabIds.has(tab.id); // Restore checked state
  checkbox.addEventListener("change", handleCheckboxChange);
  listItem.appendChild(checkbox);

  // Favicon
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src = tab.favIconUrl || "icons/default_favicon.png"; // Use default if missing
  favicon.alt = "";
  favicon.onerror = () => {
    // Fallback if favicon fails to load
    favicon.src = "icons/default_favicon.png";
  };
  listItem.appendChild(favicon);

  // Title Container (holds title and potentially fetch button)
  const titleContainer = document.createElement("div");
  titleContainer.className = "tab-title-container";

  // Fetch Title Button (if needed for suspended tabs)
  if (originalInfo.needsTitleFetch) {
    const fetchBtn = document.createElement("button");
    fetchBtn.className = "fetch-title-btn";
    fetchBtn.innerHTML = "🔄"; // Refresh symbol
    fetchBtn.title = "Load tab to get title";
    fetchBtn.dataset.tabId = tab.id;
    fetchBtn.dataset.originalUrl = originalInfo.url;
    fetchBtn.addEventListener("click", handleFetchTitleClick); // Use imported handler
    titleContainer.appendChild(fetchBtn);
  }

  // Title Span
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = originalInfo.title || originalInfo.url; // Display URL if title missing
  title.title = originalInfo.title || originalInfo.url; // Tooltip
  titleContainer.appendChild(title);
  listItem.appendChild(titleContainer);

  // Close Button
  const closeButton = document.createElement("button");
  closeButton.className = "close-tab-btn";
  closeButton.innerHTML = "&times;"; // Multiplication sign for 'x'
  closeButton.title = "Close Tab";
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation(); // Prevent triggering other clicks on the item
    closeTab(tab.id);
  });
  listItem.appendChild(closeButton);

  return listItem; // Return the created element
}

export async function renderTabs() {
  // console.time("renderTabs"); // Start performance timer

  // Cleanup checked state for closed tabs before fetching current ones
  try {
    const openTabsRaw = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    const openTabIds = new Set(openTabsRaw.map((tab) => tab.id));
    // Filter the existing checkedTabIds Set
    checkedTabIds = new Set(
      [...checkedTabIds].filter((id) => openTabIds.has(id))
    );
  } catch (error) {
    console.error("Error fetching open tabs for cleanup:", error);
    // Proceed even if cleanup fails, but log the error
  }

  // Fetch current tabs and groups
  try {
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    ]);

    // *** Use DocumentFragment for batch appending ***
    const fragment = document.createDocumentFragment();

    if (tabs.length === 0) {
      const noTabsPara = document.createElement("p");
      noTabsPara.textContent = "No tabs found.";
      fragment.appendChild(noTabsPara);
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
      checkedTabIds.clear(); // Ensure state is clear
    } else {
      selectAllCheckbox.disabled = false; // Enable checkbox if tabs exist

      const groupMap = new Map(groups.map((group) => [group.id, group]));
      const tabsByGroup = new Map();
      const ungroupedTabs = [];

      // Sort tabs into groups and ungrouped list
      tabs.forEach((tab) => {
        if (
          tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE &&
          groupMap.has(tab.groupId)
        ) {
          if (!tabsByGroup.has(tab.groupId)) {
            tabsByGroup.set(tab.groupId, []);
          }
          tabsByGroup.get(tab.groupId).push(tab);
        } else {
          ungroupedTabs.push(tab);
        }
      });

      // Render groups and their tabs to the fragment
      groups.forEach((group) => {
        const groupTabs = tabsByGroup.get(group.id);
        if (!groupTabs || groupTabs.length === 0) return; // Skip empty groups

        // Create and append group header
        const header = document.createElement("div");
        header.className = "tab-group-header";
        header.dataset.groupId = group.id;
        header.style.backgroundColor =
          groupBackgroundColorMap[group.color] || "#F1F3F4";
        header.style.borderBottom = `1px solid ${
          groupColorMap[group.color] || "#DADCE0"
        }`;

        const groupCheckbox = document.createElement("input");
        groupCheckbox.type = "checkbox";
        groupCheckbox.title = `Select/Deselect Group: ${
          group.title || "Unnamed Group"
        }`;
        groupCheckbox.dataset.groupId = group.id;
        groupCheckbox.className = "group-checkbox";
        groupCheckbox.addEventListener("change", handleGroupCheckboxChange);
        header.appendChild(groupCheckbox);

        const colorIndicator = document.createElement("span");
        colorIndicator.className = "group-color-indicator";
        colorIndicator.style.backgroundColor =
          groupColorMap[group.color] || "#DADCE0";
        header.appendChild(colorIndicator);

        const groupTitle = document.createElement("span");
        groupTitle.className = "group-title";
        groupTitle.textContent = group.title || "Unnamed Group";
        header.appendChild(groupTitle);

        fragment.appendChild(header); // Append header to fragment

        // Create and append tabs within the group
        groupTabs.forEach((tab) => {
          fragment.appendChild(
            createTabItemElement(tab, true, group.color) // Create element and append to fragment
          );
        });
      });

      // Render ungrouped tabs to the fragment
      if (ungroupedTabs.length > 0) {
        ungroupedTabs.forEach((tab) => {
          fragment.appendChild(createTabItemElement(tab, false, null)); // Create element and append to fragment
        });
      }
    }

    // Clear the existing list content *once*
    tabListElement.innerHTML = "";
    // Append the entire fragment to the DOM *once*
    tabListElement.appendChild(fragment);
    // *** End DocumentFragment usage ***

    updateSelectAllCheckboxState(); // Update counts/parents after rendering
  } catch (error) {
    console.error("Error loading tabs/groups:", error);
    tabListElement.innerHTML = "<p>Error loading tabs.</p>"; // Display error
    selectAllCheckbox.checked = false;
    selectAllCheckbox.disabled = true;
    selectedCountSpan.textContent = "(0)";
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
  // console.timeEnd("renderTabs"); // End performance timer
}

// --- Exported functions for external use ---
// getSelectedTabIds, getSelectedTabData, clearSelectedTabs, removeCheckedTabId remain the same
export function getSelectedTabIds() {
  return new Set(checkedTabIds);
}

export function getSelectedTabData() {
  const selectedData = [];
  const selectedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  );
  selectedCheckboxes.forEach((checkbox) => {
    const tabId = parseInt(checkbox.dataset.tabId, 10);
    if (!isNaN(tabId)) {
      selectedData.push({
        id: tabId,
        url: checkbox.dataset.tabUrl, // Original URL from dataset
        title: checkbox.dataset.tabTitle, // Original Title from dataset
      });
    }
  });
  return selectedData;
}

export function clearSelectedTabs() {
  checkedTabIds.clear();
  const checkboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  checkboxes.forEach((checkbox) => (checkbox.checked = false));
  const groupCheckboxes = tabListElement.querySelectorAll(".group-checkbox");
  groupCheckboxes.forEach((groupCheckbox) => {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = false;
  });
  updateSelectAllCheckboxState();
}
export function removeCheckedTabId(tabId) {
  checkedTabIds.delete(tabId);
}

// --- Setup ---
export function setupTabsUI() {
  selectAllCheckbox.addEventListener("change", handleSelectAllChange);
  headerCloseSelectedBtn.addEventListener(
    "click",
    handleCloseSelectedTabsClick
  );
  // Initial render is called from sidebar.js (debounced)
}
