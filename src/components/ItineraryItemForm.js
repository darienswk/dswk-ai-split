import React, { useEffect, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { deleteObject, getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { storage } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  ATTACHMENT_ACCEPT,
  ITEM_TYPES,
  MAX_ATTACHMENT_SIZE,
  attachmentStoragePath,
  formatDate,
  isImageAttachment,
} from "../utils/itinerary";

// `item` is set when editing an existing stop; otherwise the form adds a new one to `dayId`.
// `itineraryId` and `stopId` scope where attachments are uploaded in Storage - `stopId` is the
// id the new stop will be saved with, assigned by the caller before the form opens so uploads
// have somewhere stable to live even before the stop itself is saved.
export default function ItineraryItemForm({ days, dayId, item, itineraryId, stopId, onSave, onClose }) {
  const { user } = useAuth();
  const isEditing = !!item;
  const [title, setTitle] = useState(item?.title || "");
  const [type, setType] = useState(item?.type || "sight");
  const [time, setTime] = useState(item?.time || "");
  const [location, setLocation] = useState(item?.location || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [selectedDay, setSelectedDay] = useState(dayId);
  const [attachments, setAttachments] = useState(item?.attachments || []);
  const [uploads, setUploads] = useState({}); // { [tempId]: { name, progress } }

  // Attachments already on the item when the form opened - anything else added this session is
  // an "orphan" (uploaded but never saved) if the form is closed without saving, and gets deleted.
  const keptAttachmentIds = useRef(new Set((item?.attachments || []).map((a) => a.id)));
  const savedRef = useRef(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && handleClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploading = Object.keys(uploads).length > 0;

  const uploadFile = (file) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      window.alert(`"${file.name}" is larger than 10MB and wasn't uploaded.`);
      return;
    }
    const attachmentId = uuidv4();
    const path = attachmentStoragePath(user.uid, itineraryId, stopId, attachmentId, file.name);
    const task = uploadBytesResumable(ref(storage, path), file, {
      contentType: file.type || "application/octet-stream",
    });

    setUploads((u) => ({ ...u, [attachmentId]: { name: file.name, progress: 0 } }));
    task.on(
      "state_changed",
      (snapshot) => {
        const progress = snapshot.totalBytes ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
        setUploads((u) => (u[attachmentId] ? { ...u, [attachmentId]: { name: file.name, progress } } : u));
      },
      (error) => {
        console.error("Failed to upload attachment:", error);
        window.alert(`Failed to upload "${file.name}".`);
        setUploads((u) => {
          const next = { ...u };
          delete next[attachmentId];
          return next;
        });
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setAttachments((list) => [
          ...list,
          {
            id: attachmentId,
            name: file.name,
            path,
            url,
            contentType: file.type || "application/octet-stream",
            size: file.size,
            uploadedAt: new Date().toISOString(),
          },
        ]);
        setUploads((u) => {
          const next = { ...u };
          delete next[attachmentId];
          return next;
        });
      }
    );
  };

  const handleFilePick = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow picking the same file again later
    files.forEach(uploadFile);
  };

  const handleRemoveAttachment = (attachment) => {
    setAttachments((list) => list.filter((a) => a.id !== attachment.id));
    deleteObject(ref(storage, attachment.path)).catch((err) =>
      console.error("Failed to delete attachment from Storage:", err)
    );
  };

  // Deletes any files uploaded during this form session that never made it into a saved stop.
  const handleClose = () => {
    if (!savedRef.current) {
      attachments
        .filter((a) => !keptAttachmentIds.current.has(a.id))
        .forEach((a) => deleteObject(ref(storage, a.path)).catch((err) => console.error("Failed to clean up attachment:", err)));
    }
    onClose();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim() || uploading) return;
    savedRef.current = true;
    onSave(
      {
        dayId: selectedDay,
        title: title.trim(),
        type,
        time,
        location: location.trim(),
        notes: notes.trim(),
        attachments,
      },
      item
    );
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? "Edit Stop" : "Add Stop"}</h2>
          <button className="btn btn-close" onClick={handleClose}>
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="form">
          <div className="form-group">
            <label>Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Visit Edinburgh Castle"
              autoFocus
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group itin-date-field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {ITEM_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.icon} {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group itin-date-field">
              <label>Time</label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className="form-group">
            <label>Day</label>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              {days.map((d, i) => (
                <option key={d.id} value={d.id}>
                  Day {i + 1} &ndash; {formatDate(d.id)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Place or address (links to Google Maps)"
            />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Booking ref, opening hours, tips..."
            />
          </div>

          <div className="form-group">
            <label>Attachments</label>
            {(attachments.length > 0 || uploading) && (
              <div className="itin-attachments">
                {attachments.map((a) => (
                  <div key={a.id} className="itin-attachment-chip">
                    <a href={a.url} target="_blank" rel="noopener noreferrer" title={a.name}>
                      <span aria-hidden="true">{isImageAttachment(a) ? "🖼️" : "📎"}</span>
                      <span className="itin-attachment-name">{a.name}</span>
                    </a>
                    <button type="button" onClick={() => handleRemoveAttachment(a)} aria-label={`Remove ${a.name}`}>
                      &times;
                    </button>
                  </div>
                ))}
                {Object.entries(uploads).map(([id, u]) => (
                  <div key={id} className="itin-attachment-chip is-uploading">
                    <span className="itin-attachment-name">{u.name}</span>
                    <div className="itin-upload-bar">
                      <div style={{ width: `${Math.round(u.progress * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <label className="btn btn-sm btn-secondary itin-attach-btn">
              + Add file
              <input type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={handleFilePick} hidden />
            </label>
            <p className="hint">Images or PDFs, up to 10MB each.</p>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={!title.trim() || uploading}>
            {uploading ? "Uploading…" : isEditing ? "Save Changes" : "Add Stop"}
          </button>
        </form>
      </div>
    </div>
  );
}
