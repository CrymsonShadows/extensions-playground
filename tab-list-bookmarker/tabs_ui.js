// tabs_ui.js
import { groupColorMap, groupBackgroundColorMap } from "./constants.js";
import { getOriginalTabInfo, setStatusMessage } from "./utils.js"; // Import setStatusMessage
import { handleFetchTitleClick } from "./ui.js";

// --- In-memory state for checked tabs ---
let checkedTabIds = new Set();

// --- Element References ---
const tabListElement = document.getElementById("tab-list");
const selectAllCheckbox = document.getElementById("select-all-checkbox");
const selectedCountSpan = document.getElementById("selected-count");
// NEW: Header Close Button Reference
const headerCloseSelectedBtn = document.getElementById(
  "header-close-selected-btn"
);
// NEW: Tab List Status Message Element
const tabListStatusMessageElement = document.getElementById(
  "tab-list-status-message"
);

// --- Checkbox State Management ---
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
async function closeTab(tabId) {
  checkedTabIds.delete(tabId); // Remove from state first
  try {
    await chrome.tabs.remove(tabId);
    // The onRemoved listener in sidebar.js will trigger renderTabs
  } catch (error) {
    if (!error.message.toLowerCase().includes("no tab with id")) {
      console.error(`Error closing tab ${tabId}:`, error);
      // Use the new tab list status message element
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
      renderTabs(); // Re-render to ensure list consistency
    }
  }
}

// --- NEW: Close Selected Tabs Action (Moved Here) ---
async function handleCloseSelectedTabsClick() {
  const selectedIdsSet = getSelectedTabIds(); // Get the Set of IDs
  if (selectedIdsSet.size === 0) {
    // Use the new tab list status message element
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
    // The onRemoved listener in sidebar.js handles cleanup and re-render
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
    // Re-render might happen via onRemoved anyway
  }
}

// --- Tab List Rendering ---
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
  checkbox.checked = checkedTabIds.has(tab.id); // Use Set for state
  checkbox.addEventListener("change", handleCheckboxChange); // Use local handler
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

  // Add fetch button before title if needed
  if (originalInfo.needsTitleFetch) {
    const fetchBtn = document.createElement("button");
    fetchBtn.className = "fetch-title-btn";
    fetchBtn.innerHTML = "🔄";
    fetchBtn.title = "Load tab to get title";
    fetchBtn.dataset.tabId = tab.id;
    fetchBtn.dataset.originalUrl = originalInfo.url;
    fetchBtn.addEventListener("click", handleFetchTitleClick); // Use imported handler
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
    closeTab(tab.id); // Use local handler
  });
  listItem.appendChild(closeButton);

  return listItem;
}

export async function renderTabs() {
  // Cleanup checked state for closed tabs
  try {
    const openTabs = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    const openTabIds = new Set(openTabs.map((tab) => tab.id));
    checkedTabIds = new Set(
      [...checkedTabIds].filter((id) => openTabIds.has(id))
    );
  } catch (error) {
    console.error("Error fetching open tabs for cleanup:", error);
  }

  // Fetch current tabs and groups
  try {
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    ]);
    tabListElement.innerHTML = ""; // Clear list

    if (tabs.length === 0) {
      tabListElement.innerHTML = "<p>No tabs found.</p>";
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
      checkedTabIds.clear();
      updateSelectAllCheckboxState();
      return;
    }
    selectAllCheckbox.disabled = false;

    const groupMap = new Map(groups.map((group) => [group.id, group]));
    const tabsByGroup = new Map();
    const ungroupedTabs = [];
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

    // Render groups
    groups.forEach((group) => {
      const groupTabs = tabsByGroup.get(group.id);
      if (!groupTabs || groupTabs.length === 0) return;
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
      header.appendChild(groupCheckbox); // Use local handler
      const colorIndicator = document.createElement("span");
      colorIndicator.className = "group-color-indicator";
      colorIndicator.style.backgroundColor =
        groupColorMap[group.color] || "#DADCE0";
      header.appendChild(colorIndicator);
      const groupTitle = document.createElement("span");
      groupTitle.className = "group-title";
      groupTitle.textContent = group.title || "Unnamed Group";
      header.appendChild(groupTitle);
      tabListElement.appendChild(header);
      groupTabs.forEach((tab) => {
        tabListElement.appendChild(
          createTabItemElement(tab, true, group.color)
        );
      });
    });

    // Render ungrouped tabs
    if (ungroupedTabs.length > 0) {
      ungroupedTabs.forEach((tab) => {
        tabListElement.appendChild(createTabItemElement(tab, false, null));
      });
    }

    updateSelectAllCheckboxState(); // Update counts/parents
  } catch (error) {
    console.error("Error loading tabs/groups:", error);
    tabListElement.innerHTML = "<p>Error loading tabs.</p>";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.disabled = true;
    selectedCountSpan.textContent = "(0)";
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Exported functions for external use ---
export function getSelectedTabIds() {
  // Return a copy of the Set to prevent external modification
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
  // Keep this if needed elsewhere, though onRemoved handles it now
  checkedTabIds.delete(tabId);
}

// --- Setup ---
export function setupTabsUI() {
  selectAllCheckbox.addEventListener("change", handleSelectAllChange);
  // Add listener for the new header close button
  headerCloseSelectedBtn.addEventListener(
    "click",
    handleCloseSelectedTabsClick
  );
  // Initial render is called from sidebar.js
}
