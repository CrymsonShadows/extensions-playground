// bookmarks_ui.js
import { setStatusMessage } from "./utils.js";
import { getSelectedTabData, clearSelectedTabs } from "./tabs_ui.js";
import { stashOrUpdateItemDB } from "./db.js";
import { renderStashList } from "./stash_ui.js";
import { getOriginalTabInfo } from "./utils.js"; // Import getOriginalTabInfo

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

// --- Recursive function to get all bookmarks in a subtree ---
async function getBookmarksRecursively(folderId) {
  const allBookmarks = [];
  try {
    const subTreeNodes = await chrome.bookmarks.getSubTree(folderId);
    if (!subTreeNodes || subTreeNodes.length === 0) {
      return [];
    }

    function findBookmarks(nodes) {
      if (!nodes) return;
      nodes.forEach((node) => {
        if (node.url) {
          // Basic validation for javascript: URLs
          if (!node.url.startsWith("javascript:")) {
            allBookmarks.push(node);
          } else {
            console.warn(
              `Skipping javascript: bookmark: ${node.title || node.url}`
            );
          }
        }
        if (node.children) {
          findBookmarks(node.children);
        }
      });
    }
    if (subTreeNodes[0] && subTreeNodes[0].children) {
      findBookmarks(subTreeNodes[0].children);
    }
  } catch (error) {
    console.error(
      `Error getting bookmark subtree for folder ${folderId}:`,
      error
    );
    throw error;
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
    setStatusMessage(
      statusMessageElement,
      `Fetching bookmarks from "${folderName}" (including subfolders)...`
    );
    bookmarksToProcess = await getBookmarksRecursively(folderId);
    setStatusMessage(statusMessageElement, "");
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

  const stashPromises = bookmarksToProcess.map((bookmark) => {
    // *** MODIFICATION: Use getOriginalTabInfo to process URL and Title ***
    const originalInfo = getOriginalTabInfo(bookmark.url, bookmark.title);
    console.log(
      `Stashing bookmark: Original URL: ${bookmark.url}, Processed URL: ${originalInfo.url}`
    );

    // Skip if, after processing, the URL is invalid (e.g. still a chrome-extension URL that couldn't be resolved)
    // or if it's a type of URL we don't want to stash (like internal chrome pages).
    // The getOriginalTabInfo function itself might return the original chrome-extension:// URL
    // if it can't parse it or if it's not from a known suspender pattern.
    // We should add a check here to prevent stashing unresolved or unwanted chrome-extension URLs.
    if (
      !originalInfo.url ||
      originalInfo.url.startsWith("chrome://") ||
      (originalInfo.url.startsWith("chrome-extension://") &&
        !originalInfo.isSuspended) || // Allow if getOriginalTabInfo marked it as suspended (meaning it extracted a real URL)
      originalInfo.url.startsWith("about:") ||
      originalInfo.url.startsWith("file:")
    ) {
      console.warn(
        `Skipping bookmark with invalid or non-storable processed URL: ${originalInfo.url} (Original: ${bookmark.url})`
      );
      return Promise.resolve({
        status: "skipped",
        reason: "Invalid processed URL",
      });
    }

    const bookmarkDateAdded = bookmark.dateAdded
      ? new Date(bookmark.dateAdded).toISOString()
      : new Date().toISOString();

    const itemData = {
      title: originalInfo.title || originalInfo.url, // Use processed title/URL
      url: originalInfo.url, // Use processed URL
      tags: tagsArray,
      dateCreated: bookmarkDateAdded,
      // dateUpdated will be set by stashOrUpdateItemDB
    };
    return stashOrUpdateItemDB(itemData).then((result) => ({
      ...result,
      bookmarkId: bookmark.id, // Keep original bookmark ID for potential deletion
    }));
  });

  const results = await Promise.allSettled(stashPromises);

  results.forEach((result) => {
    if (result.status === "fulfilled") {
      if (result.value.action) {
        // 'action' implies success from stashOrUpdateItemDB
        successCount++;
        if (result.value.bookmarkId) {
          successfullyStashedBookmarkIds.push(result.value.bookmarkId);
        }
      } else if (result.value.status === "skipped") {
        console.log("A bookmark was skipped:", result.value.reason);
        // Not necessarily an error, but good to note. Could decrement total count if needed.
      }
    } else if (result.status === "rejected") {
      errorCount++;
      console.error("Error stashing one of the bookmarks:", result.reason);
    }
  });

  let finalMessage = `${operationText} complete. Stashed/Updated: ${successCount}.`;
  if (errorCount > 0) {
    finalMessage += ` Errors: ${errorCount}.`;
  }
  const skippedCount = bookmarksToProcess.length - (successCount + errorCount);
  if (skippedCount > 0) {
    finalMessage += ` Skipped: ${skippedCount}.`;
  }
  setStatusMessage(statusMessageElement, finalMessage, errorCount > 0);

  if (successCount > 0) {
    console.log("Calling renderStashList after stashing bookmarks.");
    await renderStashList();
  }

  if (shouldDeleteBookmarks && successfullyStashedBookmarkIds.length > 0) {
    setStatusMessage(
      statusMessageElement,
      `${finalMessage} Deleting original bookmarks...`,
      errorCount > 0
    );
    let deleteSuccessCount = 0;
    let deleteErrorCount = 0;

    for (const idToDelete of successfullyStashedBookmarkIds) {
      try {
        await chrome.bookmarks.remove(idToDelete);
        deleteSuccessCount++;
      } catch (err) {
        if (!err.message.toLowerCase().includes("no bookmark")) {
          console.error(`Error deleting bookmark ${idToDelete}:`, err);
          deleteErrorCount++;
        } else {
          console.log(`Bookmark ${idToDelete} likely already deleted.`);
        }
      }
    }

    let deleteMessage = `Deleted: ${deleteSuccessCount} original bookmark(s).`;
    if (deleteErrorCount > 0) {
      deleteMessage += ` Delete Errors: ${deleteErrorCount}.`;
    }
    setStatusMessage(
      statusMessageElement,
      `${finalMessage} ${deleteMessage}`, // Append delete status to previous message
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
