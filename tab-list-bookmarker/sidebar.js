// sidebar.js

const tabListElement = document.getElementById("tab-list");
const bookmarkSelectedBtn = document.getElementById("bookmark-selected-btn");
const newFolderNameInput = document.getElementById("new-folder-name");
const parentFolderSelect = document.getElementById("parent-folder-select"); // Get the select element
const deselectAllBtn = document.getElementById("deselect-all-btn");
const statusMessageElement = document.getElementById("status-message");

// --- Tab Loading and Display ---

// Function to render the list of tabs (Same as before)
async function renderTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    tabListElement.innerHTML = ""; // Clear the current list

    if (tabs.length === 0) {
      tabListElement.innerHTML = "<p>No tabs found in this window.</p>";
      return;
    }

    tabs.forEach((tab) => {
      const listItem = document.createElement("div");
      listItem.className = "tab-item";
      listItem.dataset.tabId = tab.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.tabId = tab.id;
      checkbox.dataset.tabUrl = tab.url;
      checkbox.dataset.tabTitle = tab.title;
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
  } catch (error) {
    console.error("Error loading tabs:", error);
    tabListElement.innerHTML =
      "<p>Error loading tabs. See console for details.</p>";
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
    // List will refresh via listeners
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
    'input[type="checkbox"]:checked'
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

// Function to deselect all checkboxes (Same as before)
function deselectAll() {
  const checkboxes = tabListElement.querySelectorAll('input[type="checkbox"]');
  checkboxes.forEach((checkbox) => (checkbox.checked = false));
}

// --- Bookmarking ---

// Function to recursively traverse the bookmark tree and populate the dropdown
function populateBookmarkFolders(nodes, parentElement, depth = 0) {
  nodes.forEach((node) => {
    // Only add folders (nodes without a URL)
    if (!node.url) {
      const option = document.createElement("option");
      option.value = node.id; // Store the folder ID as the value
      // Indent based on depth for better readability
      option.textContent = `${"--".repeat(depth)} ${
        node.title || "Unnamed Folder"
      }`;
      parentElement.appendChild(option);

      // Recursively add children folders
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
    parentFolderSelect.innerHTML = ""; // Clear existing options (like "Loading...")

    // Add default options (e.g., Bookmarks Bar, Other Bookmarks)
    // Note: Root nodes (ID '0') are usually hidden. '1' is typically Bookmarks Bar, '2' is Other Bookmarks.
    // We can let the user select these top-level containers directly.
    // We will populate starting from the children of the root node (ID '0').
    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      populateBookmarkFolders(bookmarkTree[0].children, parentFolderSelect, 0);
    } else {
      parentFolderSelect.innerHTML =
        '<option value="">No folders found</option>';
    }

    // Set a default selection if possible (e.g., 'Other Bookmarks' - ID '2')
    const defaultFolderId = "2";
    if (
      parentFolderSelect.querySelector(`option[value="${defaultFolderId}"]`)
    ) {
      parentFolderSelect.value = defaultFolderId;
    } else if (parentFolderSelect.options.length > 0) {
      // Otherwise select the first available folder
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

// Function to bookmark selected tabs into a new folder (UPDATED)
async function bookmarkSelected() {
  const selectedTabs = getSelectedTabs();
  const folderName = newFolderNameInput.value.trim();
  const parentFolderId = parentFolderSelect.value; // Get selected parent folder ID

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
    // This case might happen if loading folders failed.
    return;
  }

  setStatusMessage("Bookmarking...");

  try {
    // 1. Create the new bookmark folder under the selected parent
    const newFolder = await chrome.bookmarks.create({
      parentId: parentFolderId, // Use the selected parent ID
      title: folderName,
    });
    console.log(
      `Created bookmark folder: ${newFolder.title} (ID: ${newFolder.id}) under parent ID: ${parentFolderId}`
    );

    // 2. Create bookmarks inside the new folder (Same logic as before)
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
    deselectAll();
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

// Initial load of tabs AND bookmark folders when the sidebar opens
document.addEventListener("DOMContentLoaded", () => {
  renderTabs();
  loadBookmarkFolders(); // Load folders when the sidebar DOM is ready
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

// Listen for bookmark changes to potentially update the folder list
// Note: This can be complex. A simple refresh might be sufficient,
// or you could implement more granular updates if needed.
chrome.bookmarks.onCreated.addListener(loadBookmarkFolders);
chrome.bookmarks.onRemoved.addListener(loadBookmarkFolders);
chrome.bookmarks.onChanged.addListener(loadBookmarkFolders); // Title changes etc.
chrome.bookmarks.onMoved.addListener(loadBookmarkFolders); // Folder moved

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

console.log("Sidebar script loaded (with bookmark folder support).");
