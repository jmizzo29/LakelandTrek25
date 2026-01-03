import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import localforage from "localforage";
import "./App.css";


// --------------------------
// Offline Queue Setup
// --------------------------
localforage.config({
  name: "lakelandTrekApp",
  storeName: "offlineQueue",
});

async function savePendingMemory(memory) {
  const queue = (await localforage.getItem("pendingMemories")) || [];
  queue.push(memory);
  await localforage.setItem("pendingMemories", queue);
}

async function loadPendingMemories() {
  return (await localforage.getItem("pendingMemories")) || [];
}

async function clearPendingMemories() {
  await localforage.setItem("pendingMemories", []);
}

// --------------------------
// Main Trek App Component
// --------------------------
export default function MainTrekApp() {
  const [memoryType, setMemoryType] = useState("photo");
  const [day, setDay] = useState("Day 1");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState([]);
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lightboxItem, setLightboxItem] = useState(null);

  // banners
  const [banner, setBanner] = useState(null);

  // --------------------------
  // Load memories from Supabase on first render
  // --------------------------
  useEffect(() => {
    const loadMemories = async () => {
      const { data, error } = await supabase
        .from("memories")
        .select("*")
        .order("created_at", { ascending: false });

      if (!error && data) setMemories(data);
    };

    loadMemories();
  }, []);

  // --------------------------
  // Detect offline mode
  // --------------------------
  const isOffline = !navigator.onLine;

  useEffect(() => {
    function handleOnline() {
      setBanner({ type: "info", msg: "Online — syncing pending memories..." });
      startSync();
    }

    function handleOffline() {
      setBanner({ type: "error", msg: "Offline — new memories will upload later." });
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // --------------------------
  // Auto-sync loop (every 10 seconds)
  // --------------------------
  useEffect(() => {
    const interval = setInterval(() => {
      if (!navigator.onLine) return;
      startSync();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  async function startSync() {
    const queue = await loadPendingMemories();
    if (queue.length === 0) return;

    setBanner({ type: "info", msg: "Uploading offline memories..." });

    for (const pending of queue) {
      await uploadMemory(pending, true);
    }

    await clearPendingMemories();
    setBanner({
      type: "success",
      msg: "All pending memories uploaded!",
    });

    // reload from supabase
    const { data } = await supabase
      .from("memories")
      .select("*")
      .order("created_at", { ascending: false });
    setMemories(data || []);
  }

  // --------------------------
  // Handle file input
  // --------------------------
  const handleFileChange = (e) => {
    setFiles(Array.from(e.target.files || []));
  };

  // --------------------------
  // Upload memory logic
  // --------------------------
  async function uploadMemory(memoryPayload, fromSync = false) {
    // 1. Upload photos to Supabase or set empty media array
    const uploadedMedia = [];

    for (const file of memoryPayload.files) {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("trip-media")
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("trip-media").getPublicUrl(fileName);

      uploadedMedia.push({
        url: publicUrl,
        name: file.name,
        path: fileName,
        type: file.type,
      });
    }

    // 2. Insert into Supabase table
    const { data, error } = await supabase
      .from("memories")
      .insert([
        {
          type: memoryPayload.memoryType,
          day: memoryPayload.day,
          title: memoryPayload.title,
          notes: memoryPayload.notes,
          media: uploadedMedia,
        },
      ])
      .select()
      .single();

    if (!error && data && !fromSync) {
      setMemories((prev) => [data, ...prev]);
    }
  }

  // --------------------------
  // Submit form
  // --------------------------
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!title.trim() && !notes.trim() && files.length === 0) {
      alert("Please enter a title, notes, or at least one photo.");
      return;
    }

    const payload = {
      memoryType,
      day,
      title: title.trim() || "(Untitled memory)",
      notes: notes.trim(),
      files,
    };

    if (isOffline) {
      await savePendingMemory(payload);
      setBanner({
        type: "error",
        msg: "Offline — memory saved locally and will upload later.",
      });

      // Reset form
      setTitle("");
      setNotes("");
      setFiles([]);

      return;
    }

    // online → upload normally
    try {
      setLoading(true);
      await uploadMemory(payload);
      setBanner({ type: "success", msg: "Memory saved!" });

      setTitle("");
      setNotes("");
      setFiles([]);
    } catch (err) {
      console.error(err);
      alert("Error saving memory.");
    } finally {
      setLoading(false);
    }
  };

  // --------------------------
  // Delete single photo
  // --------------------------
  async function deletePhoto(memoryId, photoPath) {
    try {
      await supabase.storage.from("trip-media").remove([photoPath]);

      const updatedMemories = memories.map((m) =>
        m.id === memoryId
          ? { ...m, media: m.media.filter((x) => x.path !== photoPath) }
          : m
      );

      setMemories(updatedMemories);

      await supabase
        .from("memories")
        .update({
          media: updatedMemories.find((m) => m.id === memoryId).media,
        })
        .eq("id", memoryId);
    } catch (err) {
      console.error(err);
    }
  }

  // --------------------------
  // Delete entire memory
  // --------------------------
  async function deleteMemory(memory) {
    try {
      if (memory.media?.length > 0) {
        const paths = memory.media.map((m) => m.path);
        await supabase.storage.from("trip-media").remove(paths);
      }

      await supabase.from("memories").delete().eq("id", memory.id);

      setMemories((prev) => prev.filter((m) => m.id !== memory.id));
    } catch (err) {
      console.error(err);
    }
  }

  // --------------------------
  // RENDER UI
  // --------------------------
  return (
    <div className="app-root">
      <div className="app-shell">

        {/* Offline / Sync / Success Banner */}
        {banner && (
          <div className={`banner banner--${banner.type}`}>
            {banner.msg}
          </div>
        )}

        {/* Header */}
        <header className="app-header">
          <div className="app-header-text">
            {/* LOGO + TEXT BLOCK */}
          </div>
        </header>

        {/* Text block under logo */}
<div className="header-description">
  The Lakeland Florida Stake Pioneer Trek is a powerful look into the past,
  honoring the sacred sacrifices of the 3000 early Latter-day Saint pioneers
  who walked to Salt Lake, UT from Nauvoo, IL in 1846–47 while pulling a
  handcart.
  <br /><br />
  Our youth will walk in their footsteps and gain a deeper testimony of Jesus
  Christ and what it truly means to walk with Him. Here are photos capturing
  this meaningful and unforgettable experience.
</div>

        <main className="app-main">
          {/* Form */}
          <section className="layout-grid">
            <div className="card">
              <h2 className="card-title">Add a new memory</h2>

              <form className="memory-form" onSubmit={handleSubmit}>

                <div className="form-row">
                  <div className="form-field">
                    <label>Memory type</label>
                    <div className="pill-row">
                      <button type="button" className={`pill ${memoryType==='photo'?'pill--active':''}`} onClick={()=>setMemoryType('photo')}>📷 Photos</button>
                      <button type="button" className={`pill ${memoryType==='video'?'pill--active':''}`} onClick={()=>setMemoryType('video')}>🎥 Videos</button>
                      <button type="button" className={`pill ${memoryType==='diary'?'pill--active':''}`} onClick={()=>setMemoryType('diary')}>✏️ Diary</button>
                    </div>
                  </div>

                  <div className="form-field">
                    <label>Trip Day</label>
                    <select value={day} onChange={(e)=>setDay(e.target.value)}>
                      <option>Day 1</option>
                      <option>Day 2</option>
                      <option>Day 3</option>
                      <option>Travel home</option>
                    </select>
                  </div>
                </div>

                <div className="form-field">
                  <label>Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e)=>setTitle(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Notes / Diary entry</label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e)=>setNotes(e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Upload photos</label>
                  <input type="file" multiple accept="image/*" onChange={handleFileChange} />
                  {files.length > 0 && (
                    <div className="selected-files">
                      {files.length} file{files.length > 1 ? "s" : ""} selected
                    </div>
                  )}
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-btn" disabled={loading}>
                    {loading ? "Saving..." : "Save memory"}
                  </button>
                </div>
              </form>
            </div>
          </section>

          {/* Timeline */}
          <section className="timeline">
            <div className="timeline-header">
              <h2 className="card-title">Trip timeline</h2>
            </div>

            <div className="memory-list">
              {memories.map((memory) => (
                <article key={memory.id} className="memory-card">
                  <header className="memory-card-header">
                    <div>
                      <div className="memory-meta-row">
                        <span className="memory-day">{memory.day}</span>
                        <span className="memory-type">{memory.type}</span>
                      </div>
                      <h3 className="memory-title">{memory.title}</h3>
                    </div>

                    <button
                      className="delete-memory-btn"
                      onClick={() => deleteMemory(memory)}
                    >
                      ✕
                    </button>
                  </header>

                  {memory.notes && (
                    <p className="memory-notes">{memory.notes}</p>
                  )}

                  {memory.media?.length > 0 && (
                    <div className="media-grid">
                      {memory.media.map((m, idx) => (
                        <div key={idx} className="media-wrapper">
                          <img
                            src={m.url}
                            className="media-item"
                            alt={m.name}
                            onClick={() =>
                              setLightboxItem({
                                ...m,
                                fromDay: memory.day,
                                fromTitle: memory.title,
                              })
                            }
                          />
                          <button
                            className="delete-photo-btn"
                            onClick={() => deletePhoto(memory.id, m.path)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
