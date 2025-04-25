// sidebar.js

const tabListElement = document.getElementById("tab-list");
const bookmarkSelectedBtn = document.getElementById("bookmark-selected-btn");
const newFolderNameInput = document.getElementById("new-folder-name");
const parentFolderSelect = document.getElementById("parent-folder-select");
const deselectAllBtn = document.getElementById("deselect-all-btn");
const statusMessageElement = document.getElementById("status-message");
const selectAllCheckbox = document.getElementById("select-all-checkbox"); // Get the new checkbox

// --- Tab Loading and Display ---

// Function to render the list of tabs
async function renderTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabListElement.innerHTML = ""; // Clear the current list

    if (tabs.length === 0) {
      tabListElement.innerHTML = "<p>No tabs found in this window.</p>";
      selectAllCheckbox.checked = false; // Ensure select all is unchecked if no tabs
      selectAllCheckbox.disabled = true; // Disable if no tabs
      return;
    }

    selectAllCheckbox.disabled = false; // Enable if there are tabs

    let allSelected = true; // Flag to track if all tabs are selected

    tabs.forEach((tab) => {
      const listItem = document.createElement("div");
      listItem.className = "tab-item";
      listItem.dataset.tabId = tab.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.tabId = tab.id;
      checkbox.dataset.tabUrl = tab.url;
      checkbox.dataset.tabTitle = tab.title;
      // Add listener to individual checkbox to update Select All state
      checkbox.addEventListener("change", updateSelectAllCheckboxState);
      listItem.appendChild(checkbox);

      // Keep track if any checkbox is unchecked
      if (!checkbox.checked) {
        allSelected = false;
      }

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

    // Set the initial state of the Select All checkbox based on loaded tabs
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

// Function to close a specific tab
async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    // List will refresh via listeners, which will call renderTabs and updateSelectAllCheckboxState
  } catch (error) {
    console.error(`Error closing tab ${tabId}:`, error);
    setStatusMessage(`Error closing tab: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// Function to get selected tabs
function getSelectedTabs() {
  const selectedCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]:checked'
  ); // Be more specific
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

// Function to handle the "Select All" checkbox click
function handleSelectAllChange() {
  const isChecked = selectAllCheckbox.checked;
  const individualCheckboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  individualCheckboxes.forEach((checkbox) => {
    checkbox.checked = isChecked;
  });
}

// Function to update the state of the "Select All" checkbox based on individual checkboxes
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
      // Set indeterminate state if some but not all are checked
      selectAllCheckbox.checked = false;
      selectAllCheckbox.indeterminate = true;
    }
  }
}

// Function to deselect all checkboxes (now also updates Select All checkbox)
function deselectAll() {
  const checkboxes = tabListElement.querySelectorAll(
    '.tab-item input[type="checkbox"]'
  );
  checkboxes.forEach((checkbox) => (checkbox.checked = false));
  updateSelectAllCheckboxState(); // Update the master checkbox state
}

// --- Bookmarking ---

// Function to recursively traverse the bookmark tree and populate the dropdown
function populateBookmarkFolders(nodes, parentElement, depth = 0) {
  nodes.forEach((node) => {
    if (!node.url) {
      const option = document.createElement("option");
      option.value = node.id;
      option.textContent = `${"--".repeat(depth)} ${
        node.title || "Unnamed Folder"
      }`;
      parentElement.appendChild(option);
      if (node.children && node.children.length > 0) {
        populateBookmarkFolders(node.children, parentElement, depth + 1);
      }
    }
  });
}

// Function to load bookmark folders into the select dropdown
async function loadBookmarkFolders() {
  try {
    const bookmarkTree = await chrome.bookmarks.getTree();
    parentFolderSelect.innerHTML = "";

    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      populateBookmarkFolders(bookmarkTree[0].children, parentFolderSelect, 0);
    } else {
      parentFolderSelect.innerHTML =
        '<option value="">No folders found</option>';
    }

    const defaultFolderId = "2"; // 'Other Bookmarks'
    if (
      parentFolderSelect.querySelector(`option[value="${defaultFolderId}"]`)
    ) {
      parentFolderSelect.value = defaultFolderId;
    } else if (parentFolderSelect.options.length > 0) {
      parentFolderSelect.value = parentFolderSelect.options[0].value;
    }
  } catch (error) {
    console.error("Error loading bookmark folders:", error);
    parentFolderSelect.innerHTML =
      '<option value="">Error loading folders</option>';
    setStatusMessage("Could not load bookmark folders.", true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// Function to bookmark selected tabs into a new folder
async function bookmarkSelected() {
  const selectedTabs = getSelectedTabs();
  const folderName = newFolderNameInput.value.trim();
  const parentFolderId = parentFolderSelect.value;

  if (selectedTabs.length === 0) {
    setStatusMessage("No tabs selected to bookmark.", true);
    return;
  }
  if (!folderName) {
    setStatusMessage("Please enter a name for the new bookmark folder.", true);
    newFolderNameInput.focus();
    return;
  }
  if (!parentFolderId) {
    setStatusMessage("Please select a parent folder.", true);
    return;
  }

  setStatusMessage("Bookmarking...");

  try {
    const newFolder = await chrome.bookmarks.create({
      parentId: parentFolderId,
      title: folderName,
    });
    console.log(
      `Created bookmark folder: ${newFolder.title} (ID: ${newFolder.id}) under parent ID: ${parentFolderId}`
    );

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
    deselectAll(); // Deselect after bookmarking
  } catch (error) {
    console.error("Error bookmarking tabs:", error);
    setStatusMessage(`Error creating bookmarks: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Utility Functions ---

// Function to display status messages
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
  loadBookmarkFolders();
});

// Listen for tab events
chrome.tabs.onCreated.addListener(renderTabs);
chrome.tabs.onRemoved.addListener(renderTabs);
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Reduced re-rendering frequency, but ensure state is updated
  if (changeInfo.url || changeInfo.title || changeInfo.status === "complete") {
    renderTabs(); // Re-render might be needed if title/URL changes affect bookmarking data
  } else if (changeInfo.status) {
    // Potentially just update favicon if only status changes without title/URL change
    // Or simply rely on renderTabs for simplicity for now.
  }
});
chrome.tabs.onAttached.addListener(renderTabs);
chrome.tabs.onDetached.addListener(renderTabs);

// Listen for bookmark changes
chrome.bookmarks.onCreated.addListener(loadBookmarkFolders);
chrome.bookmarks.onRemoved.addListener(loadBookmarkFolders);
chrome.bookmarks.onChanged.addListener(loadBookmarkFolders);
chrome.bookmarks.onMoved.addListener(loadBookmarkFolders);

// Listener for the "Select All" checkbox
selectAllCheckbox.addEventListener("change", handleSelectAllChange);

// Listener for the bookmark button
bookmarkSelectedBtn.addEventListener("click", bookmarkSelected);

// Listener for the deselect all button
deselectAllBtn.addEventListener("click", deselectAll);

// Optional: Enter key listener
newFolderNameInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    bookmarkSelected();
  }
});

console.log("Sidebar script loaded (with Select All).");
