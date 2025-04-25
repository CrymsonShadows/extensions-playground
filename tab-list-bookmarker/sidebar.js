// sidebar.js

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

// Map Chrome group colors to CSS-friendly values (Hex)
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

// NEW: Map group colors to lighter background shades for tab items
const groupBackgroundColorMap = {
  grey: "#F1F3F4", // Lighter grey
  blue: "#E8F0FE", // Lighter blue
  red: "#FCE8E6", // Lighter red
  yellow: "#FEF7E0", // Lighter yellow
  green: "#E6F4EA", // Lighter green
  pink: "#FCE8F4", // Lighter pink
  purple: "#F3E8FD", // Lighter purple
  cyan: "#E0FCFF", // Lighter cyan
  orange: "#FEEFDC", // Lighter orange
};

// --- Tab Loading and Display ---

// Helper function to create a single tab item element
// UPDATED: Accepts groupColorName ('blue', 'red', etc.)
function createTabItemElement(tab, isInGroup = false, groupColorName = null) {
  const listItem = document.createElement("div");
  listItem.className = "tab-item" + (isInGroup ? " in-group" : "");
  listItem.dataset.tabId = tab.id;
  listItem.dataset.groupId = tab.groupId;

  // Apply background color if in a group with a known color
  if (isInGroup && groupColorName && groupBackgroundColorMap[groupColorName]) {
    listItem.style.backgroundColor = groupBackgroundColorMap[groupColorName];
    // Add a border in the original group color for visual connection
    listItem.style.borderLeft = `4px solid ${groupColorMap[groupColorName]}`;
    // Adjust padding slightly to account for the border
    listItem.style.paddingLeft = isInGroup ? "21px" : "15px"; // Original was 25px/15px
  }

  // Checkbox
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.tabId = tab.id;
  checkbox.dataset.groupId = tab.groupId;
  checkbox.dataset.tabUrl = tab.url;
  checkbox.dataset.tabTitle = tab.title;
  checkbox.addEventListener("change", updateSelectAllCheckboxState);
  listItem.appendChild(checkbox);

  // Favicon
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src = tab.favIconUrl || "icons/default_favicon.png";
  favicon.alt = "";
  favicon.onerror = () => {
    favicon.src = "icons/default_favicon.png";
  };
  listItem.appendChild(favicon);

  // Title
  const title = document.createElement("span");
  title.className = "tab-title";
  title.textContent = tab.title || tab.url;
  title.title = tab.title || tab.url;
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

// Function to render the list of tabs, now including groups
// UPDATED: Passes group color to createTabItemElement
async function renderTabs() {
  try {
    const [tabs, groups] = await Promise.all([
      chrome.tabs.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT }),
    ]);

    tabListElement.innerHTML = "";

    if (tabs.length === 0) {
      tabListElement.innerHTML = "<p>No tabs found in this window.</p>";
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

    // Render groups first
    groups.forEach((group) => {
      const groupTabs = tabsByGroup.get(group.id);
      if (!groupTabs || groupTabs.length === 0) return;

      // Create Group Header
      const header = document.createElement("div");
      header.className = "tab-group-header";
      header.dataset.groupId = group.id;
      // Style header background slightly darker than tabs
      header.style.backgroundColor =
        groupBackgroundColorMap[group.color] || "#F1F3F4";
      header.style.borderBottom = `1px solid ${
        groupColorMap[group.color] || "#DADCE0"
      }`;

      // Group Checkbox
      const groupCheckbox = document.createElement("input");
      groupCheckbox.type = "checkbox";
      groupCheckbox.title = `Select/Deselect Group: ${
        group.title || "Unnamed Group"
      }`;
      groupCheckbox.dataset.groupId = group.id;
      groupCheckbox.className = "group-checkbox";
      groupCheckbox.addEventListener("change", handleGroupCheckboxChange);
      header.appendChild(groupCheckbox);

      // Color Indicator (using original group color)
      const colorIndicator = document.createElement("span");
      colorIndicator.className = "group-color-indicator";
      colorIndicator.style.backgroundColor =
        groupColorMap[group.color] || "#DADCE0";
      header.appendChild(colorIndicator);

      // Group Title
      const groupTitle = document.createElement("span");
      groupTitle.className = "group-title";
      groupTitle.textContent = group.title || "Unnamed Group";
      header.appendChild(groupTitle);

      tabListElement.appendChild(header);

      // Render Tabs within the group, passing the color name
      groupTabs.forEach((tab) => {
        // Pass the group color name (e.g., 'blue')
        tabListElement.appendChild(
          createTabItemElement(tab, true, group.color)
        );
      });
    });

    // Render Ungrouped Tabs
    if (ungroupedTabs.length > 0) {
      ungroupedTabs.forEach((tab) => {
        // Pass false for isInGroup and null for color
        tabListElement.appendChild(createTabItemElement(tab, false, null));
      });
    }

    updateSelectAllCheckboxState();
  } catch (error) {
    console.error("Error loading tabs/groups:", error);
    tabListElement.innerHTML =
      "<p>Error loading tabs. See console for details.</p>";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.disabled = true;
    selectedCountSpan.textContent = "(0)";
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Tab Actions ---

// Function to close a specific tab (Same as before)
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

// Function to get selected tabs (Same as before)
function getSelectedTabs() {
  const selectedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  );
  const selectedTabs = [];
  selectedCheckboxes.forEach((checkbox) => {
    const tabId = parseInt(checkbox.dataset.tabId, 10);
    if (!isNaN(tabId)) {
      selectedTabs.push({
        id: tabId,
        url: checkbox.dataset.tabUrl,
        title: checkbox.dataset.tabTitle,
      });
    } else {
      console.warn("Skipping tab with invalid ID:", checkbox.dataset.tabId);
    }
  });
  return selectedTabs;
}

// --- Checkbox State Management ---

// Listener for group checkboxes (Same as before)
function handleGroupCheckboxChange(event) {
  const groupCheckbox = event.target;
  const groupId = groupCheckbox.dataset.groupId;
  const isChecked = groupCheckbox.checked;
  const memberTabCheckboxes = tabListElement.querySelectorAll(
    `.tab-item input[type="checkbox"][data-group-id="${groupId}"]`
  );
  memberTabCheckboxes.forEach((tabCheckbox) => {
    tabCheckbox.checked = isChecked;
  });
  updateSelectAllCheckboxState();
}

// Function to handle the main "Select All" checkbox click (Same as before)
function handleSelectAllChange() {
  const isChecked = selectAllCheckbox.checked;
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  individualCheckboxes.forEach((checkbox) => {
    checkbox.checked = isChecked;
  });
  const groupCheckboxes = tabListElement.querySelectorAll(".group-checkbox");
  groupCheckboxes.forEach((groupCheckbox) => {
    groupCheckbox.checked = isChecked;
    groupCheckbox.indeterminate = false;
  });
  updateSelectAllCheckboxState();
}

// Function to update the state of ALL checkboxes (Main, Groups, Counts) (Same as before)
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

// Function to deselect all checkboxes (Same as before)
function deselectAllCheckboxes() {
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

// --- Bookmarking ---

// Function to build a single level of the bookmark tree recursively (Same as before)
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

// Function to render the entire bookmark tree (Same as before)
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

// Helper function to create bookmarks (Same as before)
async function createBookmarksInFolder(tabs, targetFolderId) {
  const successfullyBookmarkedTabs = [];
  let createdCount = 0;
  for (const tab of tabs) {
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
      });
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

// Main function to handle bookmarking (Same as before)
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

// --- Button Action Functions ---

// Function for the "Bookmark Selected" button (Same as before)
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

// Function for the "Bookmark & Delete" button (Same as before)
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

// --- Utility Functions ---

// Function to display status messages (Same as before)
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

// --- Event Listeners ---

// Initial load (Same as before)
document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  renderBookmarkTree();
});

// Listen for tab events (Same as before)
chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (
    changeInfo.url ||
    changeInfo.title ||
    changeInfo.status === "complete" ||
    changeInfo.groupId !== undefined
  ) {
    renderTabs();
  }
});
chrome.tabs.onAttached.addListener(renderTabs);
chrome.tabs.onDetached.addListener(renderTabs);

// Listen for tab group events (Same as before)
chrome.tabGroups.onCreated.addListener(renderTabs);
chrome.tabGroups.onRemoved.addListener(renderTabs);
chrome.tabGroups.onUpdated.addListener(renderTabs);
chrome.tabGroups.onMoved.addListener(renderTabs);

// Listen for bookmark changes (Same as before)
chrome.bookmarks.onCreated.addListener(renderBookmarkTree);
chrome.bookmarks.onRemoved.addListener(renderBookmarkTree);
chrome.bookmarks.onChanged.addListener(renderBookmarkTree);
chrome.bookmarks.onMoved.addListener(renderBookmarkTree);

// Listener for the "Select All" checkbox (Same as before)
selectAllCheckbox.addEventListener("change", handleSelectAllChange);

// Listener for the "Bookmark Selected" button (Same as before)
bookmarkSelectedBtn.addEventListener("click", handleBookmarkSelectedClick);

// Listener for the "Bookmark & Delete" button (Same as before)
bookmarkDeleteBtn.addEventListener("click", handleBookmarkAndDeleteClick);

// Optional: Enter key listener (Same as before)
newFolderNameInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    handleBookmarkSelectedClick();
  }
});

console.log("Sidebar script loaded (with group-colored tab backgrounds).");
