import { useState, useCallback } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import photos from "./photos";

function sample3() {
  const photographers = Object.keys(photos);
  const pool = photographers.length >= 3
    ? [...photographers].sort(() => Math.random() - 0.5).slice(0, 3)
    : [0, 1, 2].map(() => photographers[Math.floor(Math.random() * photographers.length)]);

  return pool.map((photographer) => {
    const files = photos[photographer];
    const index = Math.floor(Math.random() * files.length);
    return { photographer, src: files[index] };
  });
}

export default function PhotographerPicker() {
  const [options, setOptions] = useState(() => sample3());
  const [saving, setSaving] = useState(false);

  const handlePick = useCallback(async ({ photographer, src }) => {
    setSaving(true);
    const filename = src.split("/").pop().split("?")[0];
    try {
      await addDoc(collection(db, "picks"), {
        photographer,
        filename,
        timestamp: serverTimestamp(),
      });
    } catch (e) {
      console.error("Failed to save pick:", e);
    }
    setOptions(sample3());
    setSaving(false);
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>💍 Pick Your Favourite Ms CKT</h1>
          <p style={{ color: "var(--text-dim)" }}>Tap the photo you love most</p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: 600, margin: "0 auto" }}>
          {options.map(({ photographer, src }, i) => (
            <button
              key={i}
              onClick={() => !saving && handlePick({ photographer, src })}
              disabled={saving}
              style={{
                background: "var(--bg-card)",
                border: "2px solid var(--border)",
                borderRadius: "var(--radius)",
                padding: 0,
                cursor: saving ? "not-allowed" : "pointer",
                overflow: "hidden",
                transition: "border-color 0.2s",
                display: "flex",
                flexDirection: "column",
              }}
              onMouseEnter={(e) => { if (!saving) e.currentTarget.style.borderColor = "var(--primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
            >
              <img
                src={src}
                alt={photographer}
                style={{ width: "100%", height: "auto", display: "block" }}
              />

            </button>
          ))}
        </div>

        <div style={{ textAlign: "center", marginTop: "1.5rem" }}>
          <button
            className="btn btn-secondary"
            onClick={() => !saving && setOptions(sample3())}
            disabled={saving}
          >
            Skip →
          </button>
          <p style={{ color: "var(--text-dim)", fontSize: "0.8rem", marginTop: "0.5rem" }}>
            {saving ? "Saving..." : "Or tap a photo to pick it"}
          </p>
        </div>
      </div>
    </div>
  );
}
