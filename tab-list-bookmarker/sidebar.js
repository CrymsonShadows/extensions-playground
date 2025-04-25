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
// const deselectAllBtn = document.getElementById('deselect-all-btn'); // REMOVED
const bookmarkDeleteBtn = document.getElementById("bookmark-delete-btn"); // NEW
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
    // The list will refresh automatically via the onRemoved listener
  } catch (error) {
    // Check if the error is because the tab doesn't exist (already closed)
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
      console.log(`Tab ${tabId} already closed.`); // Ignore error if tab is already gone
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
    // Ensure we capture the ID correctly for later deletion
    const tabId = parseInt(checkbox.dataset.tabId, 10);
    if (!isNaN(tabId)) {
      // Make sure tabId is a valid number
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

// Function to deselect all checkboxes (used internally after bookmarking)
function deselectAllCheckboxes() {
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

// Helper function to create bookmarks (UPDATED to return list of successfully bookmarked tabs)
async function createBookmarksInFolder(tabs, targetFolderId) {
  const successfullyBookmarkedTabs = []; // Store tabs that were bookmarked
  let createdCount = 0;

  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith("chrome://")) {
      console.warn(
        `Skipping invalid URL for bookmarking: ${tab.url || "Empty URL"}`
      );
      continue; // Skip this tab
    }
    try {
      await chrome.bookmarks.create({
        parentId: targetFolderId,
        title: tab.title || tab.url,
        url: tab.url,
      });
      successfullyBookmarkedTabs.push(tab); // Add tab to the success list
      createdCount++;
    } catch (error) {
      console.error(
        `Error creating bookmark for tab ${tab.id} (${tab.title}):`,
        error
      );
      // Decide if you want to stop or continue on error. Continuing seems better.
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
  return successfullyBookmarkedTabs; // Return the array of tabs
}

// Main function to handle bookmarking (UPDATED to return success status and bookmarked tabs)
async function performBookmarkOperation(
  selectedTabs,
  newFolderName,
  parentFolderId,
  parentFolderName
) {
  let targetFolderId;
  let successMessage;
  let bookmarkedTabs = []; // Initialize as empty array

  try {
    // --- Determine Target Folder and Create Bookmarks ---
    if (newFolderName === "") {
      // Case 1: Bookmark directly into the selected parent folder
      targetFolderId = parentFolderId;
      console.log(
        `Bookmarking directly into selected folder: ${parentFolderName} (ID: ${targetFolderId})`
      );
      bookmarkedTabs = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      ); // Capture returned tabs
      if (bookmarkedTabs.length > 0) {
        successMessage = `Successfully bookmarked ${bookmarkedTabs.length} tab(s) to folder "${parentFolderName}".`;
      } else {
        // Handle case where no valid tabs were selected or bookmarking failed for all
        setStatusMessage("No valid tabs were bookmarked.", true);
        return { success: false, bookmarkedTabs: [] };
      }
    } else {
      // Case 2: Create a new subfolder first
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
      ); // Capture returned tabs

      if (bookmarkedTabs.length > 0) {
        successMessage = `Successfully bookmarked ${bookmarkedTabs.length} tab(s) to new folder "${newFolderName}".`;
        // Refresh the bookmark tree only if a new folder was successfully created and populated
        await renderBookmarkTree();
        // Try to re-select the parent folder visually
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
        // Handle case where no valid tabs were bookmarked into the new folder
        setStatusMessage("No valid tabs were bookmarked.", true);
        // Optionally, you might want to remove the newly created empty folder here
        // await chrome.bookmarks.remove(targetFolderId);
        return { success: false, bookmarkedTabs: [] };
      }
    }

    // --- Final Steps for Successful Bookmarking ---
    setStatusMessage(successMessage); // Show success message immediately
    newFolderNameInput.value = ""; // Clear the input field
    deselectAllCheckboxes(); // Deselect tabs

    return { success: true, bookmarkedTabs: bookmarkedTabs }; // Return success and the list
  } catch (error) {
    console.error("Error during bookmark operation:", error);
    setStatusMessage(`Error creating bookmarks: ${error.message}`, true);
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
    return { success: false, bookmarkedTabs: [] }; // Return failure
  }
}

// --- Button Action Functions ---

// Function for the "Bookmark Selected" button
async function handleBookmarkSelectedClick() {
  const selectedTabs = getSelectedTabs();
  const newFolderName = newFolderNameInput.value.trim();
  const parentFolderId = selectedFolderIdInput.value;
  const parentFolderName = selectedFolderDisplay.textContent;

  // Basic validation
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

  setStatusMessage("Bookmarking..."); // Initial status

  // Call the core bookmarking logic, but we don't need the return value here
  await performBookmarkOperation(
    selectedTabs,
    newFolderName,
    parentFolderId,
    parentFolderName
  );
  // Status message is handled within performBookmarkOperation
}

// Function for the "Bookmark & Delete" button
async function handleBookmarkAndDeleteClick() {
  const selectedTabs = getSelectedTabs();
  const newFolderName = newFolderNameInput.value.trim();
  const parentFolderId = selectedFolderIdInput.value;
  const parentFolderName = selectedFolderDisplay.textContent;

  // Basic validation
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

  setStatusMessage("Bookmarking..."); // Initial status

  // Perform the bookmark operation and get the result
  const bookmarkResult = await performBookmarkOperation(
    selectedTabs,
    newFolderName,
    parentFolderId,
    parentFolderName
  );

  // If bookmarking was successful and returned bookmarked tabs, proceed to delete
  if (bookmarkResult.success && bookmarkResult.bookmarkedTabs.length > 0) {
    setStatusMessage("Bookmark successful. Deleting tabs..."); // Update status

    // Extract IDs of successfully bookmarked tabs
    const tabIdsToDelete = bookmarkResult.bookmarkedTabs.map((tab) => tab.id);

    console.log("Attempting to delete tabs:", tabIdsToDelete);

    try {
      // Use the closeTab function which handles errors gracefully
      // Close tabs one by one to handle potential individual errors better
      let closedCount = 0;
      for (const tabId of tabIdsToDelete) {
        await closeTab(tabId); // closeTab already logs errors
        closedCount++;
      }
      // Final success message after deletion attempts
      setStatusMessage(`Bookmarked and closed ${closedCount} tab(s).`);
    } catch (error) {
      // Catch errors from the loop itself, although closeTab should handle most
      console.error("Error during tab deletion process:", error);
      setStatusMessage(
        "Bookmarking succeeded, but error occurred during tab deletion.",
        true
      );
    }
  } else if (!bookmarkResult.success) {
    // If bookmarking failed, the error message is already set by performBookmarkOperation
    console.log("Bookmarking failed. Tabs will not be deleted.");
  } else {
    // Bookmarking succeeded but no tabs were actually bookmarked (e.g., all invalid URLs)
    console.log(
      "Bookmarking reported success, but no tabs were bookmarked. No tabs to delete."
    );
    // Status message already set by performBookmarkOperation
  }
}

// --- Utility Functions ---

// Function to display status messages (Same as before)
function setStatusMessage(message, isError = false) {
  statusMessageElement.textContent = message;
  statusMessageElement.style.color = isError ? "#d9534f" : "#31708f";
  // Clear message only if it hasn't been overwritten by a newer message
  // Use a slightly longer timeout for combined actions
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
chrome.tabs.onRemoved.addListener(renderTabs); // This will refresh the list after deletion
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

// Listener for the "Bookmark Selected" button - Calls new handler
bookmarkSelectedBtn.addEventListener("click", handleBookmarkSelectedClick);

// Listener for the "Bookmark & Delete" button - Calls new handler
bookmarkDeleteBtn.addEventListener("click", handleBookmarkAndDeleteClick);

// Optional: Enter key listener in folder name input triggers "Bookmark Selected"
newFolderNameInput.addEventListener("keypress", (event) => {
  if (event.key === "Enter") {
    // Default action on Enter is just bookmarking, not deleting
    handleBookmarkSelectedClick();
  }
});

console.log("Sidebar script loaded (with Bookmark & Delete button).");
