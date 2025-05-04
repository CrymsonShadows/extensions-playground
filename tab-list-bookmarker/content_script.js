// content_script.js

console.log("Stash Highlighter: Content script loaded.");

const HIGHLIGHT_CLASS = "stashed-link-highlight"; // CSS class for highlighting
let stashedUrlSet = new Set(); // Use a Set for efficient URL lookup
let isHighlightingActive = false; // Current state of highlighting

/**
 * Normalizes a URL for comparison.
 * Removes the hash fragment and trailing slash.
 * @param {string} urlString - The URL string to normalize.
 * @returns {string|null} Normalized URL or null if invalid.
 */
function normalizeUrl(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = ""; // Remove fragment identifier
    let href = url.href;
    // Remove trailing slash if path is not just "/"
    if (url.pathname !== "/" && href.endsWith("/")) {
      href = href.slice(0, -1);
    }
    return href;
  } catch (e) {
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
  console.log(
    `Stash Highlighter: Applying highlighting. Active: ${isHighlightingActive}, Stashed URLs: ${stashedUrlSet.size}`
  );
  const links = document.querySelectorAll("a[href]");
  let highlightedCount = 0;
  let checkedCount = 0;

  links.forEach((link) => {
    // 'link.href' automatically resolves relative paths to absolute URLs
    const absoluteUrl = link.href;
    const normalized = normalizeUrl(absoluteUrl);
    checkedCount++;

    if (normalized) {
      const isStashed = stashedUrlSet.has(normalized);

      if (isHighlightingActive && isStashed) {
        if (!link.classList.contains(HIGHLIGHT_CLASS)) {
          // console.log("Stash Highlighter: Highlighting link:", normalized);
          link.classList.add(HIGHLIGHT_CLASS);
        }
        highlightedCount++;
      } else {
        if (link.classList.contains(HIGHLIGHT_CLASS)) {
          // console.log("Stash Highlighter: Removing highlight from link:", normalized);
          link.classList.remove(HIGHLIGHT_CLASS);
        }
      }
    } else {
      // Ensure non-HTTP links are not highlighted
      if (link.classList.contains(HIGHLIGHT_CLASS)) {
        link.classList.remove(HIGHLIGHT_CLASS);
      }
    }
  });
  console.log(
    `Stash Highlighter: Checked ${checkedCount} links, highlighted ${highlightedCount} links.`
  );
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Stash Highlighter: Received message:", message.type, message);
  if (message.type === "UPDATE_HIGHLIGHTING") {
    isHighlightingActive = message.enabled;
    // Rebuild the Set with normalized URLs from the received list
    const newUrls = message.stashedUrls
      .map(normalizeUrl)
      .filter((url) => url !== null);
    stashedUrlSet = new Set(newUrls);
    console.log(
      `Stash Highlighter: Updated state via UPDATE_HIGHLIGHTING. Enabled: ${isHighlightingActive}, URLs: ${stashedUrlSet.size}`
    );
    applyHighlighting();
    // Optional: Send confirmation back if needed
    // sendResponse({ status: "Highlighting updated" });
    return true; // Keep the message channel open for asynchronous response if needed
  }
});

// --- Dynamic Content Handling ---
// Use MutationObserver to re-apply highlighting when the DOM changes
const observer = new MutationObserver((mutations) => {
  // Simple check: If anything changed, re-apply highlighting.
  // More complex checks might be needed for performance on very dynamic pages.
  // Debounce or throttle this if it causes performance issues.
  // console.log("Stash Highlighter: DOM changed, queueing re-apply.");
  requestAnimationFrame(applyHighlighting); // Use requestAnimationFrame for smoother updates
});

// Start observing the document body for added nodes and attribute changes
const observerConfig = {
  childList: true, // Observe direct children additions/removals
  subtree: true, // Observe all descendants
  attributes: true, // Observe attribute changes
  attributeFilter: ["href"], // Only observe changes to the 'href' attribute on any element
  // Consider adding 'class' to attributeFilter if other scripts might remove your highlight class
};

function startObserver() {
  if (document.body) {
    observer.observe(document.body, observerConfig);
    console.log("Stash Highlighter: MutationObserver started.");
    // Apply initial highlighting once observer is ready (will be based on initial state from background)
    // applyHighlighting(); // No need to call here, initial request below handles it.
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
          // Apply initial highlighting (will be based on initial state from background)
          // applyHighlighting(); // No need to call here, initial request below handles it.
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

// --- Initial Request for State ---
// Ask the background script for the current state when the script loads.
console.log(
  "Stash Highlighter: Requesting initial highlight state from background."
);
chrome.runtime.sendMessage(
  { type: "GET_INITIAL_HIGHLIGHT_STATE" },
  (response) => {
    if (chrome.runtime.lastError) {
      // This is expected if the background script isn't ready or doesn't respond
      console.warn(
        "Stash Highlighter: Could not get initial state (maybe background not ready?):",
        chrome.runtime.lastError.message
      );
      // Apply highlighting with default (off) state just in case
      applyHighlighting();
    } else if (response) {
      console.log(
        "Stash Highlighter: Received initial state response:",
        response
      );
      isHighlightingActive = response.enabled;
      const initialUrls = response.stashedUrls
        .map(normalizeUrl)
        .filter((url) => url !== null);
      stashedUrlSet = new Set(initialUrls);
      console.log(
        `Stash Highlighter: Initial state set. Enabled: ${isHighlightingActive}, URLs: ${stashedUrlSet.size}`
      );
      applyHighlighting(); // Apply based on initial state
    } else {
      console.warn(
        "Stash Highlighter: Received empty/invalid response for initial state."
      );
      applyHighlighting(); // Apply with default state
    }
  }
);

// Start the observer
startObserver();
