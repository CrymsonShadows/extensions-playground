// bookmarks_ui.js
import { setStatusMessage } from "./utils.js";
import { getSelectedTabData, clearSelectedTabs } from "./tabs_ui.js";
import { stashOrUpdateItemDB } from "./db.js";
import { renderStashList } from "./stash_ui.js";

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
const bookmarkStashTagsInput = document.getElementById(
  "bookmark-stash-tags-input"
);
const stashFolderBtn = document.getElementById("stash-folder-btn");
const stashDeleteFolderBtn = document.getElementById("stash-delete-folder-btn");

// --- State ---
let isBookmarking = false;
let isStashingBookmarks = false;

// --- Bookmark Tree Rendering ---
// buildBookmarkTreeLevel, renderBookmarkTree remain the same
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
        buildBookmarkTreeLevel(node.children, childrenContainer); // Recurse
        folderDiv.appendChild(childrenContainer);
      }
      parentElement.appendChild(folderDiv);
    }
  });
}

export async function renderBookmarkTree() {
  try {
    bookmarkTreeContainer.innerHTML = "<p>Loading folders...</p>";
    const bookmarkTree = await chrome.bookmarks.getTree();
    bookmarkTreeContainer.innerHTML = "";
    if (bookmarkTree.length > 0 && bookmarkTree[0].children) {
      buildBookmarkTreeLevel(bookmarkTree[0].children, bookmarkTreeContainer);
    } else {
      bookmarkTreeContainer.innerHTML = "<p>No bookmark folders found.</p>";
    }
    // Reset selection if needed
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

// --- Bookmarking Actions (Selected Tabs) ---
// createBookmarksInFolder, performBookmarkOperation remain the same
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

  if (shouldDeleteTabs) {
    if (
      !window.confirm(
        `Are you sure you want to bookmark ${selectedTabs.length} selected tab(s) and then close them?`
      )
    ) {
      return;
    }
  }

  isBookmarking = true;
  bookmarkSelectedBtn.disabled = true;
  bookmarkDeleteBtn.disabled = true;
  setStatusMessage(statusMessageElement, "Bookmarking tabs...");

  let targetFolderId;
  let successMessage;
  let bookmarkedTabs = [];
  let operationSucceeded = false;
  let createdNewFolder = false;

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
      try {
        const newFolder = await chrome.bookmarks.create({
          parentId: parentFolderId,
          title: newFolderName,
        });
        targetFolderId = newFolder.id;
        createdNewFolder = true;
        console.log(
          `Created new folder "${newFolderName}" with ID: ${targetFolderId}`
        );
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
        console.error("Error creating new bookmark folder:", folderError);
        setStatusMessage(
          statusMessageElement,
          `Error creating folder: ${folderError.message}`,
          true
        );
        operationSucceeded = false;
      }
    }

    if (operationSucceeded) {
      setStatusMessage(statusMessageElement, successMessage);
      newFolderNameInput.value = "";
      if (createdNewFolder) {
        await renderBookmarkTree();
        const parentDetails = bookmarkTreeContainer.querySelector(
          `.bookmark-folder[data-folder-id="${parentFolderId}"] > .folder-details`
        );
        if (parentDetails) {
          parentDetails.click();
        } else {
          selectedFolderIdInput.value = "";
          selectedFolderDisplay.textContent = "Select a folder below...";
          selectedFolderDisplay.style.fontStyle = "italic";
        }
      }
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
          clearSelectedTabs();
        } catch (deleteError) {
          console.error("Error during tab deletion:", deleteError);
          setStatusMessage(
            statusMessageElement,
            "Bookmarking succeeded, but error occurred during tab deletion.",
            true
          );
          clearSelectedTabs();
        }
      } else {
        clearSelectedTabs();
      }
    }
  } catch (error) {
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
    isBookmarking = false;
    bookmarkSelectedBtn.disabled = false;
    bookmarkDeleteBtn.disabled = false;
    console.log("Bookmarking operation finished.");
  }
}

// --- NEW: Recursive function to get all bookmarks in a subtree ---
async function getBookmarksRecursively(folderId) {
  const allBookmarks = [];
  try {
    // Get the entire subtree starting from the folderId
    const subTreeNodes = await chrome.bookmarks.getSubTree(folderId);
    if (!subTreeNodes || subTreeNodes.length === 0) {
      return []; // No subtree found
    }

    // Recursive helper function to traverse the tree
    function findBookmarks(nodes) {
      if (!nodes) return;
      nodes.forEach((node) => {
        // If it's a bookmark (has a URL), add it to the list
        if (node.url) {
          // Basic validation
          if (!node.url.startsWith("javascript:")) {
            allBookmarks.push(node);
          } else {
            console.warn(
              `Skipping javascript: bookmark: ${node.title || node.url}`
            );
          }
        }
        // If it's a folder (has children), recurse
        if (node.children) {
          findBookmarks(node.children);
        }
      });
    }

    // Start traversal from the children of the root node of the subtree
    // (We don't want to process the folder itself, just its contents)
    if (subTreeNodes[0] && subTreeNodes[0].children) {
      findBookmarks(subTreeNodes[0].children);
    }
  } catch (error) {
    console.error(
      `Error getting bookmark subtree for folder ${folderId}:`,
      error
    );
    // Rethrow or handle as needed, maybe return empty array
    throw error; // Propagate error to the caller
  }
  return allBookmarks;
}

// --- Stash Bookmarks from Folder ---
async function handleStashBookmarksClick(shouldDeleteBookmarks = false) {
  if (isStashingBookmarks) {
    console.warn("Stash bookmarks operation already in progress.");
    return;
  }

  const folderId = selectedFolderIdInput.value;
  const folderName = selectedFolderDisplay.textContent;

  if (!folderId) {
    setStatusMessage(
      statusMessageElement,
      "Please select a folder from the tree first.",
      true
    );
    return;
  }

  const tagsString = bookmarkStashTagsInput.value.trim();
  const tagsArray = tagsString
    ? tagsString
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "")
    : [];

  let bookmarksToProcess = [];
  try {
    // *** Use the recursive function ***
    setStatusMessage(
      statusMessageElement,
      `Fetching bookmarks from "${folderName}" (including subfolders)...`
    );
    bookmarksToProcess = await getBookmarksRecursively(folderId);
    setStatusMessage(statusMessageElement, ""); // Clear fetching message
  } catch (error) {
    console.error("Error getting recursive bookmarks:", error);
    setStatusMessage(statusMessageElement, "Error fetching bookmarks.", true);
    return;
  }

  if (bookmarksToProcess.length === 0) {
    setStatusMessage(
      statusMessageElement,
      `No bookmarks found in folder "${folderName}" or its subfolders.`
    );
    return;
  }

  // *** Update confirmation message ***
  if (shouldDeleteBookmarks) {
    if (
      !window.confirm(
        `Are you sure you want to stash ${bookmarksToProcess.length} bookmark(s) from "${folderName}" (and its subfolders) and then DELETE the original bookmarks? This cannot be undone.`
      )
    ) {
      return;
    }
  }

  isStashingBookmarks = true;
  stashFolderBtn.disabled = true;
  stashDeleteFolderBtn.disabled = true;
  const operationText = shouldDeleteBookmarks
    ? "Stashing & Deleting"
    : "Stashing";
  setStatusMessage(
    statusMessageElement,
    `${operationText} ${bookmarksToProcess.length} bookmark(s)...`
  );

  let successCount = 0;
  let errorCount = 0;
  const successfullyStashedBookmarkIds = [];

  // Stash each bookmark found recursively
  const stashPromises = bookmarksToProcess.map((bookmark) => {
    // URL validation happened in getBookmarksRecursively
    const bookmarkDateAdded = bookmark.dateAdded
      ? new Date(bookmark.dateAdded).toISOString()
      : new Date().toISOString();
    const itemData = {
      title: bookmark.title || bookmark.url,
      url: bookmark.url,
      tags: tagsArray,
      dateCreated: bookmarkDateAdded,
    };
    return stashOrUpdateItemDB(itemData).then((result) => ({
      ...result,
      bookmarkId: bookmark.id,
    }));
  });

  const results = await Promise.allSettled(stashPromises);

  results.forEach((result) => {
    if (result.status === "fulfilled" && result.value.action) {
      successCount++;
      successfullyStashedBookmarkIds.push(result.value.bookmarkId);
    } else if (result.status === "rejected") {
      errorCount++;
      console.error("Error stashing one of the bookmarks:", result.reason);
    }
  });

  let finalMessage = `${operationText} complete. Stashed/Updated: ${successCount}.`;
  if (errorCount > 0) {
    finalMessage += ` Errors: ${errorCount}.`;
  }
  setStatusMessage(statusMessageElement, finalMessage, errorCount > 0);

  if (successCount > 0) {
    console.log("Calling renderStashList after stashing bookmarks.");
    await renderStashList();
  }

  // Delete original bookmarks if requested and successful
  if (shouldDeleteBookmarks && successfullyStashedBookmarkIds.length > 0) {
    setStatusMessage(
      statusMessageElement,
      `${finalMessage} Deleting original bookmarks...`,
      errorCount > 0
    );
    let deleteSuccessCount = 0;
    let deleteErrorCount = 0;

    // Important: Delete bookmarks one by one to avoid issues with nested deletion order
    for (const idToDelete of successfullyStashedBookmarkIds) {
      try {
        await chrome.bookmarks.remove(idToDelete);
        deleteSuccessCount++;
      } catch (err) {
        // Check if error is because it was already deleted (e.g., part of a deleted subfolder)
        if (!err.message.toLowerCase().includes("no bookmark")) {
          console.error(`Error deleting bookmark ${idToDelete}:`, err);
          deleteErrorCount++;
        } else {
          console.log(
            `Bookmark ${idToDelete} likely already deleted (part of subfolder?).`
          );
          // Consider still counting this as a "success" in the message?
          // For now, we just log it and don't increment deleteErrorCount.
        }
      }
    }

    finalMessage = `${operationText} ${successCount} item(s). Deleted: ${deleteSuccessCount}.`;
    if (deleteErrorCount > 0) {
      finalMessage += ` Delete Errors: ${deleteErrorCount}.`;
    }
    setStatusMessage(
      statusMessageElement,
      finalMessage,
      errorCount > 0 || deleteErrorCount > 0
    );

    await renderBookmarkTree(); // Refresh tree after deletion
  }

  bookmarkStashTagsInput.value = "";

  isStashingBookmarks = false;
  stashFolderBtn.disabled = false;
  stashDeleteFolderBtn.disabled = false;

  console.log("Stash bookmarks operation finished.");
  chrome.runtime.sendMessage({ action: "stashUpdated" }).catch((err) => {});
}

// --- Setup ---
export function setupBookmarksUI() {
  if (bookmarkSelectedBtn.dataset.listenerAttached === "true") {
    console.warn("Bookmark listeners already attached. Skipping setup.");
    return;
  }
  console.log("Attaching bookmark listeners.");

  // Bookmark Tabs listeners
  bookmarkSelectedBtn.addEventListener("click", () =>
    performBookmarkOperation(false)
  );
  bookmarkDeleteBtn.addEventListener("click", () => {
    performBookmarkOperation(true);
  });
  newFolderNameInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      performBookmarkOperation(false);
    }
  });

  // Stash Bookmarks listeners
  stashFolderBtn.addEventListener("click", () =>
    handleStashBookmarksClick(false)
  );
  stashDeleteFolderBtn.addEventListener("click", () => {
    handleStashBookmarksClick(true);
  });
  bookmarkStashTagsInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      handleStashBookmarksClick(false);
    }
  });

  bookmarkSelectedBtn.dataset.listenerAttached = "true";
  renderBookmarkTree();
}
