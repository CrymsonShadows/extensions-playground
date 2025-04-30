// utils.js

// --- Get Original Tab Info (URL and Title) ---
export function getOriginalTabInfo(tabUrl, tabTitle) {
  const result = {
    url: tabUrl,
    title: tabTitle,
    isSuspended: false,
    needsTitleFetch: false,
  };
  if (!tabUrl) return result;
  if (tabUrl.startsWith("chrome-extension://") && tabUrl.includes("url=")) {
    try {
      const urlObject = new URL(tabUrl);
      const params = new URLSearchParams(urlObject.search);
      const originalUrl = params.get("url");
      const originalTitle = params.get("title");
      if (originalUrl) {
        result.url = originalUrl;
        result.isSuspended = true;
        if (originalTitle) {
          result.title = originalTitle;
        } else {
          try {
            const parsed = new URL(originalUrl);
            result.title =
              parsed.hostname +
              (parsed.pathname === "/" ? "" : parsed.pathname);
          } catch (urlParseError) {
            result.title = originalUrl;
          }
          if (result.url.includes("x.com")) {
            result.needsTitleFetch = true;
          }
        }
      }
    } catch (e) {
      console.warn("Could not parse suspended URL:", tabUrl, e);
    }
  }
  return result;
}

// --- Helper to extract SLD+TLD ---
export function getSldTld(hostname) {
  if (
    !hostname ||
    !hostname.includes(".") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
  ) {
    return null;
  }
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    if (
      parts.length > 2 &&
      (parts[parts.length - 2] === "co" ||
        parts[parts.length - 2] === "com" ||
        parts[parts.length - 2] === "org" ||
        parts[parts.length - 2] === "gov" ||
        parts[parts.length - 2] === "ac")
    ) {
      return parts.slice(-3).join(".");
    }
    return parts.slice(-2).join(".");
  }
  return hostname;
}

// --- Status Message Helpers ---
export function setStatusMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "#d9534f" : "#31708f";
  const timeout = message.includes("closed") ? 7000 : 5000;
  setTimeout(() => {
    if (element.textContent === message) {
      element.textContent = "";
    }
  }, timeout);
}

// --- Debounce Helper (Optional but useful for search) ---
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
