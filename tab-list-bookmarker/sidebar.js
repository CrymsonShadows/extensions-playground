// sidebar.js

const tabListElement = document.getElementById("tab-list");
const bookmarkSelectedBtn = document.getElementById("bookmark-selected-btn");
const newFolderNameInput = document.getElementById("new-folder-name");
// const parentFolderSelect = document.getElementById('parent-folder-select'); // REMOVED
const bookmarkTreeContainer = document.getElementById(
  "bookmark-tree-container"
); // NEW
const selectedFolderDisplay = document.getElementById(
  "selected-folder-display"
); // NEW
const selectedFolderIdInput = document.getElementById("selected-folder-id"); // NEW
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

// NEW: Function to build a single level of the bookmark tree recursively
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
        // Remove 'selected' class from previously selected item
        const currentlySelected = bookmarkTreeContainer.querySelector(
          ".folder-details.selected"
        );
        if (currentlySelected) {
          currentlySelected.classList.remove("selected");
        }
        // Add 'selected' class to the clicked item
        detailsDiv.classList.add("selected");
        // Update hidden input and display text
        selectedFolderIdInput.value = node.id;
        selectedFolderDisplay.textContent = nameSpan.textContent;
        selectedFolderDisplay.style.fontStyle = "normal"; // Remove italic style

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
        // Recursively build the next level
        buildBookmarkTreeLevel(node.children, childrenContainer);
        folderDiv.appendChild(childrenContainer);
      }

      parentElement.appendChild(folderDiv);
    }
  });
}

// NEW: Function to render the entire bookmark tree
async function renderBookmarkTree() {
  try {
    const bookmarkTree = await chrome.bookmarks.getTree();
    bookmarkTreeContainer.innerHTML = ""; // Clear previous tree/loading message

    // The root node (ID '0') usually contains top-level folders like
    // "Bookmarks Bar" (ID '1'), "Other Bookmarks" (ID '2'), "Mobile Bookmarks"
    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      // Start building from the children of the root node
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

// Function to bookmark selected tabs into a new folder (UPDATED)
async function bookmarkSelected() {
  const selectedTabs = getSelectedTabs();
  const folderName = newFolderNameInput.value.trim();
  const parentFolderId = selectedFolderIdInput.value; // Get ID from hidden input

  if (selectedTabs.length === 0) {
    setStatusMessage("No tabs selected to bookmark.", true);
    return;
  }
  if (!folderName) {
    setStatusMessage("Please enter a name for the new bookmark folder.", true);
    newFolderNameInput.focus();
    return;
  }
  // Check if a parent folder has been selected from the tree
  if (!parentFolderId) {
    setStatusMessage(
      "Please select a parent folder from the tree below.",
      true
    );
    // Optionally focus the tree container or shake it visually
    bookmarkTreeContainer.focus(); // May not work directly, visual cue better
    return;
  }

  setStatusMessage("Bookmarking...");

  try {
    // Create the new folder under the selected parent
    const newFolder = await chrome.bookmarks.create({
      parentId: parentFolderId,
      title: folderName,
    });
    console.log(
      `Created bookmark folder: ${newFolder.title} (ID: ${newFolder.id}) under parent ID: ${parentFolderId}`
    );

    // Create bookmarks inside the new folder
    let bookmarkPromises = selectedTabs.map((tab) => {
      if (!tab.url || tab.url.startsWith("chrome://")) {
        console.warn(
          `Skipping invalid URL for bookmarking: ${tab.url || "Empty URL"}`
        );
        return Promise.resolve(null);
      }
      return chrome.bookmarks.create({
        parentId: newFolder.id,
        title: tab.title || tab.url,
        url: tab.url,
      });
    });

    const results = await Promise.all(bookmarkPromises);
    const successfulBookmarks = results.filter((r) => r !== null).length;

    setStatusMessage(
      `Successfully bookmarked ${successfulBookmarks} tab(s) to folder "${folderName}".`
    );
    newFolderNameInput.value = "";
    deselectAll(); // Deselect tabs after bookmarking

    // Optional: Refresh the bookmark tree to show the newly created folder
    // Be careful as this might collapse the tree. A more sophisticated update
    // could insert the new node without full refresh, but refresh is simpler.
    await renderBookmarkTree();
    // Re-select the parent folder visually after refresh if possible
    const parentDetails = bookmarkTreeContainer.querySelector(
      `.bookmark-folder[data-folder-id="${parentFolderId}"] > .folder-details`
    );
    if (parentDetails) {
      parentDetails.classList.add("selected");
      selectedFolderDisplay.textContent =
        parentDetails.querySelector(".folder-name").textContent;
      selectedFolderDisplay.style.fontStyle = "normal";
    } else {
      // If parent somehow disappeared (unlikely), reset selection
      selectedFolderIdInput.value = "";
      selectedFolderDisplay.textContent = "Select a folder below...";
      selectedFolderDisplay.style.fontStyle = "italic";
    }
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
    if (statusMessageElement.textContent === message) {
      statusMessageElement.textContent = "";
    }
  }, 5000);
}

// --- Event Listeners ---

// Initial load
document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  renderBookmarkTree(); // Render the bookmark tree instead of loading folders to select
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

// Listen for bookmark changes - Now re-renders the tree
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

console.log("Sidebar script loaded (with interactive bookmark tree).");
