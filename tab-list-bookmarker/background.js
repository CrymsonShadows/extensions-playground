// background.js

// Ensure the side panel opens when the toolbar icon is clicked
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// Optional: Add a listener for the action click if you want custom behavior,
// but setPanelBehavior is usually sufficient for just opening the panel.
chrome.action.onClicked.addListener((tab) => {
  // This listener is often redundant if setPanelBehavior is used,
  // but can be useful for more complex logic if needed later.
  console.log("Toolbar icon clicked.");
  // You could potentially toggle the panel here if needed,
  // but openPanelOnActionClick handles the primary open action.
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// You might add other background listeners here if needed,
// for example, listening for messages from the sidebar script.
console.log("Background service worker started.");
