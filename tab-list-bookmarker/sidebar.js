// sidebar.js

// Existing element references...
const tabListElement = document.getElementById("tab-list");
const bookmarkSelectedBtn = document.getElementById("bookmark-selected-btn");
const newFolderNameInput = document.getElementById("new-folder-name");
const bookmarkTreeContainer = document.getElementById(
  "bookmark-tree-container"
);
const selectedFolderDisplay = document.getElementById(
  "selected-folder-display"
);
const selectedFolderIdInput = document.getElementById("selected-folder-id");
const bookmarkDeleteBtn = document.getElementById("bookmark-delete-btn");
const statusMessageElement = document.getElementById("status-message");
const selectAllCheckbox = document.getElementById("select-all-checkbox");
const selectedCountSpan = document.getElementById("selected-count");
const targetGroupSelect = document.getElementById("target-group-select");
const newGroupOptionsDiv = document.getElementById("new-group-options");
const newGroupNameInput = document.getElementById("new-group-name");
const newGroupColorSelect = document.getElementById("new-group-color");
const moveToGroupBtn = document.getElementById("move-to-group-btn");
const groupStatusMessageElement = document.getElementById(
  "group-status-message"
);
const tabButtons = document.querySelectorAll(".tab-btn");
const tabPanels = document.querySelectorAll(".tab-panel");

// Color maps and constants
const groupColorMap = {
  grey: "#DADCE0",
  blue: "#89B4F8",
  red: "#F28B82",
  yellow: "#FDD663",
  green: "#81C995",
  pink: "#FF8BCB",
  purple: "#C58AF9",
  cyan: "#78D9EC",
  orange: "#FCAD70",
};
const groupBackgroundColorMap = {
  grey: "#F1F3F4",
  blue: "#E8F0FE",
  red: "#FCE8E6",
  yellow: "#FEF7E0",
  green: "#E6F4EA",
  pink: "#FCE8F4",
  purple: "#F3E8FD",
  cyan: "#E0FCFF",
  orange: "#FEEFDC",
};
const availableGroupColors = Object.keys(groupColorMap);

// Storage key for checked tab URLs
const CHECKED_TABS_STORAGE_KEY = "sidebarCheckedTabs";

// --- Action Tab Switching Logic ---
function handleTabClick(event) {
  const clickedButton = event.currentTarget;
  const targetPanelId = clickedButton.dataset.target;
  tabButtons.forEach((btn) => btn.classList.remove("active"));
  tabPanels.forEach((panel) => panel.classList.remove("active"));
  clickedButton.classList.add("active");
  const targetPanel = document.getElementById(targetPanelId);
  if (targetPanel) {
    targetPanel.classList.add("active");
  } else {
    console.error("Target panel not found:", targetPanelId);
  }
}

// --- Storage Helper Functions ---
async function getCheckedTabsFromStorage() {
  try {
    const result = await chrome.storage.local.get(CHECKED_TABS_STORAGE_KEY);
    return result[CHECKED_TABS_STORAGE_KEY] || {};
  } catch (error) {
    console.error("Error getting checked tabs from storage:", error);
    return {};
  }
}
async function saveCheckedTabsToStorage(checkedTabs) {
  try {
    await chrome.storage.local.set({ [CHECKED_TABS_STORAGE_KEY]: checkedTabs });
  } catch (error) {
    console.error("Error saving checked tabs to storage:", error);
  }
}

// --- Get Suspended Tab URL ---
// Extracts the original URL if the tab is suspended by certain extensions
function getSuspendedTabUrl(tabUrl) {
  if (!tabUrl) return tabUrl; // Return null/undefined if no URL

  // Check for common suspender extension patterns
  // Example: The Great Suspender (fiabciakcmgepblmdkmemdbbkilneeeh)
  if (tabUrl.startsWith("chrome-extension://") && tabUrl.includes("url=")) {
    try {
      const urlObject = new URL(tabUrl);
      const params = new URLSearchParams(urlObject.search);
      const originalUrl = params.get("url");
      if (originalUrl) {
        console.log(`Suspended URL detected. Original: ${originalUrl}`);
        return originalUrl; // Return the extracted original URL
      }
    } catch (e) {
      console.warn("Could not parse suspended URL:", tabUrl, e);
      // Fall through to return original tabUrl if parsing fails
    }
  }
  // If not identified as a known suspended URL pattern, return the original URL
  return tabUrl;
}

// --- Tab Loading and Display ---

// Helper function to create a single tab item element
function createTabItemElement(
  tab,
  checkedTabsState,
  isInGroup = false,
  groupColorName = null
) {
  const listItem = document.createElement("div");
  listItem.className = "tab-item" + (isInGroup ? " in-group" : "");
  listItem.dataset.tabId = tab.id;
  listItem.dataset.groupId = tab.groupId;

  // Apply group background/border if applicable
  if (isInGroup && groupColorName && groupBackgroundColorMap[groupColorName]) {
    listItem.style.backgroundColor = groupBackgroundColorMap[groupColorName];
    listItem.style.borderLeft = `4px solid ${groupColorMap[groupColorName]}`;
    listItem.style.paddingLeft = "21px";
  } else {
    listItem.style.paddingLeft = "15px";
  }

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.tabId = tab.id;
  checkbox.dataset.groupId = tab.groupId;
  // *** Store the potentially suspended URL initially ***
  checkbox.dataset.tabUrl = tab.url;
  checkbox.dataset.tabTitle = tab.title;

  // *** Use the ORIGINAL URL for checking storage state ***
  const originalUrl = getSuspendedTabUrl(tab.url);
  if (originalUrl && checkedTabsState[originalUrl]) {
    checkbox.checked = true;
  }

  checkbox.addEventListener("change", handleCheckboxChange);
  listItem.appendChild(checkbox);

  // Favicon
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  // Use original URL for favicon fetching if possible, otherwise fallback
  // Note: chrome://favicon/ may not work well with suspended URLs,
  // so using tab.favIconUrl might be more reliable here.
  favicon.src = tab.favIconUrl || "icons/default_favicon.png";
  favicon.alt = "";
  favicon.onerror = () => {
    favicon.src = "icons/default_favicon.png";
  };
  listItem.appendChild(favicon);

  // Title
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title || originalUrl || tab.url; // Prefer original URL if title missing
  title.title = tab.title || originalUrl || tab.url;
  listItem.appendChild(title);

  // Close Button
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

// Function to render the list of tabs
async function renderTabs() {
  const checkedTabsState = await getCheckedTabsFromStorage();
  try {
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    ]);
    tabListElement.innerHTML = "";
    if (tabs.length === 0) {
      tabListElement.innerHTML = "<p>No tabs found.</p>";
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
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
      tabListElement.appendChild(header);
      groupTabs.forEach((tab) => {
        tabListElement.appendChild(
          createTabItemElement(tab, checkedTabsState, true, group.color)
        );
      }); // Pass state
    });
    if (ungroupedTabs.length > 0) {
      ungroupedTabs.forEach((tab) => {
        tabListElement.appendChild(
          createTabItemElement(tab, checkedTabsState, false, null)
        );
      }); // Pass state
    }
    updateSelectAllCheckboxState();
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

// --- Tab Actions ---
async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
  } catch (error) {
    if (!error.message.toLowerCase().includes("no tab with id")) {
      console.error(`Error closing tab ${tabId}:`, error);
      setStatusMessage(`Error closing tab: ${error.message}`, true);
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

// UPDATED: Use original URL when collecting tabs for actions
function getSelectedTabs() {
  const selectedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  );
  const selectedTabs = [];
  selectedCheckboxes.forEach((checkbox) => {
    const tabId = parseInt(checkbox.dataset.tabId, 10);
    const originalUrl = getSuspendedTabUrl(checkbox.dataset.tabUrl); // Get original URL
    if (!isNaN(tabId)) {
      selectedTabs.push({
        id: tabId,
        url: originalUrl, // Use the original URL here
        title: checkbox.dataset.tabTitle,
      });
    } else {
      console.warn("Skipping tab with invalid ID:", checkbox.dataset.tabId);
    }
  });
  return selectedTabs;
}

// --- Checkbox State Management ---

// UPDATED: Use original URL for storage key
async function handleCheckboxChange(event) {
  const checkbox = event.target;
  const originalUrl = getSuspendedTabUrl(checkbox.dataset.tabUrl); // Get original URL
  const isChecked = checkbox.checked;

  if (!originalUrl) {
    // Check if we have a URL to store against
    console.warn(
      "Checkbox change ignored: No original URL found for tab ID",
      checkbox.dataset.tabId
    );
    updateSelectAllCheckboxState(); // Still update parent states
    return;
  }

  const checkedTabsState = await getCheckedTabsFromStorage();
  if (isChecked) {
    checkedTabsState[originalUrl] = true; // Use original URL as key
  } else {
    delete checkedTabsState[originalUrl]; // Use original URL as key
  }
  await saveCheckedTabsToStorage(checkedTabsState);
  updateSelectAllCheckboxState();
}

// Listener for group checkboxes (No change needed here, relies on handleCheckboxChange)
function handleGroupCheckboxChange(event) {
  const groupCheckbox = event.target;
  const groupId = groupCheckbox.dataset.groupId;
  const isChecked = groupCheckbox.checked;
  const memberTabCheckboxes = tabListElement.querySelectorAll(
    `.tab-item input[type="checkbox"][data-group-id="${groupId}"]`
  );
  memberTabCheckboxes.forEach((tabCheckbox) => {
    if (tabCheckbox.checked !== isChecked) {
      tabCheckbox.checked = isChecked;
      tabCheckbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
}

// Function to handle the main "Select All" checkbox click (No change needed here, relies on handleCheckboxChange)
function handleSelectAllChange() {
  const isChecked = selectAllCheckbox.checked;
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  individualCheckboxes.forEach((checkbox) => {
    if (checkbox.checked !== isChecked) {
      checkbox.checked = isChecked;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  const groupCheckboxes = tabListElement.querySelectorAll(".group-checkbox");
  groupCheckboxes.forEach((groupCheckbox) => {
    groupCheckbox.checked = isChecked;
    groupCheckbox.indeterminate = false;
  });
}

// Function to update parent checkboxes/counts based on DOM (No change needed here)
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

// Function to deselect all checkboxes (No change needed here, relies on handleCheckboxChange)
function deselectAllCheckboxes() {
  const checkboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  checkboxes.forEach((checkbox) => {
    if (checkbox.checked) {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  const groupCheckboxes = tabListElement.querySelectorAll(".group-checkbox");
  groupCheckboxes.forEach((groupCheckbox) => {
    groupCheckbox.checked = false;
    groupCheckbox.indeterminate = false;
  });
}

// --- Bookmarking ---
// UPDATED: createBookmarksInFolder now uses the URL passed in (which should be original)
async function createBookmarksInFolder(tabs, targetFolderId) {
  const successfullyBookmarkedTabs = [];
  let createdCount = 0;
  for (const tab of tabs) {
    // tabs array now contains original URLs from getSelectedTabs
    if (!tab.url || tab.url.startsWith("chrome://")) {
      console.warn(
        `Skipping invalid URL for bookmarking: ${tab.url || "Empty URL"}`
      );
      continue;
    }
    try {
      await chrome.bookmarks.create({
        parentId: targetFolderId,
        title: tab.title || tab.url,
        url: tab.url,
      }); // Use the provided tab.url
      successfullyBookmarkedTabs.push(tab);
      createdCount++;
    } catch (error) {
      console.error(
        `Error creating bookmark for tab ${tab.id} (${tab.title}):`,
        error
      );
      if (chrome.runtime.lastError) {
        console.error(
          "Chrome runtime error:",
          chrome.runtime.lastError.message
        );
      }
    }
  }
  console.log(
    `Attempted to bookmark ${tabs.length} tabs, successfully created ${createdCount} bookmarks.`
  );
  return successfullyBookmarkedTabs;
}
// Other bookmarking functions remain the same
function buildBookmarkTreeLevel(nodes, parentElement) {
  nodes.forEach((node) => {
    if (!node.url) {
      const folderDiv = document.createElement("div");
      folderDiv.className = "bookmark-folder";
      folderDiv.dataset.folderId = node.id;
      const detailsDiv = document.createElement("div");
      detailsDiv.className = "folder-details";
      const nameSpan = document.createElement("span");
      nameSpan.className = "folder-name";
      nameSpan.textContent = node.title || "Unnamed Folder";
      nameSpan.title = node.title || "Unnamed Folder";
      detailsDiv.appendChild(nameSpan);
      detailsDiv.addEventListener("click", (event) => {
        event.stopPropagation();
        const currentlySelected = bookmarkTreeContainer.querySelector(
          ".folder-details.selected"
        );
        if (currentlySelected) {
          currentlySelected.classList.remove("selected");
        }
        detailsDiv.classList.add("selected");
        selectedFolderIdInput.value = node.id;
        selectedFolderDisplay.textContent = nameSpan.textContent;
        selectedFolderDisplay.style.fontStyle = "normal";
        if (folderDiv.classList.contains("has-children")) {
          folderDiv.classList.toggle("expanded");
        }
      });
      folderDiv.appendChild(detailsDiv);
      const hasChildFolders =
        node.children && node.children.some((child) => !child.url);
      if (hasChildFolders) {
        folderDiv.classList.add("has-children");
        const childrenContainer = document.createElement("div");
        childrenContainer.className = "child-folders";
        buildBookmarkTreeLevel(node.children, childrenContainer);
        folderDiv.appendChild(childrenContainer);
      }
      parentElement.appendChild(folderDiv);
    }
  });
}
async function renderBookmarkTree() {
  try {
    const bookmarkTree = await chrome.bookmarks.getTree();
    bookmarkTreeContainer.innerHTML = "";
    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      buildBookmarkTreeLevel(bookmarkTree[0].children, bookmarkTreeContainer);
    } else {
      bookmarkTreeContainer.innerHTML = "<p>No bookmark folders found.</p>";
    }
    if (
      !selectedFolderIdInput.value ||
      !document.querySelector(
        `.bookmark-folder[data-folder-id="${selectedFolderIdInput.value}"]`
      )
    ) {
      selectedFolderIdInput.value = "";
      selectedFolderDisplay.textContent = "Select a folder below...";
      selectedFolderDisplay.style.fontStyle = "italic";
    }
  } catch (error) {
    console.error("Error rendering bookmark tree:", error);
    bookmarkTreeContainer.innerHTML = "<p>Error loading folders.</p>";
    setStatusMessage("Could not load bookmark folders.", true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}
async function performBookmarkOperation(
  selectedTabs,
  newFolderName,
  parentFolderId,
  parentFolderName
) {
  let targetFolderId;
  let successMessage;
  let bookmarkedTabs = [];
  try {
    if (newFolderName === "") {
      targetFolderId = parentFolderId;
      console.log(
        `Bookmarking directly into selected folder: ${parentFolderName} (ID: ${targetFolderId})`
      );
      bookmarkedTabs = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      );
      if (bookmarkedTabs.length > 0) {
        successMessage = `Successfully bookmarked ${bookmarkedTabs.length} tab(s) to folder "${parentFolderName}".`;
      } else {
        setStatusMessage("No valid tabs were bookmarked.", true);
        return { success: false, bookmarkedTabs: [] };
      }
    } else {
      console.log(
        `Creating new subfolder "${newFolderName}" inside parent folder: ${parentFolderName} (ID: ${parentFolderId})`
      );
      const newFolder = await chrome.bookmarks.create({
        parentId: parentFolderId,
        title: newFolderName,
      });
      targetFolderId = newFolder.id;
      console.log(
        `Created bookmark folder: ${newFolder.title} (ID: ${targetFolderId})`
      );
      bookmarkedTabs = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      );
      if (bookmarkedTabs.length > 0) {
        successMessage = `Successfully bookmarked ${bookmarkedTabs.length} tab(s) to new folder "${newFolderName}".`;
        await renderBookmarkTree();
        const parentDetails = bookmarkTreeContainer.querySelector(
          `.bookmark-folder[data-folder-id="${parentFolderId}"] > .folder-details`
        );
        if (parentDetails) {
          parentDetails.classList.add("selected");
          selectedFolderDisplay.textContent =
            parentDetails.querySelector(".folder-name").textContent;
          selectedFolderDisplay.style.fontStyle = "normal";
        } else {
          selectedFolderIdInput.value = "";
          selectedFolderDisplay.textContent = "Select a folder below...";
          selectedFolderDisplay.style.fontStyle = "italic";
        }
      } else {
        setStatusMessage("No valid tabs were bookmarked.", true);
        return { success: false, bookmarkedTabs: [] };
      }
    }
    setStatusMessage(successMessage);
    newFolderNameInput.value = "";
    deselectAllCheckboxes();
    return { success: true, bookmarkedTabs: bookmarkedTabs };
  } catch (error) {
    console.error("Error during bookmark operation:", error);
    setStatusMessage(`Error creating bookmarks: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
    return { success: false, bookmarkedTabs: [] };
  }
}
async function handleBookmarkSelectedClick() {
  const selectedTabs = getSelectedTabs();
  const newFolderName = newFolderNameInput.value.trim();
  const parentFolderId = selectedFolderIdInput.value;
  const parentFolderName = selectedFolderDisplay.textContent;
  if (selectedTabs.length === 0) {
    setStatusMessage("No tabs selected to bookmark.", true);
    return;
  }
  if (!parentFolderId) {
    setStatusMessage(
      "Please select a parent folder from the tree below.",
      true
    );
    return;
  }
  setStatusMessage("Bookmarking...");
  await performBookmarkOperation(
    selectedTabs,
    newFolderName,
    parentFolderId,
    parentFolderName
  );
}
async function handleBookmarkAndDeleteClick() {
  const selectedTabs = getSelectedTabs();
  const newFolderName = newFolderNameInput.value.trim();
  const parentFolderId = selectedFolderIdInput.value;
  const parentFolderName = selectedFolderDisplay.textContent;
  if (selectedTabs.length === 0) {
    setStatusMessage("No tabs selected.", true);
    return;
  }
  if (!parentFolderId) {
    setStatusMessage(
      "Please select a parent folder from the tree below.",
      true
    );
    return;
  }
  setStatusMessage("Bookmarking...");
  const bookmarkResult = await performBookmarkOperation(
    selectedTabs,
    newFolderName,
    parentFolderId,
    parentFolderName
  );
  if (bookmarkResult.success && bookmarkResult.bookmarkedTabs.length > 0) {
    setStatusMessage("Bookmark successful. Deleting tabs...");
    const tabIdsToDelete = bookmarkResult.bookmarkedTabs.map((tab) => tab.id);
    console.log("Attempting to delete tabs:", tabIdsToDelete);
    try {
      let closedCount = 0;
      for (const tabId of tabIdsToDelete) {
        await closeTab(tabId);
        closedCount++;
      }
      setStatusMessage(`Bookmarked and closed ${closedCount} tab(s).`);
    } catch (error) {
      console.error("Error during tab deletion process:", error);
      setStatusMessage(
        "Bookmarking succeeded, but error occurred during tab deletion.",
        true
      );
    }
  } else if (!bookmarkResult.success) {
    console.log("Bookmarking failed. Tabs will not be deleted.");
  } else {
    console.log(
      "Bookmarking reported success, but no tabs were bookmarked. No tabs to delete."
    );
  }
}

// --- Tab Grouping Logic --- (Code remains the same)
async function loadExistingGroups() {
  try {
    const groups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    targetGroupSelect.innerHTML = "";
    const newGroupOption = document.createElement("option");
    newGroupOption.value = "new";
    newGroupOption.textContent = "Create New Group...";
    targetGroupSelect.appendChild(newGroupOption);
    groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      const colorIndicator = `<span class="group-color-indicator" style="background-color: ${
        groupColorMap[group.color] || "#DADCE0"
      }; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle;"></span>`;
      option.innerHTML = colorIndicator + (group.title || `Group ${group.id}`);
      targetGroupSelect.appendChild(option);
    });
    handleTargetGroupChange();
  } catch (error) {
    console.error("Error loading tab groups:", error);
    targetGroupSelect.innerHTML =
      '<option value="">Error loading groups</option>';
    setGroupStatusMessage("Could not load groups.", true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}
function populateNewGroupColors() {
  newGroupColorSelect.innerHTML = "";
  availableGroupColors.forEach((colorName) => {
    const option = document.createElement("option");
    option.value = colorName;
    option.textContent = colorName.charAt(0).toUpperCase() + colorName.slice(1);
    option.style.backgroundColor =
      groupBackgroundColorMap[colorName] || "#F1F3F4";
    newGroupColorSelect.appendChild(option);
  });
  newGroupColorSelect.value = "grey";
}
function handleTargetGroupChange() {
  if (targetGroupSelect.value === "new") {
    newGroupOptionsDiv.classList.remove("hidden");
  } else {
    newGroupOptionsDiv.classList.add("hidden");
  }
}
async function handleMoveToGroupClick() {
  const selectedTabs = getSelectedTabs();
  const targetGroupIdOrNew = targetGroupSelect.value;
  if (selectedTabs.length === 0) {
    setGroupStatusMessage("No tabs selected to move.", true);
    return;
  }
  if (!targetGroupIdOrNew) {
    setGroupStatusMessage(
      "Please select a target group or 'Create New'.",
      true
    );
    return;
  }
  const tabIdsToMove = selectedTabs.map((tab) => tab.id);
  setGroupStatusMessage("Moving tabs...");
  try {
    if (targetGroupIdOrNew === "new") {
      const createProperties = {};
      const newName = newGroupNameInput.value.trim();
      const newColor = newGroupColorSelect.value;
      if (newName) {
        createProperties.title = newName;
      }
      createProperties.color = newColor;
      console.log(
        "Creating new group with properties:",
        createProperties,
        "for tabs:",
        tabIdsToMove
      );
      const newGroupId = await chrome.tabs.group({
        tabIds: tabIdsToMove,
        createProperties: createProperties,
      });
      console.log("Created new group with ID:", newGroupId);
      setGroupStatusMessage(
        `Moved ${tabIdsToMove.length} tab(s) to new group ${
          newName || `(ID: ${newGroupId})`
        }.`
      );
      newGroupNameInput.value = "";
    } else {
      const targetGroupId = parseInt(targetGroupIdOrNew, 10);
      if (isNaN(targetGroupId)) {
        setGroupStatusMessage("Invalid target group selected.", true);
        return;
      }
      console.log(
        `Moving tabs ${tabIdsToMove} to existing group ID: ${targetGroupId}`
      );
      await chrome.tabs.group({ tabIds: tabIdsToMove, groupId: targetGroupId });
      try {
        const groupInfo = await chrome.tabGroups.get(targetGroupId);
        setGroupStatusMessage(
          `Moved ${tabIdsToMove.length} tab(s) to group "${
            groupInfo.title || `Group ${targetGroupId}`
          }".`
        );
      } catch (groupError) {
        console.warn("Could not get group info after moving tabs:", groupError);
        setGroupStatusMessage(
          `Moved ${tabIdsToMove.length} tab(s) to group ${targetGroupId}.`
        );
      }
    }
    await renderTabs();
    await loadExistingGroups();
    deselectAllCheckboxes();
  } catch (error) {
    console.error("Error moving tabs to group:", error);
    setGroupStatusMessage(`Error moving tabs: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
    await renderTabs();
    await loadExistingGroups();
  }
}

// --- Utility Functions ---
function setStatusMessage(message, isError = false) {
  statusMessageElement.textContent = message;
  statusMessageElement.style.color = isError ? "#d9534f" : "#31708f";
  const timeout = message.includes("closed") ? 7000 : 5000;
  setTimeout(() => {
    if (statusMessageElement.textContent === message) {
      statusMessageElement.textContent = "";
    }
  }, timeout);
}
function setGroupStatusMessage(message, isError = false) {
  groupStatusMessageElement.textContent = message;
  groupStatusMessageElement.style.color = isError ? "#d9534f" : "#31708f";
  const timeout = 5000;
  setTimeout(() => {
    if (groupStatusMessageElement.textContent === message) {
      groupStatusMessageElement.textContent = "";
    }
  }, timeout);
}

// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  renderBookmarkTree();
  loadExistingGroups();
  populateNewGroupColors();
  tabButtons.forEach((button) => {
    button.addEventListener("click", handleTabClick);
  });
});
chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.url ||
    changeInfo.title ||
    changeInfo.status === "complete" ||
    changeInfo.groupId !== undefined ||
    changeInfo.favIconUrl
  ) {
    renderTabs();
  }
});
chrome.tabs.onAttached.addListener(renderTabs);
chrome.tabs.onDetached.addListener(renderTabs);
function handleGroupChange() {
  renderTabs();
  loadExistingGroups();
}
chrome.tabGroups.onCreated.addListener(handleGroupChange);
chrome.tabGroups.onRemoved.addListener(handleGroupChange);
chrome.tabGroups.onUpdated.addListener(handleGroupChange);
chrome.tabGroups.onMoved.addListener(handleGroupChange);
chrome.bookmarks.onCreated.addListener(renderBookmarkTree);
chrome.bookmarks.onRemoved.addListener(renderBookmarkTree);
chrome.bookmarks.onChanged.addListener(renderBookmarkTree);
chrome.bookmarks.onMoved.addListener(renderBookmarkTree);
selectAllCheckbox.addEventListener("change", handleSelectAllChange);
bookmarkSelectedBtn.addEventListener("click", handleBookmarkSelectedClick);
bookmarkDeleteBtn.addEventListener("click", handleBookmarkAndDeleteClick);
targetGroupSelect.addEventListener("change", handleTargetGroupChange);
moveToGroupBtn.addEventListener("click", handleMoveToGroupClick);
newFolderNameInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    handleBookmarkSelectedClick();
  }
});
newGroupNameInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    handleMoveToGroupClick();
  }
});

console.log("Sidebar script loaded (using original URLs for state/actions).");
