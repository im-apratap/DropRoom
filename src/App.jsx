import { useState, useEffect, useRef } from "react";
import { customAlphabet } from "nanoid";
import { supabase } from "./supabaseClient";
import {
  Clipboard as ClipIcon,
  Copy,
  FileInput,
  Save,
  Loader2,
  Check,
  Plus,
  Paperclip,
  X,
  Download,
  Moon,
  Sun,
  Link,
} from "lucide-react";
import "./index.css";

const generateRandomCode = customAlphabet(
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  6,
);

function App() {
  const [roomCode, setRoomCode] = useState("");
  const [content, setContent] = useState("");

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  // File state
  const [selectedFile, setSelectedFile] = useState(null);
  const [remoteFileUrl, setRemoteFileUrl] = useState(null);
  const [remoteFileName, setRemoteFileName] = useState(null);
  const fileInputRef = useRef(null);

  // Status state
  const [isSaving, setIsSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");

  const fetchRoomDataFromCode = async (cleanCode, isInitialLoad = false) => {
    setIsFetching(true);
    try {
      const { data, error } = await supabase
        .from("snippets")
        .select("content, file_url, file_name")
        .eq("code", cleanCode)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          if (!isInitialLoad) {
            alert("Room not found or is empty! Generating a new room...");
          }
          setRoomCode(generateRandomCode());
        } else {
          throw error;
        }
        return;
      }

      setRoomCode(cleanCode);
      setContent(data.content || "");
      setRemoteFileUrl(data.file_url || null);
      setRemoteFileName(data.file_name || null);
      setSelectedFile(null); // Clear any pending local file
    } catch (error) {
      console.error("Error joining room:", error.message);
      alert("Error fetching room content.");
      setRoomCode(generateRandomCode());
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get("room");
    if (roomFromUrl && roomFromUrl.length === 6) {
      fetchRoomDataFromCode(roomFromUrl.toUpperCase(), true);
    } else {
      setRoomCode(generateRandomCode());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (roomCode) {
      const newUrl = `${window.location.pathname}?room=${roomCode}`;
      window.history.replaceState({}, "", newUrl);
    }
  }, [roomCode]);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [isDarkMode]);

  const openJoinModal = () => {
    setJoinCodeInput("");
    setShowJoinModal(true);
  };

  const submitJoinRoom = async (e) => {
    if (e) e.preventDefault();
    const cleanCode = joinCodeInput.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      alert("Room code must be exactly 6 characters.");
      return;
    }
    setShowJoinModal(false);
    await fetchRoomDataFromCode(cleanCode, false);
  };

  const handleNewRoom = () => {
    setRoomCode(generateRandomCode());
    setContent("");
    setSelectedFile(null);
    setRemoteFileName(null);
    setRemoteFileUrl(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large. Maximum size is 5MB.");
      e.target.value = ""; // Reset input
      return;
    }

    setSelectedFile(file);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!content.trim() && !selectedFile && !remoteFileUrl) return;

    setIsSaving(true);
    try {
      let finalFileUrl = remoteFileUrl;
      let finalFileName = remoteFileName;

      // 1. Handle File Upload if there is a pending selected file
      if (selectedFile) {
        const filePath = `${roomCode}/${selectedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("room-files")
          .upload(filePath, selectedFile, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("room-files").getPublicUrl(filePath);

        finalFileUrl = publicUrl;
        finalFileName = selectedFile.name;

        // Update local state to reflect the file is now remote
        setRemoteFileUrl(publicUrl);
        setRemoteFileName(selectedFile.name);
        setSelectedFile(null);
      }

      // 2. Upsert the row in the database
      const { error: dbError } = await supabase.from("snippets").upsert(
        {
          code: roomCode,
          content: content,
          file_url: finalFileUrl,
          file_name: finalFileName,
        },
        { onConflict: "code" },
      );

      if (dbError) throw dbError;
    } catch (error) {
      console.error("Error saving content:", error.message);
      alert("Failed to save to room: " + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCopyLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <>
      <main className="main-container animate-fade-in">
        <header className="header-container">
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                background: "var(--text-main)",
                padding: "8px",
                borderRadius: "12px",
                color: "var(--content-bg)",
                display: "flex",
              }}
            >
              <ClipIcon size={24} />
            </div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: "600",
                color: "var(--text-main)",
                margin: 0,
              }}
            >
              Drop<span className="primary-gradient-text">Room</span>
            </h1>
          </div>

          <div className="header-actions">
            <div className="room-badge" style={{ marginRight: "8px" }}>
              <span style={{ color: "var(--text-muted)" }}>Room:</span>
              <span
                style={{
                  fontWeight: "700",
                  letterSpacing: "1px",
                  color: "var(--text-main)",
                }}
              >
                {roomCode}
              </span>
              <button
                onClick={handleCopyCode}
                title="Copy Room Code"
                style={{
                  background: "transparent",
                  border: "none",
                  color: copiedCode ? "var(--success)" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                  transition: "color 0.2s",
                }}
              >
                {copiedCode ? <Check size={16} /> : <Copy size={16} />}
              </button>
              <button
                onClick={handleCopyLink}
                title="Copy Room Link"
                style={{
                  background: "transparent",
                  border: "none",
                  color: copiedLink ? "var(--success)" : "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                  transition: "color 0.2s",
                  marginLeft: "4px",
                }}
              >
                {copiedLink ? <Check size={16} /> : <Link size={16} />}
              </button>
            </div>

            <button onClick={handleNewRoom} className="btn-secondary">
              <Plus size={16} />
              Create New Room
            </button>

            <button
              onClick={openJoinModal}
              className="btn-secondary"
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2
                  size={16}
                  className="spin"
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <FileInput size={16} />
              )}
              Join Room
            </button>

            <button
              onClick={handleSave}
              className="btn-primary"
              disabled={isSaving || (!content.trim() && !selectedFile)}
            >
              {isSaving ? (
                <Loader2
                  size={16}
                  className="spin"
                  style={{ animation: "spin 1s linear infinite" }}
                />
              ) : (
                <Save size={16} />
              )}
              Save
            </button>

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-muted)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "8px",
                marginLeft: "8px",
                borderRadius: "50%",
                transition: "all 0.2s",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.background = "var(--badge-bg)";
                e.currentTarget.style.color = "var(--text-main)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
          </div>
        </header>

        <div className="content-container">
          <div className="hero-section">
            <h2 className="hero-title">
              Hi there, <span className="primary-gradient-text">Welcome</span>
            </h2>
            <h3 className="hero-subtitle">What would you like to paste?</h3>
          </div>

          <div
            className="text-area-container"
            style={{
              flexGrow: 1,
              display: "flex",
              flexDirection: "column",
              position: "relative",
            }}
          >
            {content && (
              <button
                onClick={handleCopyContent}
                title="Copy All Content"
                style={{
                  position: "absolute",
                  top: "16px",
                  right: "16px",
                  background: "var(--btn-hover-bg)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-color)",
                  padding: "8px",
                  borderRadius: "8px",
                  cursor: "pointer",
                  zIndex: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "var(--border-color)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "var(--btn-hover-bg)";
                }}
              >
                <Copy size={18} />
              </button>
            )}

            <textarea
              className="text-area-input"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start typing or pasting your content here..."
            />

            {/* File Previews / Active Attachments */}
            {(selectedFile || remoteFileUrl) && (
              <div
                style={{
                  padding: "0 24px 16px 24px",
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                {/* Pending Upload */}
                {selectedFile && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "var(--badge-bg)",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border-color)",
                      fontSize: "0.875rem",
                    }}
                  >
                    <Paperclip size={14} color="var(--primary)" />
                    <span style={{ fontWeight: 500 }}>{selectedFile.name}</span>
                    <span style={{ color: "var(--text-muted)" }}>
                      ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      - Pending save
                    </span>
                    <button
                      onClick={handleRemoveFile}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        marginLeft: "4px",
                        display: "flex",
                      }}
                    >
                      <X size={14} color="var(--danger)" />
                    </button>
                  </div>
                )}

                {/* Server Attachment */}
                {remoteFileUrl && !selectedFile && (
                  <a
                    href={remoteFileUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "rgba(139, 92, 246, 0.1)",
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--primary)",
                      fontSize: "0.875rem",
                      textDecoration: "none",
                      color: "var(--text-main)",
                      transition: "background 0.2s",
                    }}
                    onMouseOver={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(139, 92, 246, 0.2)")
                    }
                    onMouseOut={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(139, 92, 246, 0.1)")
                    }
                  >
                    <Download size={14} color="var(--primary)" />
                    <span style={{ fontWeight: 500 }}>{remoteFileName}</span>
                  </a>
                )}
              </div>
            )}

            {/* Bottom Input Action Bar */}
            <div className="bottom-action-bar">
              <div className="bottom-action-group">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                    transition: "color 0.2s",
                  }}
                  onMouseOver={(e) =>
                    (e.currentTarget.style.color = "var(--primary)")
                  }
                  onMouseOut={(e) =>
                    (e.currentTarget.style.color = "var(--text-muted)")
                  }
                >
                  <Paperclip size={16} /> Attach File (Max 5MB)
                </button>
              </div>
              <div className="bottom-action-group">
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    fontWeight: "500",
                  }}
                >
                  {content.length}/100000 characters
                </span>
              </div>
            </div>
          </div>
        </div>
        {/* Footer */}
        <div className="footer-wrapper">
          Made by{" "}
          <span style={{ fontWeight: 600, color: "var(--text-main)" }}>
            Aaditya Pratap
          </span>
        </div>
      </main>

      {/* Join Room Modal */}
      {showJoinModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            className="modal-content animate-fade-in"
            style={{
              background: "var(--content-bg)",
              padding: "24px",
              borderRadius: "16px",
              width: "90%",
              maxWidth: "400px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
              border: "1px solid var(--border-color)",
              color: "var(--text-main)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.25rem" }}>Join a Room</h3>
              <button
                onClick={() => setShowJoinModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                }}
              >
                <X size={20} />
              </button>
            </div>
            <p
              style={{
                color: "var(--text-muted)",
                marginBottom: "20px",
                fontSize: "0.95rem",
              }}
            >
              Enter a 6-digit room code to join and collaborate.
            </p>
            <form onSubmit={submitJoinRoom}>
              <input
                type="text"
                maxLength={6}
                placeholder="e.g. A1B2C3"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-main)",
                  color: "var(--text-main)",
                  fontSize: "1.25rem",
                  letterSpacing: "2px",
                  textAlign: "center",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  marginBottom: "20px",
                  boxSizing: "border-box",
                }}
                autoFocus
              />
              <button
                type="submit"
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "12px",
                  justifyContent: "center",
                }}
                disabled={joinCodeInput.trim().length !== 6 || isFetching}
              >
                {isFetching ? (
                  <Loader2
                    size={16}
                    className="spin"
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  "Join Now"
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

export default App;
