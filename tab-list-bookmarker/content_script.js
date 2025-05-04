// content_script.js

console.log("Stash Highlighter: Content script loaded.");

const HIGHLIGHT_CLASS = "stashed-link-highlight"; // CSS class for highlighting
let stashedUrlSet = new Set(); // Use a Set for efficient URL lookup
let isHighlightingActive = false; // Current state of highlighting

/**
 * Normalizes a URL for comparison.
 * Removes the hash fragment and ensures consistent trailing slash.
 * @param {string} urlString - The URL string to normalize.
 * @returns {string|null} Normalized URL or null if invalid.
 */
function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = ""; // Remove fragment identifier
    // Optional: Consistent trailing slash (can sometimes cause issues, test carefully)
    // if (url.pathname === '/') {
    //   return url.origin + '/';
    // } else {
    //   return url.origin + url.pathname.replace(/\/$/, '') + url.search;
    // }
    return url.href; // Return URL without hash
  } catch (e) {
    // Handle invalid URLs (e.g., 'javascript:', 'mailto:') gracefully
    // console.warn(`Stash Highlighter: Could not normalize invalid URL: ${urlString}`);
    return null;
  }
}

/**
 * Finds all anchor tags and applies/removes the highlight class based on stashed URLs.
 */
function applyHighlighting() {
  if (!document.body) {
    console.log("Stash Highlighter: Document body not ready.");
    return; // Don't run if body isn't loaded yet
  }
  // console.log(`Stash Highlighter: Applying highlighting. Active: ${isHighlightingActive}, Stashed URLs: ${stashedUrlSet.size}`);
  const links = document.querySelectorAll("a[href]");
  let highlightedCount = 0;

  links.forEach((link) => {
    // 'link.href' automatically resolves relative paths to absolute URLs
    const absoluteUrl = link.href;
    const normalized = normalizeUrl(absoluteUrl);

    if (normalized) {
      const isStashed = stashedUrlSet.has(normalized);

      if (isHighlightingActive && isStashed) {
        link.classList.add(HIGHLIGHT_CLASS);
        highlightedCount++;
      } else {
        link.classList.remove(HIGHLIGHT_CLASS);
      }
    } else {
      // Ensure non-HTTP links are not highlighted
      link.classList.remove(HIGHLIGHT_CLASS);
    }
  });
  // console.log(`Stash Highlighter: Highlighted ${highlightedCount} links.`);
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // console.log("Stash Highlighter: Received message:", message);
  if (message.type === "UPDATE_HIGHLIGHTING") {
    isHighlightingActive = message.enabled;
    // Rebuild the Set with normalized URLs from the received list
    stashedUrlSet = new Set(
      message.stashedUrls.map(normalizeUrl).filter((url) => url !== null)
    );
    // console.log(`Stash Highlighter: Updated state. Enabled: ${isHighlightingActive}, URLs: ${stashedUrlSet.size}`);
    applyHighlighting();
    // Optional: Send confirmation back if needed
    // sendResponse({ status: "Highlighting updated" });
    return true; // Keep the message channel open for asynchronous response if needed
  }
});

// --- Dynamic Content Handling ---
// Use MutationObserver to re-apply highlighting when the DOM changes
const observer = new MutationObserver((mutations) => {
  // Check if any added nodes contain links or if attributes of links changed
  let needsReapply = false;
  for (const mutation of mutations) {
    if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        // Check if the added node is an element and contains 'a' tags or is an 'a' tag itself
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          (node.matches("a[href]") || node.querySelector("a[href]"))
        ) {
          needsReapply = true;
          break; // No need to check further nodes in this mutation
        }
      }
    } else if (
      mutation.type === "attributes" &&
      mutation.target.nodeName === "A" &&
      mutation.attributeName === "href"
    ) {
      // If an existing link's href changes
      needsReapply = true;
    }
    if (needsReapply) break; // No need to check further mutations
  }

  if (needsReapply) {
    // console.log("Stash Highlighter: DOM changed, reapplying highlighting.");
    // Debounce or throttle this if it causes performance issues on dynamic pages
    applyHighlighting();
  }
});

// Start observing the document body for added nodes and attribute changes
// Wait for the body to exist before observing
const observerConfig = {
  childList: true, // Observe direct children additions/removals
  subtree: true, // Observe all descendants
  attributes: true, // Observe attribute changes
  attributeFilter: ["href"], // Only observe changes to the 'href' attribute
};

function startObserver() {
  if (document.body) {
    observer.observe(document.body, observerConfig);
    console.log("Stash Highlighter: MutationObserver started.");
    // Apply initial highlighting once observer is ready
    applyHighlighting();
  } else {
    // If body isn't ready yet, wait for DOMContentLoaded
    window.addEventListener(
      "DOMContentLoaded",
      () => {
        if (document.body) {
          observer.observe(document.body, observerConfig);
          console.log(
            "Stash Highlighter: MutationObserver started after DOMContentLoaded."
          );
          // Apply initial highlighting
          applyHighlighting();
        } else {
          console.error(
            "Stash Highlighter: Document body not found even after DOMContentLoaded."
          );
        }
      },
      { once: true }
    );
  }
}

// --- Initial Request (Optional but good practice) ---
// Ask the background/sidebar for the current state when the script loads.
// This handles cases where the content script loads *after* the sidebar sends the initial state.
// Note: This requires a listener in the background or sidebar to respond.
// For simplicity with the current structure, we rely on the sidebar sending
// the state when it loads/changes. If highlighting doesn't appear on initial
// page load sometimes, adding this request/response mechanism might be needed.
chrome.runtime.sendMessage(
  { type: "GET_INITIAL_HIGHLIGHT_STATE" },
  (response) => {
    if (chrome.runtime.lastError) {
      console.warn(
        "Stash Highlighter: Could not get initial state:",
        chrome.runtime.lastError.message
      );
    } else if (response) {
      console.log("Stash Highlighter: Received initial state:", response);
      isHighlightingActive = response.enabled;
      stashedUrlSet = new Set(
        response.stashedUrls.map(normalizeUrl).filter((url) => url !== null)
      );
      applyHighlighting(); // Apply based on initial state
    }
  }
);

// Start the observer
startObserver();
