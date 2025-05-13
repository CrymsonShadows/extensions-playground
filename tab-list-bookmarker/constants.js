// constants.js

// Color maps
export const groupColorMap = {
  grey: "#DADCE0",
  blue: "#89B4F8",
  red: "#F28B82",
  yellow: "#FDD663",
  green: "#81C995",
  pink: "#FF8BCB",
  purple: "#C58AF9",
  cyan: "#78D9EC",
  orange: "#FCAD70",
};
export const groupBackgroundColorMap = {
  grey: "#F1F3F4",
  blue: "#E8F0FE",
  red: "#FCE8E6",
  yellow: "#FEF7E0",
  green: "#E6F4EA",
  pink: "#FCE8F4",
  purple: "#F3E8FD",
  cyan: "#E0FCFF",
  orange: "#FEEFDC",
};
export const availableGroupColors = Object.keys(groupColorMap);

// IndexedDB Constants
export const DB_NAME = "TabStashDB";
export const DB_VERSION = 6; // <<<<<<<<<<<< INCREMENTED VERSION
export const STORE_NAME = "stashedTabs";
export const URL_INDEX = "urlIndex";
export const DATE_INDEX = "dateCreatedIndex"; // Original creation date
export const CONSUMED_INDEX = "consumedIndex";
export const TITLE_INDEX = "titleIndex";
export const STASH_COUNT_INDEX = "stashCountIndex";
export const TAGS_INDEX = "tagsIndex";
export const FAVORITE_INDEX = "favoriteIndex";
export const DATE_UPDATED_INDEX = "dateUpdatedIndex"; // <<<<<<<<<<<< NEW INDEX for last stashed/updated date

// Storage Key for Checkbox State (if using storage method)
// export const CHECKED_TABS_STORAGE_KEY = 'sidebarCheckedTabs';

// Element IDs (Optional, but can help avoid typos)
// Example: export const TAB_LIST_ID = 'tab-list';
