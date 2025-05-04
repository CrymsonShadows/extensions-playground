// bookmarks_ui.js
import { setStatusMessage } from "./utils.js";
import { getSelectedTabData, clearSelectedTabs } from "./tabs_ui.js";

// --- Element References ---
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

// --- State ---
let isBookmarking = false; // Flag to prevent concurrent operations

// --- Bookmark Tree Rendering ---
// buildBookmarkTreeLevel remains the same
function buildBookmarkTreeLevel(nodes, parentElement) {
  nodes.forEach((node) => {
    if (!node.url) {
      // Only process folders
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
        // Select/Expand/Collapse
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

// renderBookmarkTree remains the same
export async function renderBookmarkTree() {
  try {
    bookmarkTreeContainer.innerHTML = "<p>Loading folders...</p>"; // Show loading
    const bookmarkTree = await chrome.bookmarks.getTree();
    bookmarkTreeContainer.innerHTML = ""; // Clear loading/previous
    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      buildBookmarkTreeLevel(bookmarkTree[0].children, bookmarkTreeContainer);
    } else {
      bookmarkTreeContainer.innerHTML = "<p>No bookmark folders found.</p>";
    }
    // Reset selection display if needed
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
    setStatusMessage(
      statusMessageElement,
      "Could not load bookmark folders.",
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Bookmarking Actions ---

// createBookmarksInFolder remains the same
async function createBookmarksInFolder(tabs, targetFolderId) {
  const successfullyBookmarkedTabs = [];
  let createdCount = 0;
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith("chrome://")) {
      console.warn(`Skipping invalid URL: ${tab.url || "Empty URL"}`);
      continue;
    }
    try {
      // Check if bookmark already exists (optional, but good practice)
      // Note: chrome.bookmarks.search is async but might be slow for many checks
      // const existing = await chrome.bookmarks.search({url: tab.url});
      // if (existing.some(bm => bm.parentId === targetFolderId)) {
      //     console.log(`Bookmark for ${tab.url} already exists in folder ${targetFolderId}, skipping.`);
      //     continue;
      // }

      await chrome.bookmarks.create({
        parentId: targetFolderId,
        title: tab.title || tab.url,
        url: tab.url,
      });
      successfullyBookmarkedTabs.push(tab);
      createdCount++;
    } catch (error) {
      console.error(`Error bookmarking ${tab.id} (${tab.title}):`, error);
      if (chrome.runtime.lastError) {
        console.error(
          "Chrome runtime error:",
          chrome.runtime.lastError.message
        );
      }
      // Optional: Add specific error handling for "Bookmark URL already added" if needed
      // if (error.message.includes("already bookmarked")) { ... }
    }
  }
  console.log(
    `Attempted ${tabs.length}, successfully created ${createdCount} bookmarks.`
  );
  return successfullyBookmarkedTabs;
}

// *** Updated performBookmarkOperation ***
async function performBookmarkOperation(shouldDeleteTabs = false) {
  // ** Prevent concurrent execution **
  if (isBookmarking) {
    console.warn("Bookmarking operation already in progress. Ignoring click.");
    return;
  }

  const selectedTabs = getSelectedTabData();
  const newFolderName = newFolderNameInput.value.trim();
  const parentFolderId = selectedFolderIdInput.value;
  const parentFolderName = selectedFolderDisplay.textContent;

  if (selectedTabs.length === 0) {
    setStatusMessage(
      statusMessageElement,
      "No tabs selected to bookmark.",
      true
    );
    return;
  }
  if (!parentFolderId) {
    setStatusMessage(
      statusMessageElement,
      "Please select a parent folder.",
      true
    );
    return;
  }

  // ** Set flag and disable buttons **
  isBookmarking = true;
  bookmarkSelectedBtn.disabled = true;
  bookmarkDeleteBtn.disabled = true;
  setStatusMessage(statusMessageElement, "Bookmarking...");

  let targetFolderId;
  let successMessage;
  let bookmarkedTabs = [];
  let operationSucceeded = false;
  let createdNewFolder = false; // Flag to track if a new folder was made in this run

  try {
    if (newFolderName === "") {
      // Use existing selected folder
      targetFolderId = parentFolderId;
      bookmarkedTabs = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      );
      if (bookmarkedTabs.length > 0) {
        successMessage = `Bookmarked ${bookmarkedTabs.length} tab(s) to "${parentFolderName}".`;
        operationSucceeded = true;
      } else {
        setStatusMessage(
          statusMessageElement,
          "No valid tabs were bookmarked.",
          true
        );
      }
    } else {
      // Create a new folder first
      try {
        const newFolder = await chrome.bookmarks.create({
          parentId: parentFolderId,
          title: newFolderName,
        });
        targetFolderId = newFolder.id;
        createdNewFolder = true; // Mark that we created it
        console.log(
          `Created new folder "${newFolderName}" with ID: ${targetFolderId}`
        );

        // Now add bookmarks to the newly created folder
        bookmarkedTabs = await createBookmarksInFolder(
          selectedTabs,
          targetFolderId
        );

        if (bookmarkedTabs.length > 0) {
          successMessage = `Bookmarked ${bookmarkedTabs.length} tab(s) to new folder "${newFolderName}".`;
          operationSucceeded = true;
        } else {
          setStatusMessage(
            statusMessageElement,
            "Folder created, but no valid tabs were bookmarked.",
            true
          );
        }
      } catch (folderError) {
        // Handle potential errors creating the folder (e.g., duplicate name?)
        console.error("Error creating new bookmark folder:", folderError);
        setStatusMessage(
          statusMessageElement,
          `Error creating folder: ${folderError.message}`,
          true
        );
        // Don't proceed to bookmarking if folder creation failed
        operationSucceeded = false;
      }
    }

    // Post-bookmarking actions (clear selection, delete tabs, update UI)
    if (operationSucceeded) {
      setStatusMessage(statusMessageElement, successMessage);
      newFolderNameInput.value = ""; // Clear input regardless of new folder creation

      // Refresh tree if a new folder was successfully created
      if (createdNewFolder) {
        await renderBookmarkTree();
        // Try to re-select the parent folder after tree refresh
        const parentDetails = bookmarkTreeContainer.querySelector(
          `.bookmark-folder[data-folder-id="${parentFolderId}"] > .folder-details`
        );
        if (parentDetails) {
          parentDetails.click(); // Simulate click to select and potentially expand
        } else {
          // Reset selection if parent not found after refresh
          selectedFolderIdInput.value = "";
          selectedFolderDisplay.textContent = "Select a folder below...";
          selectedFolderDisplay.style.fontStyle = "italic";
        }
      }

      // Handle tab deletion if requested
      if (shouldDeleteTabs && bookmarkedTabs.length > 0) {
        setStatusMessage(
          statusMessageElement,
          `${successMessage} Deleting tabs...`
        );
        const tabIdsToDelete = bookmarkedTabs.map((tab) => tab.id);
        console.log("Attempting to delete tabs:", tabIdsToDelete);
        try {
          await chrome.tabs.remove(tabIdsToDelete);
          setStatusMessage(
            statusMessageElement,
            `Bookmarked and closed ${tabIdsToDelete.length} tab(s).`
          );
          clearSelectedTabs(); // Clear selection after successful delete
        } catch (deleteError) {
          console.error("Error during tab deletion:", deleteError);
          setStatusMessage(
            statusMessageElement,
            "Bookmarking succeeded, but error occurred during tab deletion.",
            true
          );
          // Still clear selection even if delete fails partially
          clearSelectedTabs();
        }
      } else {
        // Clear selection if not deleting tabs
        clearSelectedTabs();
      }
    }
  } catch (error) {
    // Catch any unexpected errors during the overall process
    console.error("Error during bookmark operation:", error);
    setStatusMessage(
      statusMessageElement,
      `Error during bookmarking: ${error.message}`,
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  } finally {
    // ** Always reset flag and re-enable buttons **
    isBookmarking = false;
    bookmarkSelectedBtn.disabled = false;
    bookmarkDeleteBtn.disabled = false;
    console.log("Bookmarking operation finished.");
  }
}

// --- Setup ---
export function setupBookmarksUI() {
  // Check if listeners are already attached (simple check)
  if (bookmarkSelectedBtn.dataset.listenerAttached === "true") {
    console.warn("Bookmark listeners already attached. Skipping setup.");
    return;
  }

  console.log("Attaching bookmark listeners.");
  bookmarkSelectedBtn.addEventListener("click", () =>
    performBookmarkOperation(false)
  );
  bookmarkDeleteBtn.addEventListener("click", () =>
    performBookmarkOperation(true)
  );
  newFolderNameInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      // Optionally decide if Enter should also allow delete? Currently only bookmarks.
      performBookmarkOperation(false);
    }
  });

  // Mark listeners as attached
  bookmarkSelectedBtn.dataset.listenerAttached = "true";

  renderBookmarkTree(); // Initial render
}
