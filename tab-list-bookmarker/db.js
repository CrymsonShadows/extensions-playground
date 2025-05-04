// db.js
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  URL_INDEX,
  DATE_INDEX,
  CONSUMED_INDEX,
  TITLE_INDEX,
  STASH_COUNT_INDEX,
} from "./constants.js";

// --- IndexedDB Helper Functions ---
export function openDB() {
  return new Promise((resolve, reject) => {
    console.log(`Opening database ${DB_NAME} version ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => reject("IndexedDB error: " + request.error);
    request.onsuccess = (event) => resolve(event.target.result);

    // This event handles database creation and version upgrades.
    request.onupgradeneeded = (event) => {
      console.log(
        "Database upgrade needed. Old version:",
        event.oldVersion,
        "New version:",
        event.newVersion
      );
      const db = event.target.result;
      const transaction = event.target.transaction; // Use the upgrade transaction
      let store;

      // Create store if it doesn't exist (for initial creation)
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log("Creating object store:", STORE_NAME);
        store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      } else {
        store = transaction.objectStore(STORE_NAME); // Get existing store
        console.log("Object store already exists.");
      }

      // --- Handle URL Index Uniqueness (Upgrade from v2 to v3) ---
      if (event.oldVersion < 3) {
        console.log("Upgrading to v3: Enforcing unique URL index.");

        // *** Robust Migration Steps ***

        // 1. Read all existing data (within the upgrade transaction)
        const getAllRequest = store.getAll();

        getAllRequest.onerror = (e) => {
          console.error(
            "Migration Error: Failed to read existing data.",
            e.target.error
          );
          // Abort the transaction if we can't read data
          transaction.abort();
          reject("Migration failed: Cannot read data.");
        };

        getAllRequest.onsuccess = (e) => {
          const allItems = e.target.result;
          console.log(
            `Migration: Read ${allItems.length} items for processing.`
          );

          // 2. Process data in memory to find unique items by URL
          const uniqueItemsMap = new Map();
          allItems.forEach((item) => {
            if (!uniqueItemsMap.has(item.url)) {
              // Keep the first encountered item for each URL
              // Also ensure stashCount exists (for data from before v2)
              item.stashCount = item.stashCount || 1;
              uniqueItemsMap.set(item.url, item);
            } else {
              console.log(
                `Migration: Found duplicate URL (${item.url}), discarding item ID: ${item.id}`
              );
              // Optional: Could merge data here, e.g., sum stash counts, keep latest date?
              // For simplicity, we just keep the first one encountered.
            }
          });
          const itemsToKeep = Array.from(uniqueItemsMap.values());
          console.log(
            `Migration: ${itemsToKeep.length} unique items identified.`
          );

          // 3. Clear the existing store (still within the upgrade transaction)
          const clearRequest = store.clear();
          clearRequest.onerror = (e_clear) => {
            console.error(
              "Migration Error: Failed to clear object store.",
              e_clear.target.error
            );
            transaction.abort();
            reject("Migration failed: Cannot clear store.");
          };

          clearRequest.onsuccess = (e_clear) => {
            console.log("Migration: Object store cleared successfully.");

            // 4. Re-populate the store with unique items
            console.log("Migration: Repopulating store with unique items...");
            let itemsAdded = 0;
            itemsToKeep.forEach((item) => {
              // Important: Remove the 'id' if it exists, as the store is autoIncrementing
              // If your keyPath wasn't autoIncrement, you'd handle this differently.
              delete item.id;
              const addRequest = store.add(item);
              addRequest.onsuccess = () => {
                itemsAdded++;
                if (itemsAdded === itemsToKeep.length) {
                  console.log("Migration: Store repopulated successfully.");
                  // 5. NOW delete old index and create new UNIQUE index
                  try {
                    if (store.indexNames.contains(URL_INDEX)) {
                      console.log("Migration: Deleting old URL index.");
                      store.deleteIndex(URL_INDEX);
                    }
                    console.log("Migration: Creating unique URL index.");
                    store.createIndex(URL_INDEX, "url", { unique: true });
                    console.log("Migration: Unique URL index created.");
                    // Resolve or continue with other upgrades if needed inside onsuccess
                  } catch (indexError) {
                    console.error(
                      "Migration Error: Failed to update URL index.",
                      indexError
                    );
                    transaction.abort(); // Abort on index error
                    reject("Migration failed: Index creation error.");
                  }
                }
              };
              addRequest.onerror = (e_add) => {
                console.error(
                  "Migration Error: Failed to add unique item back.",
                  item,
                  e_add.target.error
                );
                // Abort on any add error during repopulation
                transaction.abort();
                reject("Migration failed: Repopulation error.");
              };
            });
            // Handle case where there were no items to keep
            if (itemsToKeep.length === 0) {
              console.log("Migration: No unique items to repopulate.");
              // Still need to create the unique index
              try {
                if (store.indexNames.contains(URL_INDEX))
                  store.deleteIndex(URL_INDEX);
                store.createIndex(URL_INDEX, "url", { unique: true });
                console.log(
                  "Migration: Unique URL index created (empty store)."
                );
              } catch (indexError) {
                console.error(
                  "Migration Error: Failed to update URL index (empty store).",
                  indexError
                );
                transaction.abort();
                reject("Migration failed: Index creation error.");
              }
            }
          }; // End clearRequest.onsuccess
        }; // End getAllRequest.onsuccess
      } // End of v3 upgrade block

      // Create other indexes if they don't exist (idempotent checks)
      // These should run AFTER the migration logic for v3 is complete or if v3 already exists
      if (!store.indexNames.contains(DATE_INDEX)) {
        store.createIndex(DATE_INDEX, "dateCreated", { unique: false });
      }
      if (!store.indexNames.contains(CONSUMED_INDEX)) {
        store.createIndex(CONSUMED_INDEX, "consumed", { unique: false });
      }
      if (!store.indexNames.contains(TITLE_INDEX)) {
        store.createIndex(TITLE_INDEX, "title", { unique: false });
      }
      if (!store.indexNames.contains(STASH_COUNT_INDEX)) {
        store.createIndex(STASH_COUNT_INDEX, "stashCount", { unique: false });
      }

      console.log("Database upgrade process finished in onupgradeneeded.");
    }; // End onupgradeneeded
  });
} // End openDB

// Stash or Update: Logic remains mostly the same, but relies on unique index now
export async function stashOrUpdateItemDB(itemData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(URL_INDEX); // Use the (now unique) URL index
    const getRequest = index.get(itemData.url); // Use get() for unique index

    getRequest.onerror = (event) =>
      reject("Error querying stash: " + getRequest.error);

    getRequest.onsuccess = (event) => {
      const existingItem = event.target.result; // Will be undefined or the single item
      let request;

      if (existingItem) {
        // --- Update existing item ---
        console.log(`Found existing item for URL: ${itemData.url}. Updating.`);
        existingItem.title = itemData.title;
        existingItem.dateCreated = new Date().toISOString();
        existingItem.stashCount = (existingItem.stashCount || 0) + 1;
        existingItem.consumed = false;
        delete existingItem.dateConsumed;
        request = store.put(existingItem); // Use put to update
        request.onsuccess = (event) =>
          resolve({
            action: "updated",
            id: existingItem.id,
            count: existingItem.stashCount,
          });
        request.onerror = (event) => {
          console.error("Error updating item:", request.error);
          // Check for ConstraintError specifically if needed
          if (request.error.name === "ConstraintError") {
            console.error(
              "ConstraintError during update - this shouldn't happen if get() worked."
            );
          }
          reject("Error updating item: " + request.error);
        };
      } else {
        // --- Add new item ---
        console.log(
          `No existing item found for URL: ${itemData.url}. Adding new.`
        );
        const newItem = {
          ...itemData,
          dateCreated: new Date().toISOString(),
          consumed: false,
          stashCount: 1,
        };
        request = store.add(newItem);
        request.onsuccess = (event) =>
          resolve({ action: "added", id: event.target.result, count: 1 });
        request.onerror = (event) => {
          console.error("Error adding item:", request.error);
          // Handle ConstraintError specifically - means item was added between check and add
          if (request.error.name === "ConstraintError") {
            console.warn(
              `ConstraintError adding item for URL ${itemData.url}. Likely added concurrently. Attempting update instead.`
            );
            // Retry as an update (could lead to infinite loop if not careful, but okay here)
            // Alternatively, just inform the user the item already exists.
            transaction.abort(); // Abort current transaction
            db.close();
            // Retry the whole operation - this might be simpler
            stashOrUpdateItemDB(itemData).then(resolve).catch(reject);
          } else {
            reject("Error adding item: " + request.error);
          }
        };
      }
    };

    transaction.oncomplete = () => db.close();
    transaction.onerror = (event) => {
      console.error("Transaction error:", transaction.error);
      // Don't reject here if specific request errors are handled
      // reject("Transaction error: " + transaction.error);
    };
  });
}

// Other DB functions remain the same
export async function getAllStashItemsDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) =>
      reject("Error getting all items: " + request.error);
    transaction.oncomplete = () => db.close();
  });
}
export async function updateStashItemConsumedDB(urlToMark, consumedStatus) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(URL_INDEX);
    const request = index.get(urlToMark);
    /* Use get for unique index */ request.onerror = (event) =>
      reject("Error querying stash: " + request.error);
    request.onsuccess = (event) => {
      const item = event.target.result;
      if (!item) {
        resolve(0);
        return;
      }
      if (item.consumed === consumedStatus) {
        resolve(0);
        return;
      }
      /* Only update if status differs */ item.consumed = consumedStatus;
      if (consumedStatus) {
        item.dateConsumed = new Date().toISOString();
      } else {
        delete item.dateConsumed;
      }
      const putRequest = store.put(item);
      putRequest.onsuccess = () => {
        resolve(1); /* Only ever updates 1 item now */
      };
      putRequest.onerror = (err) => {
        console.error("Error updating item:", item.id, putRequest.error);
        reject("Error updating item: " + putRequest.error);
      };
    };
    transaction.oncomplete = () => db.close();
  });
}

// Add this function to db.js
export async function getAllStashUrlsDB() {
  const db = await openDB(); // Use your existing openDB function
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    // No index needed if just iterating, but could use URL index if preferred
    const request = store.getAll(); // Get all items

    request.onerror = (event) =>
      reject("Error fetching all stash URLs: " + request.error);
    request.onsuccess = (event) => {
      const items = event.target.result;
      // Extract only the URLs
      const urls = items.map((item) => item.url);
      resolve(urls);
    };
    transaction.oncomplete = () => db.close();
  });
}

// Add this function to db.js
export async function deleteStashItemDB(itemId) {
  const db = await openDB(); // Use your existing openDB function
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(itemId); // Use the item's primary key (ID)

    request.onerror = (event) =>
      reject("Error deleting stash item: " + request.error);
    request.onsuccess = (event) => {
      // event.target.result will be undefined for delete operations
      resolve(); // Resolve indicating success
    };
    transaction.oncomplete = () => db.close();
    transaction.onerror = (event) =>
      reject("Transaction error deleting item: " + transaction.error);
  });
}
