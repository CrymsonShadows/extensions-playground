// content_script_youtube.js
console.log(
  "YouTube Stash Buttons & Highlighter: Content script loaded. (v3 - Precise Video Page Button)"
);

// --- Constants for Stash Buttons ---
const STASH_BUTTON_CLASS_THUMBNAIL = "yt-thumbnail-stash-button";
const STASH_BUTTON_CLASS_VIDEOPAGE = "yt-video-page-stash-button";
const STASH_BUTTON_PROCESSED_MARKER = "yt-stash-button-processed";
const STASH_ICON_URL = chrome.runtime.getURL("icons/stash_icon.svg");
const STASHED_FEEDBACK_CLASS = "stashed-feedback"; // CSS class for feedback
const FEEDBACK_DURATION = 2000; // 2 seconds

// --- Constants for Highlighting ---
const HIGHLIGHT_CLASS = "stashed-link-highlight";

// --- State Variables ---
let stashIconSvgContent = "";
let stashedUrlSet = new Set();
let isHighlightingActive = false;

// --- Fetch Stash Icon SVG ---
fetch(STASH_ICON_URL)
  .then((response) => response.text())
  .then((svg) => {
    stashIconSvgContent = svg;
    initializeScript();
  })
  .catch((err) => console.error("Error loading stash icon SVG:", err));

// --- Normalization for Highlighting ---
function normalizeUrlForHighlighting(urlString) {
  try {
    const url = new URL(urlString);
    url.hash = "";
    let href = url.href;
    if (url.pathname !== "/" && href.endsWith("/")) {
      href = href.slice(0, -1);
    }
    return href;
  } catch (e) {
    return null;
  }
}

// --- Apply Highlighting Logic ---
function applyHighlighting() {
  if (!document.body) return;
  const links = document.querySelectorAll("a[href]");
  links.forEach((link) => {
    const absoluteUrl = link.href;
    const normalized = normalizeUrlForHighlighting(absoluteUrl);
    if (normalized) {
      const isStashed = stashedUrlSet.has(normalized);
      if (isHighlightingActive && isStashed) {
        if (!link.classList.contains(HIGHLIGHT_CLASS)) {
          link.classList.add(HIGHLIGHT_CLASS);
        }
      } else {
        if (link.classList.contains(HIGHLIGHT_CLASS)) {
          link.classList.remove(HIGHLIGHT_CLASS);
        }
      }
    } else {
      if (link.classList.contains(HIGHLIGHT_CLASS)) {
        link.classList.remove(HIGHLIGHT_CLASS);
      }
    }
  });
}

// --- Stash Button Creation and Handling ---
function createStashButton(type = "thumbnail") {
  const button = document.createElement("button");
  button.innerHTML = stashIconSvgContent;
  button.classList.add("yt-stash-button");
  if (type === "thumbnail") {
    button.classList.add(
      STASH_BUTTON_CLASS_THUMBNAIL,
      "yt-stash-button-icon-only"
    );
    button.title = "Stash Video";
  } else if (type === "videoPage") {
    button.classList.add(STASH_BUTTON_CLASS_VIDEOPAGE);
    const textSpan = document.createElement("span");
    textSpan.textContent = "Stash";
    button.appendChild(textSpan);
  }
  return button;
}

function getYouTubeVideoId(url) {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    if (
      urlObj.hostname === "www.youtube.com" ||
      urlObj.hostname === "youtube.com"
    ) {
      if (urlObj.pathname === "/watch") return urlObj.searchParams.get("v");
      if (urlObj.pathname.startsWith("/shorts/"))
        return urlObj.pathname.split("/shorts/")[1].split("?")[0];
      if (urlObj.pathname.startsWith("/live/"))
        return urlObj.pathname.split("/live/")[1].split("?")[0];
      if (urlObj.pathname.startsWith("/embed/"))
        return urlObj.pathname.split("/embed/")[1].split("?")[0];
    } else if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.substring(1).split("?")[0];
    }
  } catch (e) {
    /* console.warn("Error parsing YouTube URL for Video ID:", url, e); */
  }
  return null;
}

function handleStashClick(videoUrl, videoTitle, buttonElement) {
  if (!videoUrl || !videoTitle) {
    console.error("Stash Error: Missing video URL or title.", {
      videoUrl,
      videoTitle,
    });
    return;
  }
  buttonElement.disabled = true;
  chrome.runtime.sendMessage(
    {
      type: "STASH_YOUTUBE_VIDEO",
      payload: { url: videoUrl, title: videoTitle },
    },
    (response) => {
      buttonElement.disabled = false; // Re-enable button regardless of response for now
      if (chrome.runtime.lastError) {
        console.error(
          "Error sending stash message:",
          chrome.runtime.lastError.message
        );
      } else {
        if (response && response.status === "success") {
          buttonElement.classList.add(STASHED_FEEDBACK_CLASS);
          setTimeout(() => {
            buttonElement.classList.remove(STASHED_FEEDBACK_CLASS);
          }, FEEDBACK_DURATION);
        } else {
          console.warn(
            "Stash operation failed or status not success:",
            response
          );
        }
      }
    }
  );
}

function injectButtonOnThumbnail(thumbnailElement) {
  if (thumbnailElement.classList.contains(STASH_BUTTON_PROCESSED_MARKER))
    return;
  thumbnailElement.classList.add(STASH_BUTTON_PROCESSED_MARKER);
  const anchor = thumbnailElement.querySelector("a#thumbnail");
  if (!anchor || !anchor.href) return;
  let videoTitle = "";
  const titleElement =
    thumbnailElement.querySelector("#video-title") ||
    thumbnailElement.querySelector(
      ".title-and-badge.ytd-video-renderer #video-title"
    ) ||
    thumbnailElement.querySelector(
      "yt-formatted-string.ytd-rich-grid-media[is-empty='false']"
    ) ||
    thumbnailElement.querySelector(
      "span#video-title.ytd-compact-video-renderer"
    ) ||
    thumbnailElement.querySelector("h3.media-item-headline > span") ||
    thumbnailElement.querySelector("h3.yt-lockup-title > a") ||
    thumbnailElement.querySelector(".details .title") ||
    thumbnailElement.querySelector(".media-item-metadata > .title") ||
    thumbnailElement.querySelector(
      "span.title.style-scope.ytm-video-with-context-renderer"
    ) ||
    thumbnailElement.querySelector("h3.compact-media-item-headline > span");

  if (titleElement) {
    videoTitle =
      titleElement.textContent?.trim() ||
      titleElement.getAttribute("aria-label") ||
      titleElement.title;
  }
  if (!videoTitle) {
    videoTitle = anchor.getAttribute("aria-label") || anchor.title;
  }
  if (!videoTitle && thumbnailElement.querySelector("img#img")) {
    videoTitle = thumbnailElement.querySelector("img#img").alt;
  }
  videoTitle = videoTitle || "YouTube Video";

  const videoUrl = anchor.href;
  if (!getYouTubeVideoId(videoUrl)) return;
  const button = createStashButton("thumbnail");
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleStashClick(videoUrl, videoTitle, button);
  });
  const thumbnailContainer =
    thumbnailElement.querySelector("ytd-thumbnail") || thumbnailElement;
  thumbnailContainer.style.position = "relative";
  thumbnailContainer.appendChild(button);
}

function injectButtonOnVideoPage() {
  console.log("Attempting to inject button on video page...");
  if (document.querySelector(`.${STASH_BUTTON_CLASS_VIDEOPAGE}`)) {
    console.log("Video page stash button already exists.");
    return;
  }

  const potentialActionContainers = [
    // Selector based on user's provided HTML (HIGHEST PRIORITY)
    "ytd-watch-metadata > ytd-menu-renderer > div#top-level-buttons-computed.ytd-menu-renderer",
    "ytd-watch-metadata div#top-level-buttons-computed.ytd-menu-renderer", // Slightly less specific but still good
    "ytd-watch-metadata #top-level-buttons-computed", // Even less specific for the ID within metadata

    // Original common modern desktop selectors
    "#menu.ytd-video-primary-info-renderer #top-level-buttons-computed",
    "ytd-menu-renderer.ytd-video-primary-info-renderer > div#top-level-buttons-computed",

    // Newer desktop layout (actions row below video, above comments)
    "ytd-watch-metadata #actions-inner #menu #top-level-buttons-computed",
    "ytd-video-secondary-info-renderer div#actions.ytd-video-secondary-info-renderer div#menu.ytd-video-secondary-info-renderer",
    "ytd-video-secondary-info-renderer #actions #menu",

    // Older or alternative desktop selectors
    "ytd-menu-renderer.ytd-video-primary-info-renderer > div",
    "#actions #menu",

    // Mobile web selectors
    ".slim-video-action-bar-actions",
    "ytm-slim-video-metadata-actions-renderer",
  ];

  let actionsContainer = null;
  for (const selector of potentialActionContainers) {
    actionsContainer = document.querySelector(selector);
    if (actionsContainer) {
      console.log(
        "Found actions container with selector:",
        selector,
        actionsContainer
      );
      break;
    }
  }

  if (!actionsContainer) {
    console.log(
      "Could not find a suitable actions container for video page button after trying all selectors."
    );
    return;
  }

  if (actionsContainer.classList.contains(STASH_BUTTON_PROCESSED_MARKER)) {
    console.log(
      "Actions container (",
      actionsContainer,
      ") already marked as processed."
    );
    return;
  }

  actionsContainer.classList.add(STASH_BUTTON_PROCESSED_MARKER);
  console.log("Marked actions container as processed:", actionsContainer);

  const videoTitle = document.title.replace(" - YouTube", "").trim();
  const videoUrl = window.location.href;

  const buttonContainer = document.createElement("div");
  buttonContainer.classList.add("yt-video-page-stash-button-container");

  const button = createStashButton("videoPage");
  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleStashClick(videoUrl, videoTitle, button);
  });

  buttonContainer.appendChild(button);

  actionsContainer.appendChild(buttonContainer);
  console.log("Stash button appended to actions container:", actionsContainer);
}

// --- Combined Scan Function ---
function runUpdates() {
  if (!stashIconSvgContent && !isHighlightingActive) return;

  if (stashIconSvgContent) {
    const thumbnailSelectors = [
      "ytd-rich-item-renderer",
      "ytd-grid-video-renderer",
      "ytd-compact-video-renderer",
      "ytd-video-renderer",
      "ytd-playlist-panel-video-renderer",
      "ytm-compact-video-renderer",
      "ytm-video-with-context-renderer",
      "ytm-item-section-renderer ytm-compact-video-renderer",
      "ytm-slim-owner-video-renderer",
    ];
    thumbnailSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach(injectButtonOnThumbnail);
    });

    if (
      window.location.pathname === "/watch" ||
      window.location.pathname.startsWith("/shorts/") ||
      window.location.pathname.startsWith("/live/")
    ) {
      injectButtonOnVideoPage();
    } else {
      const processedVideoPageContainers = document.querySelectorAll(
        `.${STASH_BUTTON_PROCESSED_MARKER}`
      );
      processedVideoPageContainers.forEach((container) => {
        if (
          !container.closest(
            "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer, ytm-compact-video-renderer, ytm-video-with-context-renderer, ytm-slim-owner-video-renderer"
          )
        ) {
          const oldButtonContainer = container.querySelector(
            `.yt-video-page-stash-button-container`
          );
          if (oldButtonContainer) {
            // console.log("Cleaning up old video page stash button from:", container);
            oldButtonContainer.remove();
          }
          container.classList.remove(STASH_BUTTON_PROCESSED_MARKER);
        }
      });
    }
  }
  applyHighlighting();
}

// --- MutationObserver ---
let observer;
function observeAndRunUpdates() {
  runUpdates();
  if (observer) observer.disconnect();
  observer = new MutationObserver((mutationsList) => {
    let needsRun = false;
    for (const mutation of mutationsList) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const relevantSelectors =
              "ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-playlist-panel-video-renderer, ytm-compact-video-renderer, ytm-video-with-context-renderer, ytm-slim-owner-video-renderer, ytd-menu-renderer, ytd-watch-metadata, #menu.ytd-video-primary-info-renderer, ytd-video-primary-info-renderer, #actions.ytd-video-secondary-info-renderer, .slim-video-action-bar-actions, a[href]";
            if (
              node.matches &&
              (node.matches(relevantSelectors) ||
                node.querySelector(relevantSelectors))
            ) {
              needsRun = true;
              break;
            }
          }
        }
      }
      if (
        mutation.type === "attributes" &&
        (mutation.attributeName === "href" ||
          (mutation.target.nodeName === "BODY" &&
            mutation.attributeName === "dark"))
      ) {
        needsRun = true;
      }
      if (needsRun) break;
    }
    if (needsRun) {
      requestAnimationFrame(runUpdates);
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["href", "dark"],
  });
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPDATE_HIGHLIGHTING") {
    isHighlightingActive = message.enabled;
    const newUrls = message.stashedUrls
      .map(normalizeUrlForHighlighting)
      .filter((url) => url !== null);
    stashedUrlSet = new Set(newUrls);
    applyHighlighting();
    if (sendResponse)
      sendResponse({ status: "Highlighting updated on YouTube" });
    return true;
  }
});

// --- Initialization ---
function initializeScript() {
  if (!stashIconSvgContent) return;
  chrome.runtime.sendMessage(
    { type: "GET_INITIAL_HIGHLIGHT_STATE" },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn(
          "YT Highlighter: Could not get initial state:",
          chrome.runtime.lastError.message
        );
      } else if (response) {
        isHighlightingActive = response.enabled;
        const initialUrls = response.stashedUrls
          .map(normalizeUrlForHighlighting)
          .filter((url) => url !== null);
        stashedUrlSet = new Set(initialUrls);
      } else {
        console.warn(
          "YT Highlighter: Received empty/invalid response for initial state."
        );
      }
      observeAndRunUpdates();
    }
  );
}

// --- SPA Navigation Handling ---
function handleNavigation() {
  // console.log("YouTube navigation event. Cleaning markers & re-running updates.");
  const potentialOldContainers = [
    "ytd-watch-metadata > ytd-menu-renderer > div#top-level-buttons-computed.ytd-menu-renderer",
    "ytd-watch-metadata div#top-level-buttons-computed.ytd-menu-renderer",
    "ytd-watch-metadata #top-level-buttons-computed",
    "#menu.ytd-video-primary-info-renderer #top-level-buttons-computed",
    "ytd-menu-renderer.ytd-video-primary-info-renderer > div#top-level-buttons-computed",
    "ytd-watch-metadata #actions-inner #menu #top-level-buttons-computed",
    "ytd-video-secondary-info-renderer div#actions.ytd-video-secondary-info-renderer div#menu.ytd-video-secondary-info-renderer",
    "ytd-video-secondary-info-renderer #actions #menu",
    "ytd-menu-renderer.ytd-video-primary-info-renderer > div",
    "#actions #menu",
    ".slim-video-action-bar-actions",
    "ytm-slim-video-metadata-actions-renderer",
  ];
  potentialOldContainers.forEach((selector) => {
    const el = document.querySelector(
      selector + `.${STASH_BUTTON_PROCESSED_MARKER}`
    );
    if (el) {
      // console.log("Navigation: Removing processed marker from:", el);
      el.classList.remove(STASH_BUTTON_PROCESSED_MARKER);
      const oldButton = el.querySelector(
        ".yt-video-page-stash-button-container"
      );
      if (oldButton) {
        // console.log("Navigation: Removing old button from:", el);
        oldButton.remove();
      }
    }
  });

  requestAnimationFrame(runUpdates);
}
window.addEventListener("yt-navigate-finish", handleNavigation);
window.addEventListener("popstate", handleNavigation);

if (stashIconSvgContent) {
  initializeScript();
}
