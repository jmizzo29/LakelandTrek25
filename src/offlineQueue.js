import localforage from "localforage";

localforage.config({
  name: "LakelandTrekApp",
  storeName: "offlineMemories",
});

// Save a memory (with photos) to the offline queue
export async function queueMemory(memory) {
  const list = (await localforage.getItem("pendingMemories")) || [];
  list.push(memory);
  await localforage.setItem("pendingMemories", list);
}

// Load all pending memories
export async function getQueuedMemories() {
  return (await localforage.getItem("pendingMemories")) || [];
}

// Clear memory queue after successful sync
export async function clearQueuedMemories() {
  await localforage.setItem("pendingMemories", []);
}
