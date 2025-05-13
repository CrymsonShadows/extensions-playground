// grouping_ui.js
import {
  groupColorMap,
  availableGroupColors,
  groupBackgroundColorMap,
} from "./constants.js";
import {
  setStatusMessage as setGroupStatusMessage,
  getOriginalTabInfo,
  getSldTld,
} from "./utils.js"; // Alias for clarity
import { getSelectedTabData, clearSelectedTabs } from "./tabs_ui.js"; // Import functions to get selected tabs and clear selection

// --- Element References ---
const targetGroupSelect = document.getElementById("target-group-select");
const newGroupOptionsDiv = document.getElementById("new-group-options");
const newGroupNameInput = document.getElementById("new-group-name");
const newGroupColorSelect = document.getElementById("new-group-color");
const moveToGroupBtn = document.getElementById("move-to-group-btn");
const groupByDomainBtn = document.getElementById("group-by-domain-btn"); // Button for grouping ungrouped
const regroupAllByDomainBtn = document.getElementById(
  "regroup-all-by-domain-btn" // Button for regrouping all
);
const groupStatusMessageElement = document.getElementById(
  "group-status-message"
);

// --- Grouping Actions ---

/**
 * Loads existing tab groups into the dropdown select.
 */
export async function loadExistingGroups() {
  try {
    targetGroupSelect.innerHTML = '<option value="">Loading groups...</option>'; // Show loading
    const groups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    targetGroupSelect.innerHTML = ""; // Clear loading/previous

    // Option to create a new group
    const newGroupOption = document.createElement("option");
    newGroupOption.value = "new";
    newGroupOption.textContent = "Create New Group...";
    targetGroupSelect.appendChild(newGroupOption);

    // Add existing groups
    groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      // Add a color indicator span
      const colorIndicator = `<span class="group-color-indicator" style="background-color: ${
        groupColorMap[group.color] || "#DADCE0" // Default color if unknown
      }; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle;"></span>`;
      option.innerHTML = colorIndicator + (group.title || `Group ${group.id}`); // Use title or ID
      targetGroupSelect.appendChild(option);
    });

    handleTargetGroupChange(); // Update visibility based on loaded options
  } catch (error) {
    console.error("Error loading tab groups:", error);
    targetGroupSelect.innerHTML =
      '<option value="">Error loading groups</option>';
    setGroupStatusMessage(
      groupStatusMessageElement,
      "Could not load groups.",
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

/**
 * Populates the color selection dropdown for creating new groups.
 */
function populateNewGroupColors() {
  newGroupColorSelect.innerHTML = "";
  availableGroupColors.forEach((colorName) => {
    const option = document.createElement("option");
    option.value = colorName;
    option.textContent = colorName.charAt(0).toUpperCase() + colorName.slice(1); // Capitalize
    option.style.backgroundColor =
      groupBackgroundColorMap[colorName] || "#F1F3F4"; // Set background for visual cue
    newGroupColorSelect.appendChild(option);
  });
  newGroupColorSelect.value = "grey"; // Default selection
}

/**
 * Shows/hides the new group name/color inputs based on dropdown selection.
 */
function handleTargetGroupChange() {
  if (targetGroupSelect.value === "new") {
    newGroupOptionsDiv.classList.remove("hidden");
  } else {
    newGroupOptionsDiv.classList.add("hidden");
  }
}

/**
 * Handles moving selected tabs to the chosen existing group or a new group.
 */
async function handleMoveToGroupClick() {
  const selectedTabs = getSelectedTabData(); // Use imported function
  const targetGroupIdOrNew = targetGroupSelect.value;

  // --- Input Validation ---
  if (selectedTabs.length === 0) {
    setGroupStatusMessage(
      groupStatusMessageElement,
      "No tabs selected to move.",
      true
    );
    return;
  }
  if (!targetGroupIdOrNew) {
    setGroupStatusMessage(
      groupStatusMessageElement,
      "Please select a target group or 'Create New'.",
      true
    );
    return;
  }

  const tabIdsToMove = selectedTabs.map((tab) => tab.id);
  setGroupStatusMessage(groupStatusMessageElement, "Moving tabs...");

  try {
    if (targetGroupIdOrNew === "new") {
      // --- Create New Group ---
      console.log("Creating new group for tabs:", tabIdsToMove);
      // Create the group with the selected tabs
      const newGroupId = await chrome.tabs.group({ tabIds: tabIdsToMove });
      console.log("New group created with ID:", newGroupId);

      // Prepare properties to update (name, color)
      const updateProperties = {};
      const newName = newGroupNameInput.value.trim();
      const newColor = newGroupColorSelect.value;
      if (newName) {
        updateProperties.title = newName;
      }
      updateProperties.color = newColor; // Always set color (defaults to grey)

      // Update the newly created group if properties are set
      if (Object.keys(updateProperties).length > 0) {
        console.log("Updating new group with properties:", updateProperties);
        await chrome.tabGroups.update(newGroupId, updateProperties);
      }

      setGroupStatusMessage(
        groupStatusMessageElement,
        `Moved ${tabIdsToMove.length} tab(s) to new group ${
          newName || `(ID: ${newGroupId})`
        }.`
      );
      newGroupNameInput.value = ""; // Clear input after use
    } else {
      // --- Move to Existing Group ---
      const targetGroupId = parseInt(targetGroupIdOrNew, 10);
      if (isNaN(targetGroupId)) {
        setGroupStatusMessage(
          groupStatusMessageElement,
          "Invalid target group selected.",
          true
        );
        return;
      }
      console.log(
        `Moving tabs ${tabIdsToMove} to existing group ${targetGroupId}`
      );
      // Move tabs to the existing group
      await chrome.tabs.group({ tabIds: tabIdsToMove, groupId: targetGroupId });

      // Try to get the group info for the status message
      try {
        const groupInfo = await chrome.tabGroups.get(targetGroupId);
        setGroupStatusMessage(
          groupStatusMessageElement,
          `Moved ${tabIdsToMove.length} tab(s) to group "${
            groupInfo.title || `Group ${targetGroupId}`
          }".`
        );
      } catch (groupError) {
        // Fallback message if getting group info fails
        console.warn("Could not get group info after moving:", groupError);
        setGroupStatusMessage(
          groupStatusMessageElement,
          `Moved ${tabIdsToMove.length} tab(s) to group ${targetGroupId}.`
        );
      }
    }

    // --- Cleanup and Refresh ---
    clearSelectedTabs(); // Use imported function to clear selection in the tab list UI
    await loadExistingGroups(); // Reload the group dropdown
    // The main tab list should re-render automatically via listeners in sidebar.js
  } catch (error) {
    console.error("Error moving tabs to group:", error);
    setGroupStatusMessage(
      groupStatusMessageElement,
      `Error moving tabs: ${error.message}`,
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
    // Refresh dropdown even on error? Yes, state might be inconsistent.
    await loadExistingGroups();
  }
}

/**
 * Groups currently UNGROUPED tabs by their domain (SLD+TLD).
 */
async function handleGroupByDomainClick() {
  setGroupStatusMessage(
    groupStatusMessageElement,
    "Grouping ungrouped tabs by domain..."
  );
  try {
    // Get all tabs in the current window
    const tabs = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });

    const domains = new Map(); // Map to store domain -> [tabId1, tabId2, ...]

    // Iterate through tabs to find ungrouped ones and map by domain
    for (const tab of tabs) {
      // Skip tabs that are already in a group
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        continue;
      }

      // Get original URL (handles suspended tabs) and skip invalid URLs
      const originalInfo = getOriginalTabInfo(tab.url, tab.title);
      if (!originalInfo.url || !originalInfo.url.startsWith("http")) {
        console.log(`Skipping non-http tab: ${tab.id} (${originalInfo.url})`);
        continue;
      }

      // Extract domain (SLD+TLD)
      try {
        const hostname = new URL(originalInfo.url).hostname;
        const domain = getSldTld(hostname); // Use utility function
        if (domain) {
          // Add tab ID to the map for this domain
          if (!domains.has(domain)) {
            domains.set(domain, []);
          }
          domains.get(domain).push(tab.id);
          console.log(
            `Tab ${tab.id} (${originalInfo.url}) mapped to domain: ${domain}`
          );
        } else {
          console.log(
            `Could not extract valid domain from: ${hostname} (URL: ${originalInfo.url})`
          );
        }
      } catch (e) {
        console.warn(
          `Could not parse URL/get domain for tab ${tab.id}: ${originalInfo.url}`,
          e
        );
      }
    }

    let groupsCreated = 0;
    // Iterate through the collected domains
    for (const [domainName, tabIds] of domains.entries()) {
      // Only create a group if there's more than one tab for the domain
      if (tabIds.length > 1) {
        console.log(
          `Creating group for domain: ${domainName}, Tabs: ${tabIds}`
        );
        try {
          // Create the group
          const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
          // Update the group with the domain name as the title
          await chrome.tabGroups.update(newGroupId, { title: domainName });
          groupsCreated++;
          console.log(`Group ${newGroupId} created and titled "${domainName}"`);
        } catch (groupError) {
          console.error(
            `Error creating/updating group for ${domainName}:`,
            groupError
          );
          setGroupStatusMessage(
            groupStatusMessageElement,
            `Error grouping ${domainName}: ${groupError.message}`,
            true
          );
          // Continue to next domain even if one fails
        }
      } else {
        console.log(
          `Skipping domain ${domainName}, only has ${tabIds.length} tab(s).`
        );
      }
    }

    // Report final status
    if (groupsCreated > 0) {
      setGroupStatusMessage(
        groupStatusMessageElement,
        `Created ${groupsCreated} new group(s) for ungrouped tabs.`
      );
      await loadExistingGroups(); // Reload dropdown to show new groups
    } else {
      setGroupStatusMessage(
        groupStatusMessageElement,
        "No new groups needed for ungrouped tabs."
      );
    }
    // Main tab list will refresh via listeners in sidebar.js
  } catch (error) {
    console.error("Error grouping ungrouped tabs by domain:", error);
    setGroupStatusMessage(
      groupStatusMessageElement,
      `Error grouping by domain: ${error.message}`,
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

/**
 * Regroups ALL tabs (regardless of current group status) by their domain.
 */
async function handleRegroupAllByDomainClick() {
  setGroupStatusMessage(
    groupStatusMessageElement,
    "Regrouping ALL tabs by domain..."
  );
  try {
    // Get all tabs in the current window
    const tabs = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });

    const domains = new Map(); // Map domain -> [tabId1, tabId2, ...]

    // Iterate through ALL tabs and map them by domain
    for (const tab of tabs) {
      // Get original URL and skip invalid ones
      const originalInfo = getOriginalTabInfo(tab.url, tab.title);
      if (!originalInfo.url || !originalInfo.url.startsWith("http")) {
        console.log(
          `RegroupAll: Skipping non-http tab: ${tab.id} (${originalInfo.url})`
        );
        continue; // Skip non-http tabs
      }

      // Extract domain
      try {
        const hostname = new URL(originalInfo.url).hostname;
        const domain = getSldTld(hostname);
        if (domain) {
          // Add tab ID to the map
          if (!domains.has(domain)) {
            domains.set(domain, []);
          }
          domains.get(domain).push(tab.id);
          console.log(
            `RegroupAll: Tab ${tab.id} (${originalInfo.url}) mapped to domain: ${domain}`
          );
        } else {
          console.log(
            `RegroupAll: Could not extract valid domain from: ${hostname} (URL: ${originalInfo.url})`
          );
        }
      } catch (e) {
        console.warn(
          `RegroupAll: Could not parse URL/get domain for tab ${tab.id}: ${originalInfo.url}`,
          e
        );
      }
    }

    // Rely on chrome.tabs.group to move tabs out of old groups.
    console.log("RegroupAll: Proceeding to group tabs by collected domains.");

    let groupsCreatedOrModified = 0;
    // Get existing groups to potentially reuse them
    let existingGroups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    let existingGroupMap = new Map(existingGroups.map((g) => [g.title, g.id])); // Map title -> id

    // Iterate through the collected domains
    for (const [domainName, tabIds] of domains.entries()) {
      // Only group if there's more than one tab for the domain
      if (tabIds.length > 1) {
        console.log(
          `RegroupAll: Processing domain: ${domainName}, Tabs: ${tabIds}`
        );
        try {
          // Check if a group with this domain name already exists
          let targetGroupId = existingGroupMap.get(domainName);

          if (targetGroupId) {
            // Move tabs into the existing group
            console.log(
              `RegroupAll: Moving tabs to existing group ${targetGroupId} ("${domainName}")`
            );
            // Ensure the tabs are actually moved; chrome.tabs.group might optimize if they are already there.
            // A safe way is to group them explicitly.
            await chrome.tabs.group({ tabIds: tabIds, groupId: targetGroupId });
          } else {
            // Create a new group
            console.log(`RegroupAll: Creating new group for "${domainName}"`);
            const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
            // Update the new group with the domain name title
            await chrome.tabGroups.update(newGroupId, { title: domainName });
            console.log(
              `RegroupAll: New group ${newGroupId} created and titled "${domainName}"`
            );
            // Add the newly created group to our map for potential reuse in this loop (though unlikely needed)
            existingGroupMap.set(domainName, newGroupId);
          }
          groupsCreatedOrModified++;
        } catch (groupError) {
          // Handle potential errors, e.g., if a tab was closed during the process
          console.error(
            `RegroupAll: Error grouping/updating group for ${domainName}:`,
            groupError
          );
          // Attempt to continue with other domains
          setGroupStatusMessage(
            groupStatusMessageElement,
            `Error grouping ${domainName}: ${groupError.message}`,
            true
          );
        }
      } else {
        console.log(
          `RegroupAll: Skipping domain ${domainName}, only has ${tabIds.length} tab(s).`
        );
      }
    }

    // Report final status
    setGroupStatusMessage(
      groupStatusMessageElement,
      `Regrouping complete. ${groupsCreatedOrModified} domain group(s) created or updated.`
    );
    await loadExistingGroups(); // Reload dropdown
    // Main tab list will refresh via listeners in sidebar.js
  } catch (error) {
    console.error("Error regrouping all tabs by domain:", error);
    setGroupStatusMessage(
      groupStatusMessageElement,
      `Error regrouping all: ${error.message}`,
      true
    );
    if (chrome.runtime.lastError) {
      console.error("Chrome runtime error:", chrome.runtime.lastError.message);
    }
  }
}

// --- Setup ---
/**
 * Sets up event listeners for the grouping UI elements.
 */
export function setupGroupingUI() {
  // Check if listeners are already attached (simple check on one button)
  if (moveToGroupBtn.dataset.listenerAttached === "true") {
    console.warn("Grouping listeners already attached. Skipping setup.");
    return;
  }
  console.log("Attaching grouping listeners.");

  populateNewGroupColors(); // Populate color dropdown
  loadExistingGroups(); // Initial load of existing groups

  // --- Add event listeners ---
  targetGroupSelect.addEventListener("change", handleTargetGroupChange);
  moveToGroupBtn.addEventListener("click", handleMoveToGroupClick);

  // *** ADDED LISTENERS FOR DOMAIN GROUPING BUTTONS ***
  groupByDomainBtn.addEventListener("click", handleGroupByDomainClick);
  regroupAllByDomainBtn.addEventListener(
    "click",
    handleRegroupAllByDomainClick
  );
  // *** END ADDED LISTENERS ***

  // Optional: Allow Enter key in the new group name input to trigger move/create
  newGroupNameInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      handleMoveToGroupClick();
    }
  });

  // Mark listeners as attached using the button we checked
  moveToGroupBtn.dataset.listenerAttached = "true";
  // Optionally mark the other buttons too for consistency
  groupByDomainBtn.dataset.listenerAttached = "true";
  regroupAllByDomainBtn.dataset.listenerAttached = "true";
}
