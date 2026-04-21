import React, { useState } from "react";
import { useApp } from "../context/AppContext";
import { CURRENCIES } from "../utils/currencies";

export default function CreateTrip() {
  const { dispatch } = useApp();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [memberInput, setMemberInput] = useState("");
  const [members, setMembers] = useState([]);

  const addMember = () => {
    const trimmed = memberInput.trim();
    if (trimmed && !members.includes(trimmed)) {
      setMembers([...members, trimmed]);
      setMemberInput("");
    }
  };

  const removeMember = (name) => {
    setMembers(members.filter((m) => m !== name));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMember();
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim() || members.length < 2) return;
    dispatch({
      type: "CREATE_TRIP",
      payload: { name: name.trim(), description: description.trim(), defaultCurrency, members },
    });
  };

  return (
    <div className="create-trip">
      <button
        className="btn btn-back"
        onClick={() => dispatch({ type: "NAVIGATE", payload: { view: "tripList" } })}
      >
        &larr; Back
      </button>
      <h1>Create New Trip</h1>

      <form onSubmit={handleSubmit} className="form">
        <div className="form-group">
          <label>Trip Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Summer Vacation 2026"
            required
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="form-group">
          <label>Default Currency</label>
          <select value={defaultCurrency} onChange={(e) => setDefaultCurrency(e.target.value)}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} ({c.symbol}) - {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Members * (at least 2)</label>
          <div className="member-input-row">
            <input
              type="text"
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter member name"
            />
            <button type="button" className="btn btn-secondary" onClick={addMember}>
              Add
            </button>
          </div>
          <div className="member-tags">
            {members.map((m) => (
              <span key={m} className="member-tag">
                {m}
                <button type="button" onClick={() => removeMember(m)}>
                  &times;
                </button>
              </span>
            ))}
          </div>
          {members.length > 0 && members.length < 2 && (
            <p className="hint">Add at least one more member</p>
          )}
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-lg"
          disabled={!name.trim() || members.length < 2}
        >
          Create Trip
        </button>
      </form>
    </div>
  );
}
