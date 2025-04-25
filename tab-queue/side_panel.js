console.log("Side panel script loaded.");
const queueList = document.getElementById("queue-list");
const emptyMessageClass = "empty-message";

// --- Rendering Logic ---

function renderQueue(queue) {
  console.log(`Rendering queue: ${JSON.stringify(queue)}`);

  // Clear existing items
  queueList.innerHTML = "";

  if (!queue || queue.length === 0) {
    const li = document.createElement("li");
    li.textContent =
      'Queue is empty. Right-click links and select "Add link to Tab Queue".';
    li.classList.add(emptyMessageClass); // Add class for styling
    queueList.appendChild(li);
    return;
  }

  queue.forEach((url) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = url; // Set href for tooltip/semantics, but prevent default navigation
    link.textContent = url; // Display the URL (consider shortening long URLs)
    link.title = `Click to open: ${url}`; // Tooltip

    // Prevent default link navigation and send message to background
    link.addEventListener("click", (event) => {
      event.preventDefault(); // Don't navigate directly
      console.log(`Requesting background to open: ${url}`);
      chrome.runtime.sendMessage(
        { action: "openTab", url: url },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "Error sending openTab message:",
              chrome.runtime.lastError.message
            );
          } else {
            // Optional: Handle response from background if needed
            // console.log("Background response:", response);
          }
        }
      );
    });

    li.appendChild(link);
    queueList.appendChild(li);
  });
}

// --- Initialization and Updates ---

// Initial load
async function loadInitialQueue() {
  console.log("Loading initial queue...");
  try {
    // Use messaging to ask background for the current queue
    const response = await chrome.runtime.sendMessage({ action: "getQueue" });

    console.log(`Received initial queue: ${JSON.stringify(response)}`);

    // Check if a response was received AND it has the queue property (even if empty)
    if (response && typeof response.queue !== "undefined") {
      renderQueue(response.queue);
    } else if (chrome.runtime.lastError) {
      // Log the specific error if the runtime provides one
      console.error(
        "Error getting initial queue:",
        chrome.runtime.lastError.message
      );
      renderQueue([]); // Render empty state on error
    } else {
      // If no response and no specific runtime error, assume it's likely a timing issue on first load
      // Treat this as a normal scenario for initial load and render empty queue without a warning.
      console.log(
        "No queue data received from background (likely initial load). Assuming empty queue."
      );
      renderQueue([]); // Render empty state
    }
  } catch (error) {
    console.error("Error requesting initial queue:", error);
    renderQueue([]); // Render empty state on error
  }
}

// Listen for changes in storage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.tabQueue) {
    console.log("Queue changed in storage, updating side panel.");
    renderQueue(changes.tabQueue.newValue || []);
  }
});

// Keep service worker alive while panel is open
// Note: Ensure the port name matches the one used in background.js
const port = chrome.runtime.connect({ name: "sidePanel" });
port.onDisconnect.addListener(() => {
  console.log("Port disconnected from side panel side.");
  // Handle potential cleanup if needed
});

// Load the queue when the script runs
loadInitialQueue();
