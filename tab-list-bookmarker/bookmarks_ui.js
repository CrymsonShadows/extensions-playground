// bookmarks_ui.js
import { setStatusMessage } from "./utils.js";
// Import getSelectedTabData only if needed by bookmarking logic
// Import clearSelectedTabs if needed after bookmarking
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
// Close Selected Button Reference REMOVED
// const closeSelectedTabsBtn = document.getElementById("close-selected-tabs-btn");

// --- Bookmark Tree Rendering ---
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
async function createBookmarksInFolder(tabs, targetFolderId) {
  const successfullyBookmarkedTabs = [];
  let createdCount = 0;
  for (const tab of tabs) {
    if (!tab.url || tab.url.startsWith("chrome://")) {
      console.warn(`Skipping invalid URL: ${tab.url || "Empty URL"}`);
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
      console.error(`Error bookmarking ${tab.id} (${tab.title}):`, error);
      if (chrome.runtime.lastError) {
        console.error(
          "Chrome runtime error:",
          chrome.runtime.lastError.message
        );
      }
    }
  }
  console.log(
    `Attempted ${tabs.length}, successfully created ${createdCount} bookmarks.`
  );
  return successfullyBookmarkedTabs;
}

async function performBookmarkOperation(shouldDeleteTabs = false) {
  /* ... same as before, ensure it uses clearSelectedTabs correctly ... */
  const selectedTabs = getSelectedTabData(); // Use getSelectedTabData to get objects with id, url, title
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

  setStatusMessage(statusMessageElement, "Bookmarking...");

  let targetFolderId;
  let successMessage;
  let bookmarkedTabs = [];
  let operationSucceeded = false;

  try {
    if (newFolderName === "") {
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
      const newFolder = await chrome.bookmarks.create({
        parentId: parentFolderId,
        title: newFolderName,
      });
      targetFolderId = newFolder.id;
      bookmarkedTabs = await createBookmarksInFolder(
        selectedTabs,
        targetFolderId
      );
      if (bookmarkedTabs.length > 0) {
        successMessage = `Bookmarked ${bookmarkedTabs.length} tab(s) to new folder "${newFolderName}".`;
        operationSucceeded = true;
        await renderBookmarkTree();
        const parentDetails = bookmarkTreeContainer.querySelector(
          `.bookmark-folder[data-folder-id="${parentFolderId}"] > .folder-details`
        );
        if (parentDetails) {
          parentDetails.classList.add("selected");
          selectedFolderDisplay.textContent =
            parentDetails.querySelector(".folder-name").textContent;
          selectedFolderDisplay.style.fontStyle = "normal";
        }
      } else {
        setStatusMessage(
          statusMessageElement,
          "No valid tabs were bookmarked.",
          true
        );
      }
    }

    if (operationSucceeded) {
      setStatusMessage(statusMessageElement, successMessage);
      newFolderNameInput.value = "";

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
        }
      } else {
        clearSelectedTabs(); // Clear selection if not deleting
      }
    }
  } catch (error) {
    console.error("Error during bookmark operation:", error);
    setStatusMessage(
      statusMessageElement,
      `Error creating bookmarks: ${error.message}`,
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// Close Selected Tabs Action REMOVED from here
// async function handleCloseSelectedTabsClick() { ... }

// --- Setup ---
export function setupBookmarksUI() {
  bookmarkSelectedBtn.addEventListener("click", () =>
    performBookmarkOperation(false)
  );
  bookmarkDeleteBtn.addEventListener("click", () =>
    performBookmarkOperation(true)
  );
  // Close Selected Button Listener REMOVED
  // closeSelectedTabsBtn.addEventListener('click', handleCloseSelectedTabsClick);
  newFolderNameInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      performBookmarkOperation(false);
    }
  });
  renderBookmarkTree(); // Initial render
}
