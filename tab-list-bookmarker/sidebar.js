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
const deselectAllBtn = document.getElementById("deselect-all-btn");
const statusMessageElement = document.getElementById("status-message");
const selectAllCheckbox = document.getElementById("select-all-checkbox");

// --- Tab Loading and Display ---

// Function to render the list of tabs (Same as before)
async function renderTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabListElement.innerHTML = ""; // Clear the current list

    if (tabs.length === 0) {
      tabListElement.innerHTML = "<p>No tabs found in this window.</p>";
      selectAllCheckbox.checked = false;
      selectAllCheckbox.disabled = true;
      return;
    }

    selectAllCheckbox.disabled = false;

    tabs.forEach((tab) => {
      const listItem = document.createElement("div");
      listItem.className = "tab-item";
      listItem.dataset.tabId = tab.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.tabId = tab.id;
      checkbox.dataset.tabUrl = tab.url;
      checkbox.dataset.tabTitle = tab.title;
      checkbox.addEventListener("change", updateSelectAllCheckboxState);
      listItem.appendChild(checkbox);

      const favicon = document.createElement("img");
      favicon.className = "tab-favicon";
      favicon.src = tab.favIconUrl || "icons/default_favicon.png";
      favicon.alt = "";
      favicon.onerror = () => {
        favicon.src = "icons/default_favicon.png";
      };
      listItem.appendChild(favicon);

      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = tab.title || tab.url;
      title.title = tab.title || tab.url;
      listItem.appendChild(title);

      const closeButton = document.createElement("button");
      closeButton.className = "close-tab-btn";
      closeButton.innerHTML = "&times;";
      closeButton.title = "Close Tab";
      closeButton.addEventListener("click", (event) => {
        event.stopPropagation();
        closeTab(tab.id);
      });
      listItem.appendChild(closeButton);

      tabListElement.appendChild(listItem);
    });

    updateSelectAllCheckboxState();
  } catch (error) {
    console.error("Error loading tabs:", error);
    tabListElement.innerHTML =
      "<p>Error loading tabs. See console for details.</p>";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.disabled = true;
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
    console.error(`Error closing tab ${tabId}:`, error);
    setStatusMessage(`Error closing tab: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
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
    selectedTabs.push({
      id: parseInt(checkbox.dataset.tabId, 10),
      url: checkbox.dataset.tabUrl,
      title: checkbox.dataset.tabTitle,
    });
  });
  return selectedTabs;
}

// Function to handle the "Select All" checkbox click (Same as before)
function handleSelectAllChange() {
  const isChecked = selectAllCheckbox.checked;
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  individualCheckboxes.forEach((checkbox) => {
    checkbox.checked = isChecked;
  });
}

// Function to update the state of the "Select All" checkbox (Same as before)
function updateSelectAllCheckboxState() {
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  const totalCheckboxes = individualCheckboxes.length;
  const checkedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  ).length;

  if (totalCheckboxes === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    selectAllCheckbox.disabled = true;
  } else {
    selectAllCheckbox.disabled = false;
    if (checkedCheckboxes === totalCheckboxes) {
      selectAllCheckbox.checked = true;
      selectAllCheckbox.indeterminate = false;
    } else if (checkedCheckboxes === 0) {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = false;
    } else {
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

// Function to deselect all checkboxes (Same as before)
function deselectAll() {
  const checkboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  checkboxes.forEach((checkbox) => (checkbox.checked = false));
  updateSelectAllCheckboxState();
}

// --- Bookmarking ---

// Function to build a single level of the bookmark tree recursively (Same as before)
function buildBookmarkTreeLevel(nodes, parentElement) {
  nodes.forEach((node) => {
    // Only process folders (nodes without a URL)
    if (!node.url) {
      const folderDiv = document.createElement("div");
      folderDiv.className = "bookmark-folder";
      folderDiv.dataset.folderId = node.id;

      const detailsDiv = document.createElement("div");
      detailsDiv.className = "folder-details";

      const nameSpan = document.createElement("span");
      nameSpan.className = "folder-name";
      nameSpan.textContent = node.title || "Unnamed Folder";
      nameSpan.title = node.title || "Unnamed Folder"; // Tooltip
      detailsDiv.appendChild(nameSpan);

      // Click listener for selection and expansion/collapse
      detailsDiv.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevent clicks bubbling up the tree

        // --- Selection Logic ---
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

        // --- Expansion/Collapse Logic ---
        if (folderDiv.classList.contains("has-children")) {
          folderDiv.classList.toggle("expanded");
        }
      });

      folderDiv.appendChild(detailsDiv);

      // Check if the folder has child folders
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
    bookmarkTreeContainer.innerHTML = ""; // Clear previous tree/loading message

    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      buildBookmarkTreeLevel(bookmarkTree[0].children, bookmarkTreeContainer);
    } else {
      bookmarkTreeContainer.innerHTML = "<p>No bookmark folders found.</p>";
    }

    // Reset selection display if tree is empty or rebuilt
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

// NEW: Helper function to create bookmarks for the selected tabs in a target folder
async function createBookmarksInFolder(tabs, targetFolderId) {
  let bookmarkPromises = tabs.map((tab) => {
    if (!tab.url || tab.url.startsWith("chrome://")) {
      console.warn(
        `Skipping invalid URL for bookmarking: ${tab.url || "Empty URL"}`
      );
      return Promise.resolve(null); // Resolve promise for skipped tabs
    }
    return chrome.bookmarks.create({
      parentId: targetFolderId,
      title: tab.title || tab.url, // Use URL if title is missing
      url: tab.url,
    });
  });

  // Wait for all bookmarks to be created
  const results = await Promise.all(bookmarkPromises);
  // Return the count of successfully created bookmarks
  return results.filter((r) => r !== null).length;
}

// Function to bookmark selected tabs (UPDATED LOGIC)
async function bookmarkSelected() {
  const selectedTabs = getSelectedTabs();
  const newFolderName = newFolderNameInput.value.trim(); // Get potential new folder name
  const parentFolderId = selectedFolderIdInput.value; // Get ID of the folder selected in the tree
  const parentFolderName = selectedFolderDisplay.textContent; // Get name of the selected folder for messages

  // --- Initial Checks ---
  if (selectedTabs.length === 0) {
    setStatusMessage("No tabs selected to bookmark.", true);
    return;
  }
  if (!parentFolderId) {
    setStatusMessage(
      "Please select a parent folder from the tree below.",
      true
    );
    bookmarkTreeContainer.focus(); // Attempt to focus the tree area
    return;
  }

  setStatusMessage("Bookmarking...");

  try {
    let targetFolderId;
    let successMessage;

    // --- Determine Target Folder ---
    if (newFolderName === "") {
      // Case 1: No new folder name given - bookmark directly into the selected parent folder
      targetFolderId = parentFolderId;
      console.log(
        `Bookmarking directly into selected folder: ${parentFolderName} (ID: ${targetFolderId})`
      );
      // Create bookmarks in the selected parent folder
      const successfulBookmarks = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      );
      successMessage = `Successfully bookmarked ${successfulBookmarks} tab(s) to folder "${parentFolderName}".`;
    } else {
      // Case 2: New folder name provided - create a new subfolder first
      console.log(
        `Creating new subfolder "${newFolderName}" inside parent folder: ${parentFolderName} (ID: ${parentFolderId})`
      );
      const newFolder = await chrome.bookmarks.create({
        parentId: parentFolderId,
        title: newFolderName,
      });
      targetFolderId = newFolder.id; // Target the newly created folder
      console.log(
        `Created bookmark folder: ${newFolder.title} (ID: ${targetFolderId})`
      );
      // Create bookmarks in the new subfolder
      const successfulBookmarks = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      );
      successMessage = `Successfully bookmarked ${successfulBookmarks} tab(s) to new folder "${newFolderName}".`;

      // Refresh the bookmark tree to show the newly created folder
      await renderBookmarkTree();
      // Try to re-select the parent folder visually after refresh
      const parentDetails = bookmarkTreeContainer.querySelector(
        `.bookmark-folder[data-folder-id="${parentFolderId}"] > .folder-details`
      );
      if (parentDetails) {
        parentDetails.classList.add("selected");
        // Ensure display matches the actual selected parent, not the new child
        selectedFolderDisplay.textContent =
          parentDetails.querySelector(".folder-name").textContent;
        selectedFolderDisplay.style.fontStyle = "normal";
      } else {
        // If parent somehow disappeared, reset selection
        selectedFolderIdInput.value = "";
        selectedFolderDisplay.textContent = "Select a folder below...";
        selectedFolderDisplay.style.fontStyle = "italic";
      }
    }

    // --- Final Steps ---
    setStatusMessage(successMessage);
    newFolderNameInput.value = ""; // Clear the input field regardless
    deselectAll(); // Deselect tabs after successful bookmarking
  } catch (error) {
    console.error("Error bookmarking tabs:", error);
    setStatusMessage(`Error creating bookmarks: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Utility Functions ---

// Function to display status messages (Same as before)
function setStatusMessage(message, isError = false) {
  statusMessageElement.textContent = message;
  statusMessageElement.style.color = isError ? "#d9534f" : "#31708f";
  setTimeout(() => {
    // Clear message only if it hasn't been overwritten by a newer message
    if (statusMessageElement.textContent === message) {
      statusMessageElement.textContent = "";
    }
  }, 5000); // Clear after 5 seconds
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
  if (changeInfo.url || changeInfo.title || changeInfo.status === "complete") {
    renderTabs();
  }
});
chrome.tabs.onAttached.addListener(renderTabs);
chrome.tabs.onDetached.addListener(renderTabs);

// Listen for bookmark changes (Same as before)
chrome.bookmarks.onCreated.addListener(renderBookmarkTree);
chrome.bookmarks.onRemoved.addListener(renderBookmarkTree);
chrome.bookmarks.onChanged.addListener(renderBookmarkTree);
chrome.bookmarks.onMoved.addListener(renderBookmarkTree);

// Listener for the "Select All" checkbox (Same as before)
selectAllCheckbox.addEventListener("change", handleSelectAllChange);

// Listener for the bookmark button (Same as before)
bookmarkSelectedBtn.addEventListener("click", bookmarkSelected);

// Listener for the deselect all button (Same as before)
deselectAllBtn.addEventListener("click", deselectAll);

// Optional: Enter key listener (Same as before)
newFolderNameInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    bookmarkSelected();
  }
});

console.log("Sidebar script loaded (with optional new folder logic).");
