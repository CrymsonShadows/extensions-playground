// tabs_ui.js
import { groupColorMap, groupBackgroundColorMap } from "./constants.js";
import { getOriginalTabInfo, setStatusMessage, debounce } from "./utils.js"; // Import debounce
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
const tabSearchInput = document.getElementById("tab-search-input"); // NEW: Search input

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
  updateSelectAllCheckboxState();
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
  updateSelectAllCheckboxState();
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
  updateSelectAllCheckboxState();
}

function updateSelectAllCheckboxState() {
  // Query only visible checkboxes after potential filtering
  const visibleTabCheckboxes = tabListElement.querySelectorAll(
    '.tab-item:not(.hidden) input[type="checkbox"]'
  );
  const totalVisibleTabs = visibleTabCheckboxes.length;
  const totalSelectedVisibleTabs = tabListElement.querySelectorAll(
    '.tab-item:not(.hidden) input[type="checkbox"]:checked'
  ).length;

  // Update selected count display based on *all* selected tabs (not just visible)
  selectedCountSpan.textContent = `(${checkedTabIds.size})`;

  let allVisibleGroupsChecked = true;
  let noVisibleGroupsChecked = true;
  let anyVisibleGroupIndeterminate = false;

  const groupHeaders = tabListElement.querySelectorAll(
    ".tab-group-header:not(.hidden)"
  ); // Consider only visible headers
  groupHeaders.forEach((header) => {
    const groupId = header.dataset.groupId;
    const groupCheckbox = header.querySelector(".group-checkbox");
    // Check only visible tabs within this group
    const memberTabCheckboxes = tabListElement.querySelectorAll(
      `.tab-item:not(.hidden) input[type="checkbox"][data-group-id="${groupId}"]`
    );
    const totalVisibleInGroup = memberTabCheckboxes.length;
    const selectedVisibleInGroup = tabListElement.querySelectorAll(
      `.tab-item:not(.hidden) input[type="checkbox"][data-group-id="${groupId}"]:checked`
    ).length;

    if (totalVisibleInGroup > 0) {
      if (selectedVisibleInGroup === totalVisibleInGroup) {
        groupCheckbox.checked = true;
        groupCheckbox.indeterminate = false;
        noVisibleGroupsChecked = false;
      } else if (selectedVisibleInGroup === 0) {
        groupCheckbox.checked = false;
        groupCheckbox.indeterminate = false;
        allVisibleGroupsChecked = false;
      } else {
        groupCheckbox.checked = false;
        groupCheckbox.indeterminate = true;
        allVisibleGroupsChecked = false;
        noVisibleGroupsChecked = false;
        anyVisibleGroupIndeterminate = true;
      }
      groupCheckbox.disabled = false;
    } else {
      // If no visible tabs in group, uncheck and disable group checkbox
      groupCheckbox.checked = false;
      groupCheckbox.indeterminate = false;
      groupCheckbox.disabled = true;
      // Don't factor this group into the overall select-all state
    }
  });

  // Check visible ungrouped tabs
  const ungroupedCheckboxes = tabListElement.querySelectorAll(
    `.tab-item:not(.hidden) input[type="checkbox"][data-group-id="${chrome.tabGroups.TAB_GROUP_ID_NONE}"]`
  );
  const totalVisibleUngrouped = ungroupedCheckboxes.length;
  const selectedVisibleUngrouped = tabListElement.querySelectorAll(
    `.tab-item:not(.hidden) input[type="checkbox"][data-group-id="${chrome.tabGroups.TAB_GROUP_ID_NONE}"]:checked`
  ).length;

  let allVisibleUngroupedChecked =
    totalVisibleUngrouped > 0 &&
    selectedVisibleUngrouped === totalVisibleUngrouped;
  let noVisibleUngroupedChecked = selectedVisibleUngrouped === 0;

  // Determine Select All state based on *visible* items
  if (totalVisibleTabs === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = true;
  } else {
    selectAllCheckbox.disabled = false;
    // Check if all visible groups (that have visible tabs) are fully checked AND all visible ungrouped are checked
    const allRelevantGroupsChecked = [...groupHeaders].every((header) => {
      const groupCheckbox = header.querySelector(".group-checkbox");
      return groupCheckbox.disabled || groupCheckbox.checked; // Ignore disabled (empty) groups
    });

    if (
      allRelevantGroupsChecked &&
      (totalVisibleUngrouped === 0 || allVisibleUngroupedChecked)
    ) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    }
    // Check if no visible groups (with visible tabs) are checked/indeterminate AND no visible ungrouped are checked
    else if (
      noVisibleGroupsChecked &&
      !anyVisibleGroupIndeterminate &&
      (totalVisibleUngrouped === 0 || noVisibleUngroupedChecked)
    ) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    }
    // Otherwise, indeterminate
    else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

// --- Tab Actions ---
// closeTab, handleCloseSelectedTabsClick remain the same
async function closeTab(tabId) {
  checkedTabIds.delete(tabId);
  try {
    await chrome.tabs.remove(tabId);
    // Listener in sidebar.js triggers debouncedRenderTabs
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
    }
  }
}

async function handleCloseSelectedTabsClick() {
  const selectedIdsSet = getSelectedTabIds();
  if (selectedIdsSet.size === 0) {
    setStatusMessage(
      tabListStatusMessageElement,
      "No tabs selected to close.",
      true
    );
    return;
  }

  const tabIdsToClose = Array.from(selectedIdsSet);
  setStatusMessage(
    tabListStatusMessageElement,
    `Closing ${tabIdsToClose.length} selected tab(s)...`
  );
  console.log("Attempting to close tabs:", tabIdsToClose);

  try {
    await chrome.tabs.remove(tabIdsToClose);
    setStatusMessage(
      tabListStatusMessageElement,
      `Closed ${tabIdsToClose.length} tab(s).`
    );
    // Listener handles re-render
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
// createTabItemElement remains the same
function createTabItemElement(tab, isInGroup = false, groupColorName = null) {
  const listItem = document.createElement("div");
  listItem.className = "tab-item" + (isInGroup ? " in-group" : "");
  listItem.dataset.tabId = tab.id;
  listItem.dataset.groupId = tab.groupId;

  const originalInfo = getOriginalTabInfo(tab.url, tab.title);

  if (isInGroup && groupColorName && groupBackgroundColorMap[groupColorName]) {
    listItem.style.backgroundColor = groupBackgroundColorMap[groupColorName];
    listItem.style.borderLeft = `4px solid ${groupColorMap[groupColorName]}`;
    listItem.style.paddingLeft = "21px";
  } else {
    listItem.style.paddingLeft = "15px";
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.tabId = tab.id;
  checkbox.dataset.groupId = tab.groupId;
  checkbox.dataset.tabUrl = originalInfo.url;
  checkbox.dataset.tabTitle = originalInfo.title;
  checkbox.checked = checkedTabIds.has(tab.id);
  checkbox.addEventListener("change", handleCheckboxChange);
  listItem.appendChild(checkbox);

  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src = tab.favIconUrl || "icons/default_favicon.png";
  favicon.alt = "";
  favicon.onerror = () => {
    favicon.src = "icons/default_favicon.png";
  };
  listItem.appendChild(favicon);

  const titleContainer = document.createElement("div");
  titleContainer.className = "tab-title-container";

  if (originalInfo.needsTitleFetch) {
    const fetchBtn = document.createElement("button");
    fetchBtn.className = "fetch-title-btn";
    fetchBtn.innerHTML = "🔄";
    fetchBtn.title = "Load tab to get title";
    fetchBtn.dataset.tabId = tab.id;
    fetchBtn.dataset.originalUrl = originalInfo.url;
    fetchBtn.addEventListener("click", handleFetchTitleClick);
    titleContainer.appendChild(fetchBtn);
  }

  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = originalInfo.title || originalInfo.url;
  title.title = originalInfo.title || originalInfo.url;
  titleContainer.appendChild(title);
  listItem.appendChild(titleContainer);

  const closeButton = document.createElement("button");
  closeButton.className = "close-tab-btn";
  closeButton.innerHTML = "&times;";
  closeButton.title = "Close Tab";
  closeButton.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTab(tab.id);
  });
  listItem.appendChild(closeButton);

  return listItem;
}

// *** UPDATED renderTabs function ***
export async function renderTabs() {
  // Cleanup checked state (no changes needed here)
  try {
    const openTabsRaw = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    const openTabIds = new Set(openTabsRaw.map((tab) => tab.id));
    checkedTabIds = new Set(
      [...checkedTabIds].filter((id) => openTabIds.has(id))
    );
  } catch (error) {
    console.error("Error fetching open tabs for cleanup:", error);
  }

  // Get search term
  const searchTerm = tabSearchInput.value.toLowerCase().trim();

  try {
    const [allTabs, groups] = await Promise.all([
      chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    ]);

    // *** Filter tabs based on search term ***
    const filteredTabs = searchTerm
      ? allTabs.filter((tab) => {
          const info = getOriginalTabInfo(tab.url, tab.title);
          const titleMatch =
            info.title && info.title.toLowerCase().includes(searchTerm);
          const urlMatch =
            info.url && info.url.toLowerCase().includes(searchTerm);
          return titleMatch || urlMatch;
        })
      : allTabs; // If no search term, use all tabs

    const fragment = document.createDocumentFragment();

    if (filteredTabs.length === 0) {
      const noTabsPara = document.createElement("p");
      noTabsPara.textContent = searchTerm
        ? "No tabs match your search."
        : "No tabs found.";
      fragment.appendChild(noTabsPara);
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
      // Don't clear checkedTabIds here, filter might just hide them
    } else {
      selectAllCheckbox.disabled = false;

      const groupMap = new Map(groups.map((group) => [group.id, group]));
      const tabsByGroup = new Map();
      const ungroupedTabs = [];

      // Sort *filtered* tabs into groups
      filteredTabs.forEach((tab) => {
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

      // Keep track of rendered group headers
      const renderedGroupHeaders = new Set();

      // Render groups *only if they contain filtered tabs*
      groups.forEach((group) => {
        const groupTabs = tabsByGroup.get(group.id);
        // Check if this group has any tabs *after filtering*
        if (groupTabs && groupTabs.length > 0) {
          // Create and append group header
          const header = document.createElement("div");
          header.className = "tab-group-header";
          header.dataset.groupId = group.id;
          // Style header as before...
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
          renderedGroupHeaders.add(group.id); // Mark header as rendered

          // Append tabs within the group
          groupTabs.forEach((tab) => {
            fragment.appendChild(createTabItemElement(tab, true, group.color));
          });
        }
      });

      // Render ungrouped tabs (already filtered)
      if (ungroupedTabs.length > 0) {
        ungroupedTabs.forEach((tab) => {
          fragment.appendChild(createTabItemElement(tab, false, null));
        });
      }
    }

    tabListElement.innerHTML = ""; // Clear existing list
    tabListElement.appendChild(fragment); // Append filtered content

    updateSelectAllCheckboxState(); // Update counts/parents based on visible items
  } catch (error) {
    console.error("Error loading/filtering tabs:", error);
    tabListElement.innerHTML = "<p>Error loading tabs.</p>";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.disabled = true;
    selectedCountSpan.textContent = "(0)";
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// Create debounced version for search input
const debouncedRenderTabs = debounce(renderTabs, 250);

// --- Exported functions ---
// getSelectedTabIds, getSelectedTabData, clearSelectedTabs, removeCheckedTabId remain the same
export function getSelectedTabIds() {
  return new Set(checkedTabIds);
}

export function getSelectedTabData() {
  const selectedData = [];
  // Query only visible checkboxes if needed, but usually better to get all selected
  const selectedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  );
  selectedCheckboxes.forEach((checkbox) => {
    const tabId = parseInt(checkbox.dataset.tabId, 10);
    if (!isNaN(tabId) && checkedTabIds.has(tabId)) {
      // Double check against state
      selectedData.push({
        id: tabId,
        url: checkbox.dataset.tabUrl,
        title: checkbox.dataset.tabTitle,
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
  // NEW: Add listener for search input
  tabSearchInput.addEventListener("input", debouncedRenderTabs);

  // Initial render is called from sidebar.js
}
