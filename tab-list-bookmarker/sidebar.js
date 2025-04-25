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
const selectedCountSpan = document.getElementById("selected-count"); // NEW: Get the count span

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
      updateSelectAllCheckboxState(); // Update count to (0)
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
      // Ensure count updates when individual checkboxes change
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

    // Update Select All checkbox state and selected count after loading
    updateSelectAllCheckboxState();
  } catch (error) {
    console.error("Error loading tabs:", error);
    tabListElement.innerHTML =
      "<p>Error loading tabs. See console for details.</p>";
    selectAllCheckbox.checked = false;
    selectAllCheckbox.disabled = true;
    selectedCountSpan.textContent = "(0)"; // Reset count on error
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
    // The list will refresh automatically via the onRemoved listener,
    // which calls renderTabs -> updateSelectAllCheckboxState
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

// Function to handle the "Select All" checkbox click
function handleSelectAllChange() {
  const isChecked = selectAllCheckbox.checked;
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  individualCheckboxes.forEach((checkbox) => {
    checkbox.checked = isChecked;
  });
  // Update count and select all state after changing all checkboxes
  updateSelectAllCheckboxState();
}

// Function to update the state of the "Select All" checkbox AND the selected count
function updateSelectAllCheckboxState() {
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  const totalCheckboxes = individualCheckboxes.length;
  const checkedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  ).length;

  // Update the count display
  selectedCountSpan.textContent = `(${checkedCheckboxes})`; // Update the text content

  // Update the Select All checkbox state
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

// Function to deselect all checkboxes (used internally after bookmarking)
function deselectAllCheckboxes() {
  const checkboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  checkboxes.forEach((checkbox) => (checkbox.checked = false));
  updateSelectAllCheckboxState(); // Update count and select all state
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
    deselectAllCheckboxes(); // This now updates the count too
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

console.log("Sidebar script loaded (with selected count display).");
