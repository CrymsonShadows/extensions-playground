// db.js
import {
  DB_NAME,
  DB_VERSION,
  STORE_NAME,
  URL_INDEX,
  DATE_INDEX, // Represents dateCreated
  CONSUMED_INDEX,
  TITLE_INDEX,
  STASH_COUNT_INDEX,
  TAGS_INDEX,
  FAVORITE_INDEX,
  DATE_UPDATED_INDEX, // New index
} from "./constants.js";

// --- IndexedDB Helper Functions ---
export function openDB() {
  return new Promise((resolve, reject) => {
    console.log(`Opening database ${DB_NAME} version ${DB_VERSION}`);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (event) => reject("IndexedDB error: " + request.error);
    request.onsuccess = (event) => resolve(event.target.result);

    request.onupgradeneeded = (event) => {
      console.log(
        "DB Upgrade: Old version:",
        event.oldVersion,
        "New version:",
        event.newVersion
      );
      const db = event.target.result;
      const transaction = event.target.transaction; // Get transaction from event
      let store;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        console.log("DB Upgrade: Creating object store:", STORE_NAME);
        store = db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      } else {
        store = transaction.objectStore(STORE_NAME);
        console.log("DB Upgrade: Object store already exists.");
      }

      // --- Ensure all indexes exist (idempotent checks) ---
      if (!store.indexNames.contains(URL_INDEX)) {
        console.log("DB Upgrade: Creating URL index:", URL_INDEX);
        store.createIndex(URL_INDEX, "url", { unique: true });
      }
      if (!store.indexNames.contains(DATE_INDEX)) {
        // dateCreated
        console.log("DB Upgrade: Creating Date Created index:", DATE_INDEX);
        store.createIndex(DATE_INDEX, "dateCreated", { unique: false });
      }
      if (!store.indexNames.contains(DATE_UPDATED_INDEX)) {
        // dateUpdated
        console.log(
          "DB Upgrade: Creating Date Updated index:",
          DATE_UPDATED_INDEX
        );
        store.createIndex(DATE_UPDATED_INDEX, "dateUpdated", { unique: false });
      }
      if (!store.indexNames.contains(CONSUMED_INDEX)) {
        console.log("DB Upgrade: Creating Consumed index:", CONSUMED_INDEX);
        store.createIndex(CONSUMED_INDEX, "consumed", { unique: false });
      }
      if (!store.indexNames.contains(TITLE_INDEX)) {
        console.log("DB Upgrade: Creating Title index:", TITLE_INDEX);
        store.createIndex(TITLE_INDEX, "title", { unique: false });
      }
      if (!store.indexNames.contains(STASH_COUNT_INDEX)) {
        console.log(
          "DB Upgrade: Creating Stash Count index:",
          STASH_COUNT_INDEX
        );
        store.createIndex(STASH_COUNT_INDEX, "stashCount", { unique: false });
      }
      if (!store.indexNames.contains(TAGS_INDEX)) {
        console.log("DB Upgrade: Creating Tags index:", TAGS_INDEX);
        store.createIndex(TAGS_INDEX, "tags", {
          multiEntry: true,
          unique: false,
        });
      }
      if (!store.indexNames.contains(FAVORITE_INDEX)) {
        console.log("DB Upgrade: Creating Favorite index:", FAVORITE_INDEX);
        store.createIndex(FAVORITE_INDEX, "favorite", { unique: false });
      }

      // --- Specific Version Upgrade Logic ---

      if (event.oldVersion < 3 && !store.indexNames.contains(URL_INDEX)) {
        // This was the version where URL_INDEX was made unique.
        // The idempotent check above should handle creation.
        // If it existed and wasn't unique, manual migration for duplicates would be complex.
        console.log(
          "DB Upgrade: (v2->v3) URL index uniqueness handled by idempotent check."
        );
      }

      if (event.oldVersion < 4) {
        console.log(
          "DB Upgrade: Running logic for v3 -> v4 (Adding Tags property)"
        );
        if (event.oldVersion > 0) {
          // Only run cursor if store existed before
          console.log(
            "DB Upgrade: Adding 'tags' property to existing items if missing..."
          );
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const value = cursor.value;
              if (value.tags === undefined) {
                value.tags = [];
                cursor.update(value);
              }
              cursor.continue();
            } else {
              console.log(
                "DB Upgrade: 'tags' property migration complete for v3->v4."
              );
            }
          };
          cursorRequest.onerror = (e) => {
            console.error(
              "DB Upgrade: Error migrating 'tags' property (v3->v4):",
              e.target.error
            );
            transaction.abort();
            reject("Migration failed: Cannot update items for tags (v3->v4).");
          };
        }
      }

      if (event.oldVersion < 5) {
        console.log(
          "DB Upgrade: Running logic for v4 -> v5 (Adding Favorite property)"
        );
        if (event.oldVersion > 0) {
          console.log(
            "DB Upgrade: Adding 'favorite' property to existing items if missing..."
          );
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const value = cursor.value;
              if (value.favorite === undefined) {
                value.favorite = false; // Default to false
                cursor.update(value);
              }
              cursor.continue();
            } else {
              console.log(
                "DB Upgrade: 'favorite' property migration complete for v4->v5."
              );
            }
          };
          cursorRequest.onerror = (e) => {
            console.error(
              "DB Upgrade: Error migrating 'favorite' property (v4->v5):",
              e.target.error
            );
            transaction.abort();
            reject(
              "Migration failed: Cannot update items for favorite (v4->v5)."
            );
          };
        }
      }

      // *** NEW: Upgrade for DB_VERSION 6 (dateUpdated field) ***
      if (event.oldVersion < 6) {
        console.log(
          "DB Upgrade: Running logic for v5 -> v6 (Adding dateUpdated field and index)"
        );
        // The index itself is created by the idempotent check above.
        // Now, populate dateUpdated for existing items.
        if (event.oldVersion > 0) {
          // Only run if store actually existed
          console.log(
            "DB Upgrade: Populating 'dateUpdated' for existing items (from 'dateCreated')..."
          );
          const cursorRequest = store.openCursor();
          cursorRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const value = cursor.value;
              if (value.dateUpdated === undefined) {
                // Set dateUpdated to the existing dateCreated value
                value.dateUpdated = value.dateCreated;
                cursor.update(value);
              }
              cursor.continue();
            } else {
              console.log(
                "DB Upgrade: 'dateUpdated' field population complete for v5->v6."
              );
            }
          };
          cursorRequest.onerror = (e) => {
            console.error(
              "DB Upgrade: Error populating 'dateUpdated' field (v5->v6):",
              e.target.error
            );
            transaction.abort();
            reject("Migration failed: Cannot populate dateUpdated (v5->v6).");
          };
        }
      }

      console.log(
        "DB Upgrade: Database upgrade process finished in onupgradeneeded."
      );
    }; // end onupgradeneeded
  }); // end promise
}

/**
 * Adds a new item or updates an existing item (based on URL) in the stash.
 * - For new items: sets dateCreated and dateUpdated.
 * - For existing items: updates dateUpdated, preserves original dateCreated.
 * Handles merging tags and incrementing stash count on update.
 * Overwrites favorite and consumed status on update based on itemData.
 * @param {object} itemData - The item data to stash/update.
 * @returns {Promise<object>} Promise resolving with { action: 'added'/'updated', id: number, count: number }
 */
export async function stashOrUpdateItemDB(itemData) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(URL_INDEX);
    const getRequest = index.get(itemData.url);

    getRequest.onerror = (event) => {
      console.error("DB: Error querying stash:", getRequest.error);
      reject("Error querying stash: " + getRequest.error);
    };

    getRequest.onsuccess = (event) => {
      const existingItem = event.target.result;
      let request;
      const newTags = Array.isArray(itemData.tags) ? itemData.tags : [];
      const currentTime = new Date().toISOString();

      if (existingItem) {
        // --- UPDATE EXISTING ITEM ---
        console.log(
          `DB: Found existing item for URL: ${itemData.url}. Updating ID: ${existingItem.id}`
        );

        existingItem.title = itemData.title ?? existingItem.title;
        existingItem.favorite =
          typeof itemData.favorite === "boolean"
            ? itemData.favorite
            : existingItem.favorite;
        existingItem.consumed =
          typeof itemData.consumed === "boolean"
            ? itemData.consumed
            : existingItem.consumed;

        if (existingItem.consumed) {
          existingItem.dateConsumed =
            itemData.dateConsumed && !isNaN(new Date(itemData.dateConsumed))
              ? new Date(itemData.dateConsumed).toISOString()
              : currentTime;
        } else {
          delete existingItem.dateConsumed;
        }

        existingItem.stashCount = (existingItem.stashCount || 0) + 1;

        const currentTags = Array.isArray(existingItem.tags)
          ? existingItem.tags
          : [];
        const combinedTags = new Set([...currentTags, ...newTags]);
        existingItem.tags = Array.from(combinedTags);

        // *** Preserve original dateCreated, update dateUpdated ***
        // existingItem.dateCreated remains unchanged.
        existingItem.dateUpdated = currentTime;
        console.log(
          "DB Update: Updated dateUpdated to:",
          existingItem.dateUpdated,
          "Original dateCreated:",
          existingItem.dateCreated
        );

        request = store.put(existingItem);
        request.onsuccess = (event) => {
          console.log(`DB: Successfully updated item ID: ${existingItem.id}`);
          resolve({
            action: "updated",
            id: existingItem.id,
            count: existingItem.stashCount,
          });
        };
        request.onerror = (event) => {
          console.error(
            `DB: Error updating item ID ${existingItem.id}:`,
            request.error
          );
          reject("Error updating item: " + request.error);
        };
      } else {
        // --- ADD NEW ITEM ---
        console.log(
          `DB: No existing item found for URL: ${itemData.url}. Adding new.`
        );

        const newItem = {
          title: itemData.title,
          url: itemData.url,
          tags: newTags,
          // *** Set both dateCreated and dateUpdated ***
          dateCreated:
            itemData.dateCreated && !isNaN(new Date(itemData.dateCreated))
              ? new Date(itemData.dateCreated).toISOString()
              : currentTime,
          dateUpdated:
            itemData.dateUpdated && !isNaN(new Date(itemData.dateUpdated))
              ? new Date(itemData.dateUpdated).toISOString()
              : itemData.dateCreated && !isNaN(new Date(itemData.dateCreated))
              ? new Date(itemData.dateCreated).toISOString()
              : currentTime, // Default dateUpdated to dateCreated or current time
          consumed:
            typeof itemData.consumed === "boolean" ? itemData.consumed : false,
          favorite:
            typeof itemData.favorite === "boolean" ? itemData.favorite : false,
          stashCount:
            typeof itemData.stashCount === "number" && itemData.stashCount > 0
              ? itemData.stashCount
              : 1,
        };
        if (newItem.consumed) {
          newItem.dateConsumed =
            itemData.dateConsumed && !isNaN(new Date(itemData.dateConsumed))
              ? new Date(itemData.dateConsumed).toISOString()
              : currentTime;
        }
        console.log("DB Add: Prepared new item:", newItem);

        request = store.add(newItem);
        request.onsuccess = (event) => {
          const newId = event.target.result;
          console.log(`DB: Successfully added new item with ID: ${newId}`);
          resolve({ action: "added", id: newId, count: newItem.stashCount });
        };
        request.onerror = (event) => {
          console.error(
            `DB: Error adding item for URL ${itemData.url}:`,
            request.error
          );
          if (request.error.name === "ConstraintError") {
            console.warn(
              `DB: ConstraintError adding item for URL ${itemData.url}. Retrying as update.`
            );
            transaction.abort();
            db.close();
            setTimeout(() => {
              stashOrUpdateItemDB(itemData).then(resolve).catch(reject);
            }, 50);
          } else {
            reject("Error adding item: " + request.error);
          }
        };
      }
    };

    transaction.oncomplete = () => {
      console.log("DB: Stash transaction completed.");
      db.close();
    };
    transaction.onerror = (event) => {
      console.error("DB: Stash transaction error:", transaction.error);
      db.close();
    };
    transaction.onabort = () => {
      console.warn("DB: Stash transaction aborted.");
      db.close();
    };
  });
}

// updateStashItemFavoriteDB remains the same
export async function updateStashItemFavoriteDB(itemId, isFavorite) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(itemId);

    request.onerror = (event) => {
      console.error(
        `DB: Error getting item ${itemId} to update favorite:`,
        request.error
      );
      reject("Error getting item to update favorite: " + request.error);
    };

    request.onsuccess = (event) => {
      const item = event.target.result;
      if (!item) {
        console.warn(
          `DB: Item with ID ${itemId} not found for favorite update.`
        );
        resolve(0);
        return;
      }

      if (item.favorite === !!isFavorite) {
        console.log(
          `DB: Favorite status for item ${itemId} is already ${isFavorite}. No update needed.`
        );
        resolve(0);
        return;
      }
      item.favorite = !!isFavorite;

      const putRequest = store.put(item);
      putRequest.onsuccess = () => {
        console.log(
          `DB: Updated favorite status for item ${itemId} to ${item.favorite}`
        );
        resolve(1);
      };
      putRequest.onerror = (err) => {
        console.error(
          `DB: Error updating favorite status for item ${itemId}:`,
          putRequest.error
        );
        reject("Error updating favorite status: " + putRequest.error);
      };
    };

    transaction.oncomplete = () => db.close();
    transaction.onerror = (event) => {
      console.error(
        "DB: Transaction error updating favorite:",
        transaction.error
      );
      db.close();
    };
  });
}

// getAllStashItemsDB remains the same
export async function getAllStashItemsDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = (event) => {
      console.log(
        `DB: Fetched ${event.target.result?.length ?? 0} items from stash.`
      );
      resolve(event.target.result || []);
    };
    request.onerror = (event) => {
      console.error("DB: Error getting all items:", request.error);
      reject("Error getting all items: " + request.error);
    };
    transaction.oncomplete = () => db.close();
  });
}

// updateStashItemConsumedDB remains the same
export async function updateStashItemConsumedDB(urlToMark, consumedStatus) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index(URL_INDEX);
    const request = index.get(urlToMark);

    request.onerror = (event) => {
      console.error(
        `DB: Error querying stash for URL ${urlToMark} to update consumed:`,
        request.error
      );
      reject("Error querying stash: " + request.error);
    };

    request.onsuccess = (event) => {
      const item = event.target.result;
      if (!item) {
        console.log(
          `DB: Item with URL ${urlToMark} not found for consumed update.`
        );
        resolve(0);
        return;
      }
      if (item.consumed === consumedStatus) {
        console.log(
          `DB: Consumed status for URL ${urlToMark} is already ${consumedStatus}. No update needed.`
        );
        resolve(0);
        return;
      }
      item.consumed = consumedStatus;
      if (consumedStatus) {
        item.dateConsumed = new Date().toISOString();
      } else {
        delete item.dateConsumed;
      }
      const putRequest = store.put(item);
      putRequest.onsuccess = () => {
        console.log(
          `DB: Updated consumed status for item ${item.id} (URL: ${urlToMark}) to ${consumedStatus}`
        );
        resolve(1);
      };
      putRequest.onerror = (err) => {
        console.error(
          `DB: Error updating consumed status for item ${item.id}:`,
          putRequest.error
        );
        reject("Error updating item: " + putRequest.error);
      };
    };
    transaction.oncomplete = () => db.close();
    transaction.onerror = (event) => {
      console.error(
        "DB: Transaction error updating consumed status:",
        transaction.error
      );
      db.close();
    };
  });
}

// getAllStashUrlsDB remains the same
export async function getAllStashUrlsDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onerror = (event) => {
      console.error("DB: Error fetching all stash URLs:", request.error);
      reject("Error fetching all stash URLs: " + request.error);
    };
    request.onsuccess = (event) => {
      const items = event.target.result || [];
      const urls = items.map((item) => item.url);
      console.log(`DB: Fetched ${urls.length} URLs for highlighting.`);
      resolve(urls);
    };
    transaction.oncomplete = () => db.close();
  });
}

// deleteStashItemDB remains the same
export async function deleteStashItemDB(itemId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(itemId);

    request.onerror = (event) => {
      console.error(`DB: Error deleting stash item ${itemId}:`, request.error);
      reject("Error deleting stash item: " + request.error);
    };
    request.onsuccess = (event) => {
      console.log(`DB: Successfully deleted stash item ${itemId}`);
      resolve();
    };
    transaction.oncomplete = () => db.close();
    transaction.onerror = (event) => {
      console.error("DB: Transaction error deleting item:", transaction.error);
      db.close();
    };
  });
}
