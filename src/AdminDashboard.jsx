import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./App.css"; // keep Trek styles but admin overrides below

export default function AdminDashboard() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("memories")
        .select("*")
        .order("created_at", { ascending: false });

      setMemories(data || []);
      setLoading(false);
    };

    load();
  }, []);

  if (loading) {
    return (
      <div className="admin-container">
        <p>Loading admin dashboard...</p>
      </div>
    );
  }

  return (
    <div className="admin-container">
      <h1>Admin Dashboard</h1>
      <p>Total memories: {memories.length}</p>
      <hr />

      {memories.map((m) => (
        <div key={m.id} className="admin-card">
          <h3>{m.title}</h3>
          <p><strong>Day:</strong> {m.day}</p>
          <p><strong>Type:</strong> {m.type}</p>
          <p><strong>Notes:</strong> {m.notes}</p>

          {m.media?.length > 0 && (
            <div className="admin-media-row">
              {m.media.map((media, idx) => (
                <img
                  key={idx}
                  src={media.url}
                  alt=""
                  className="admin-thumb"
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
