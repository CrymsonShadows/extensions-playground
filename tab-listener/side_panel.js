// Function to fetch and display tabs
function displayTabs(page) {
  chrome.tabs.query({ currentWindow: true }, function (tabs) {
    const tabsPerPage = 20;
    const startIndex = (page - 1) * tabsPerPage;
    const endIndex = startIndex + tabsPerPage;
    const paginatedTabs = tabs.slice(startIndex, endIndex);

    const tabList = document.getElementById("tab-list");
    tabList.innerHTML = ""; // Clear previous list

    paginatedTabs.forEach(function (tab) {
      const tabItem = document.createElement("div");
      tabItem.classList.add("tab-item");

      // Create a span for the tab title
      const tabTitle = document.createElement("span");
      tabTitle.textContent = tab.title;
      tabItem.appendChild(tabTitle);

      // Create the close button
      const closeButton = document.createElement("button");
      closeButton.textContent = "X";
      closeButton.classList.add("close-button"); // Add a class for styling
      closeButton.addEventListener("click", function () {
        chrome.tabs.remove(tab.id); // Close the tab
      });
      tabItem.appendChild(closeButton);

      tabItem.addEventListener("click", function () {
        chrome.tabs.update(tab.id, { active: true });
      });
      tabList.appendChild(tabItem);
    });

    // Add pagination controls
    const pagination = document.getElementById("pagination");
    pagination.innerHTML = ""; // Clear previous controls

    const totalPages = Math.ceil(tabs.length / tabsPerPage);
    for (let i = 1; i <= totalPages; i++) {
      const pageButton = document.createElement("button");
      pageButton.textContent = i;
      pageButton.addEventListener("click", function () {
        displayTabs(i);
      });
      pagination.appendChild(pageButton);
    }
  });
}

// Initial display on load
displayTabs(1);
