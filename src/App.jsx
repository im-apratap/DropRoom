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
import Editor from "react-simple-code-editor";
import { highlight, languages } from "prismjs/components/prism-core";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-markup"; // HTML/XML
import "prismjs/components/prism-css";
import "prismjs/themes/prism-tomorrow.css"; // Dark theme
import JSZip from "jszip";
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
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [remoteFileUrl, setRemoteFileUrl] = useState(null);
  const [remoteFileName, setRemoteFileName] = useState(null); // This will represent the zipped file name
  const fileInputRef = useRef(null);

  // Status state
  const [isSaving, setIsSaving] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [expirationHours, setExpirationHours] = useState(1);

  // Recent rooms state
  const [recentRooms, setRecentRooms] = useState(() => {
    try {
      const saved = localStorage.getItem("droproom_recent");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Helper to add room to recents
  const addToRecentRooms = (code) => {
    setRecentRooms((prev) => {
      const newRecents = [code, ...prev.filter((r) => r !== code)].slice(0, 5);
      localStorage.setItem("droproom_recent", JSON.stringify(newRecents));
      return newRecents;
    });
  };

  const fetchRoomDataFromCode = async (cleanCode, isInitialLoad = false) => {
    setIsFetching(true);
    try {
      const { data, error } = await supabase
        .from("snippets")
        .select("content, file_url, file_name, expires_at")
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

      // Check for expiration
      if (data.expires_at) {
        const expiresAtDate = new Date(data.expires_at);
        if (expiresAtDate < new Date()) {
          // Room expired
          if (!isInitialLoad) {
            alert("This room has expired! Generating a new room...");
          }
          setRoomCode(generateRandomCode());
          return;
        }
      }

      setRoomCode(cleanCode);
      setContent(data.content || "");
      setRemoteFileUrl(data.file_url || null);
      setRemoteFileName(data.file_name || null);
      setSelectedFiles([]); // Clear any pending local files
      addToRecentRooms(cleanCode);
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
    setSelectedFiles([]);
    setRemoteFileName(null);
    setRemoteFileUrl(null);
    setExpirationHours(1);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Validate 5MB combined limit for practical browser processing
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > 5 * 1024 * 1024) {
      alert("Total files size is too large. Maximum combined size is 5MB.");
      e.target.value = ""; // Reset input
      return;
    }

    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const handleRemoveFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSave = async () => {
    if (!content.trim() && selectedFiles.length === 0 && !remoteFileUrl) return;

    setIsSaving(true);
    try {
      let finalFileUrl = remoteFileUrl;
      let finalFileName = remoteFileName;

      // 1. Handle File Upload if there are pending selected files
      if (selectedFiles.length > 0) {
        const zip = new JSZip();
        selectedFiles.forEach((file) => {
          zip.file(file.name, file);
        });

        const zipBlob = await zip.generateAsync({ type: "blob" });
        // NOTE: We could theoretically encrypt the entire zipBlob using crypto-js or WebCrypto here,
        // but for a 5MB blob, reading into memory via FileReader to stringify, encrypt via CryptoJS,
        // converting back to blob -> can easily block the UI or crash mobile browsers.
        // Using native File is standard; but if strict client-side file encryption is requested, it requires more complex WebCrypto API streams.
        // For right now, JSZip provides compression and bundles the files. If you'd like full blob encryption, let me know!

        const zipFileName = `files-${Date.now()}.zip`;
        const filePath = `${roomCode}/${zipFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("room-files")
          .upload(filePath, zipBlob, {
            upsert: true,
            contentType: "application/zip",
          });

        if (uploadError) throw uploadError;

        // Get public URL
        const {
          data: { publicUrl },
        } = supabase.storage.from("room-files").getPublicUrl(filePath);

        finalFileUrl = publicUrl;
        finalFileName = "Shared Files.zip"; // Display name

        // Update local state to reflect the file is now remote
        setRemoteFileUrl(publicUrl);
        setRemoteFileName(finalFileName);
        setSelectedFiles([]);
      }

      // Calculate expires_at
      let expiresAtValue = null;
      if (expirationHours > 0) {
        const ms = expirationHours * 60 * 60 * 1000;
        expiresAtValue = new Date(Date.now() + ms).toISOString();
      }

      // 2. Upsert the row in the database
      const { error: dbError } = await supabase.from("snippets").upsert(
        {
          code: roomCode,
          content: content,
          file_url: finalFileUrl,
          file_name: finalFileName,
          expires_at: expiresAtValue,
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
              disabled={
                isSaving || (!content.trim() && selectedFiles.length === 0)
              }
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

            <select
              value={expirationHours}
              onChange={(e) => setExpirationHours(Number(e.target.value))}
              style={{
                marginLeft: "8px",
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border-color)",
                background: "var(--bg-main)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                cursor: "pointer",
                outline: "none",
              }}
              title="Auto-Destruct Timer"
            >
              <option value={1}>1 Hour</option>
              <option value={2}>2 Hours</option>
              <option value={3}>3 Hours</option>
              <option value={6}>6 Hours (Max)</option>
            </select>

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

            <div
              style={{
                flexGrow: 1,
                overflow: "auto",
                position: "relative",
              }}
              className="editor-scroll-container"
            >
              <Editor
                value={content}
                onValueChange={(code) => setContent(code)}
                highlight={(code) =>
                  highlight(code, languages.javascript, "javascript")
                } // Defaulting to JS, can be improved
                padding={24}
                placeholder="Start typing or pasting your content here..."
                className="text-area-input"
                style={{
                  fontFamily: '"Fira code", "Fira Mono", monospace',
                  fontSize: 14,
                  minHeight: "100%",
                  outline: "none",
                  backgroundColor: "transparent",
                }}
              />
            </div>

            {/* File Previews / Active Attachments */}
            {(selectedFiles.length > 0 || remoteFileUrl) && (
              <div
                style={{
                  padding: "0 24px 16px 24px",
                  display: "flex",
                  gap: "12px",
                  flexWrap: "wrap",
                }}
              >
                {/* Pending Uploads */}
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
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
                    <span style={{ fontWeight: 500 }}>
                      {file.name.length > 20
                        ? file.name.substring(0, 20) + "..."
                        : file.name}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}>
                      ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </span>
                    <button
                      onClick={() => handleRemoveFile(index)}
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
                ))}

                {/* Server Attachment */}
                {remoteFileUrl && selectedFiles.length === 0 && (
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
                  multiple
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
              {recentRooms.length > 0 && (
                <div style={{ marginBottom: "20px" }}>
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--text-muted)",
                      marginBottom: "8px",
                      marginTop: 0,
                    }}
                  >
                    Recent Rooms
                  </p>
                  <div
                    style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                  >
                    {recentRooms.map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          setJoinCodeInput(code);
                          // Optionally auto-submit: submitJoinRoom()
                        }}
                        style={{
                          background: "var(--badge-bg)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-main)",
                          padding: "6px 12px",
                          borderRadius: "16px",
                          fontSize: "0.85rem",
                          cursor: "pointer",
                          fontWeight: "500",
                          transition: "all 0.2s",
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.borderColor = "var(--primary)";
                          e.currentTarget.style.color = "var(--primary)";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.borderColor =
                            "var(--border-color)";
                          e.currentTarget.style.color = "var(--text-main)";
                        }}
                      >
                        {code}
                      </button>
                    ))}
                  </div>
                </div>
              )}
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
