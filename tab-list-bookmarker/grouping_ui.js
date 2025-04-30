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
const groupByDomainBtn = document.getElementById("group-by-domain-btn");
const regroupAllByDomainBtn = document.getElementById(
  "regroup-all-by-domain-btn"
);
const groupStatusMessageElement = document.getElementById(
  "group-status-message"
);

// --- Grouping Actions ---
export async function loadExistingGroups() {
  try {
    targetGroupSelect.innerHTML = '<option value="">Loading groups...</option>'; // Show loading
    const groups = await chrome.tabGroups.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    targetGroupSelect.innerHTML = ""; // Clear loading/previous
    const newGroupOption = document.createElement("option");
    newGroupOption.value = "new";
    newGroupOption.textContent = "Create New Group...";
    targetGroupSelect.appendChild(newGroupOption);
    groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      const colorIndicator = `<span class="group-color-indicator" style="background-color: ${
        groupColorMap[group.color] || "#DADCE0"
      }; display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: middle;"></span>`;
      option.innerHTML = colorIndicator + (group.title || `Group ${group.id}`);
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

function populateNewGroupColors() {
  newGroupColorSelect.innerHTML = "";
  availableGroupColors.forEach((colorName) => {
    const option = document.createElement("option");
    option.value = colorName;
    option.textContent = colorName.charAt(0).toUpperCase() + colorName.slice(1);
    option.style.backgroundColor =
      groupBackgroundColorMap[colorName] || "#F1F3F4";
    newGroupColorSelect.appendChild(option);
  });
  newGroupColorSelect.value = "grey"; // Default
}

function handleTargetGroupChange() {
  if (targetGroupSelect.value === "new") {
    newGroupOptionsDiv.classList.remove("hidden");
  } else {
    newGroupOptionsDiv.classList.add("hidden");
  }
}

async function handleMoveToGroupClick() {
  const selectedTabs = getSelectedTabData(); // Use imported function
  const targetGroupIdOrNew = targetGroupSelect.value;
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
      // Create new group
      const newGroupId = await chrome.tabs.group({ tabIds: tabIdsToMove });
      const updateProperties = {};
      const newName = newGroupNameInput.value.trim();
      const newColor = newGroupColorSelect.value;
      if (newName) {
        updateProperties.title = newName;
      }
      updateProperties.color = newColor;
      if (Object.keys(updateProperties).length > 0) {
        await chrome.tabGroups.update(newGroupId, updateProperties);
      }
      setGroupStatusMessage(
        groupStatusMessageElement,
        `Moved ${tabIdsToMove.length} tab(s) to new group ${
          newName || `(ID: ${newGroupId})`
        }.`
      );
      newGroupNameInput.value = "";
    } else {
      // Move to existing group
      const targetGroupId = parseInt(targetGroupIdOrNew, 10);
      if (isNaN(targetGroupId)) {
        setGroupStatusMessage(
          groupStatusMessageElement,
          "Invalid target group selected.",
          true
        );
        return;
      }
      await chrome.tabs.group({ tabIds: tabIdsToMove, groupId: targetGroupId });
      try {
        const groupInfo = await chrome.tabGroups.get(targetGroupId);
        setGroupStatusMessage(
          groupStatusMessageElement,
          `Moved ${tabIdsToMove.length} tab(s) to group "${
            groupInfo.title || `Group ${targetGroupId}`
          }".`
        );
      } catch (groupError) {
        console.warn("Could not get group info:", groupError);
        setGroupStatusMessage(
          groupStatusMessageElement,
          `Moved ${tabIdsToMove.length} tab(s) to group ${targetGroupId}.`
        );
      }
    }
    // Refresh needed - signal main script or pass renderTabs function
    // For simplicity now, assume main script's listeners handle refresh
    clearSelectedTabs(); // Use imported function
    await loadExistingGroups(); // Reload dropdown
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
    // Refresh dropdown even on error?
    await loadExistingGroups();
  }
}

async function handleGroupByDomainClick() {
  // Groups only UNGROUPED tabs
  setGroupStatusMessage(
    groupStatusMessageElement,
    "Grouping ungrouped tabs by domain..."
  );
  try {
    const tabs = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    const domains = new Map();
    for (const tab of tabs) {
      if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
        continue;
      }
      const originalInfo = getOriginalTabInfo(tab.url, tab.title);
      if (!originalInfo.url || !originalInfo.url.startsWith("http")) {
        continue;
      }
      try {
        const hostname = new URL(originalInfo.url).hostname;
        const domain = getSldTld(hostname);
        if (domain) {
          if (!domains.has(domain)) {
            domains.set(domain, []);
          }
          domains.get(domain).push(tab.id);
        }
      } catch (e) {
        console.warn(
          `Could not parse URL/get domain for: ${originalInfo.url}`,
          e
        );
      }
    }
    let groupsCreated = 0;
    for (const [domainName, tabIds] of domains.entries()) {
      if (tabIds.length > 1) {
        try {
          const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
          await chrome.tabGroups.update(newGroupId, { title: domainName });
          groupsCreated++;
        } catch (groupError) {
          console.error(`Error creating group for ${domainName}:`, groupError);
          setGroupStatusMessage(
            groupStatusMessageElement,
            `Error grouping ${domainName}: ${groupError.message}`,
            true
          );
        }
      }
    }
    if (groupsCreated > 0) {
      setGroupStatusMessage(
        groupStatusMessageElement,
        `Created ${groupsCreated} group(s) for ungrouped tabs.`
      );
      await loadExistingGroups();
    } // Reload dropdown
    else {
      setGroupStatusMessage(
        groupStatusMessageElement,
        "No new groups needed for ungrouped tabs."
      );
    }
    // Assume main script listener handles renderTabs refresh
  } catch (error) {
    console.error("Error grouping ungrouped:", error);
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

async function handleRegroupAllByDomainClick() {
  setGroupStatusMessage(
    groupStatusMessageElement,
    "Regrouping ALL tabs by domain..."
  );
  try {
    const tabs = await chrome.tabs.query({
      windowId: chrome.windows.WINDOW_ID_CURRENT,
    });
    const domains = new Map();
    const allTabIdsToProcess = [];
    for (const tab of tabs) {
      const originalInfo = getOriginalTabInfo(tab.url, tab.title);
      if (!originalInfo.url || !originalInfo.url.startsWith("http")) {
        continue;
      }
      allTabIdsToProcess.push(tab.id);
      try {
        const hostname = new URL(originalInfo.url).hostname;
        const domain = getSldTld(hostname);
        if (domain) {
          if (!domains.has(domain)) {
            domains.set(domain, []);
          }
          domains.get(domain).push(tab.id);
        }
      } catch (e) {
        console.warn(
          `Could not parse URL/get domain for: ${originalInfo.url}`,
          e
        );
      }
    }
    if (allTabIdsToProcess.length > 0) {
      try {
        await chrome.tabs.ungroup(allTabIdsToProcess);
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (ungroupError) {
        if (!ungroupError.message.includes("tabs are not in the same group")) {
          console.error("Ungrouping error:", ungroupError);
        } else {
          console.log("Some tabs already ungrouped.");
        }
      }
    }
    let groupsCreated = 0;
    for (const [domainName, tabIds] of domains.entries()) {
      if (tabIds.length > 1) {
        try {
          const newGroupId = await chrome.tabs.group({ tabIds: tabIds });
          await chrome.tabGroups.update(newGroupId, { title: domainName });
          groupsCreated++;
        } catch (groupError) {
          console.error(`Error creating group for ${domainName}:`, groupError);
          setGroupStatusMessage(
            groupStatusMessageElement,
            `Error grouping ${domainName}: ${groupError.message}`,
            true
          );
        }
      }
    }
    setGroupStatusMessage(
      groupStatusMessageElement,
      `Regrouped tabs, created ${groupsCreated} group(s).`
    );
    await loadExistingGroups(); // Reload dropdown
    // Assume main script listener handles renderTabs refresh
  } catch (error) {
    console.error("Error regrouping all:", error);
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
export function setupGroupingUI() {
  populateNewGroupColors();
  loadExistingGroups(); // Initial load
  targetGroupSelect.addEventListener("change", handleTargetGroupChange);
  moveToGroupBtn.addEventListener("click", handleMoveToGroupClick);
  groupByDomainBtn.addEventListener("click", handleGroupByDomainClick);
  regroupAllByDomainBtn.addEventListener(
    "click",
    handleRegroupAllByDomainClick
  );
  newGroupNameInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      handleMoveToGroupClick();
    }
  });
}
