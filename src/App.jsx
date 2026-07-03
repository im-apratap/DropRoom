import { useState, useEffect, useRef } from "react";
import { customAlphabet } from "nanoid";
import { supabase } from "./supabaseClient";
import toast, { Toaster } from "react-hot-toast";
import CryptoJS from "crypto-js";
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
  Lock,
  Unlock,
  Eye,
  Settings,
  QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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

const ANIMALS = ["Panda", "Fox", "Frog", "Owl", "Tiger", "Koala", "Penguin", "Wolf", "Bear", "Lion", "Rabbit", "Cat", "Dog"];
const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#84cc16"];

function generateIdentity() {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  return { 
    id: Math.random().toString(36).substring(2, 9), 
    name: `Anonymous ${animal}`, 
    color 
  };
}

function App() {
  const [roomId, setRoomId] = useState(null);
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

  // E2E Encryption State
  const [isPrivate, setIsPrivate] = useState(false);
  const [password, setPassword] = useState("");
  const [isDecrypted, setIsDecrypted] = useState(true);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [encryptedData, setEncryptedData] = useState(null);
  const [attemptPassword, setAttemptPassword] = useState("");
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [readOnlyCode, setReadOnlyCode] = useState(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  const [identity] = useState(() => generateIdentity());
  const [cursors, setCursors] = useState({});
  const [presenceUsers, setPresenceUsers] = useState({});
  const lastCursorSendRef = useRef(0);


  // Status state
  const [isSaving, setIsSaving] = useState(false);
  const isSavingRef = useRef(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [expirationHours, setExpirationHours] = useState(1);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const hasUnsavedChangesRef = useRef(false);
  const channelRef = useRef(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!channelRef.current) return;
      
      const now = Date.now();
      if (now - lastCursorSendRef.current > 50) { // ~20fps throttle
        lastCursorSendRef.current = now;
        
        // Send broadcast only if channel is fully subscribed
        // Supabase send() will fail silently or throw if not subscribed, but it's safe to call.
        try {
          channelRef.current.send({
            type: 'broadcast',
            event: 'cursor',
            payload: {
              id: identity.id,
              x: e.clientX,
              y: e.clientY
            }
          });
        } catch {
          // Ignore errors if sending before fully subscribed
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [identity.id]);

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
        .select("id, content, file_url, file_name, expires_at, is_private, read_only_code")
        .or(`code.eq.${cleanCode},read_only_code.eq.${cleanCode}`)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          if (!isInitialLoad) {
            toast.error("Room not found or is empty! Generating a new room...");
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
            toast.error("This room has expired! Generating a new room...");
          }
          setRoomCode(generateRandomCode());
          return;
        }
      }

      setRoomId(data.id);
      
      const isReadMode = (data.read_only_code === cleanCode && data.code !== cleanCode);
      setIsReadOnly(isReadMode);
      setRoomCode(cleanCode); // URL code (might be read-only or edit)
      setReadOnlyCode(data.read_only_code);
      setIsPrivate(data.is_private || false);
      setSelectedFiles([]); // Clear any pending local files
      addToRecentRooms(cleanCode);

      if (data.is_private) {
        setIsDecrypted(false);
        setPasswordModalOpen(true);
        setEncryptedData({
          content: data.content || "",
          file_url: data.file_url || null,
          file_name: data.file_name || null
        });
      } else {
        setIsDecrypted(true);
        setContent(data.content || "");
        setRemoteFileUrl(data.file_url || null);
        setRemoteFileName(data.file_name || null);
      }
    } catch (error) {
      console.error("Error joining room:", error.message);
      toast.error("Error fetching room content.");
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

  // Real-time synchronization
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase.channel(`room-${roomId}`, {
      config: {
        broadcast: { ack: false },
        presence: { key: identity.id },
      },
    });

    channelRef.current = channel;

    channel
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "snippets",
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (payload.new) {
            if (payload.new.is_private) {
              setEncryptedData({
                content: payload.new.content || "",
                file_url: payload.new.file_url || null,
                file_name: payload.new.file_name || null
              });
              if (password) {
                 try {
                   const decBytes = CryptoJS.AES.decrypt(payload.new.content || "", password);
                   const decContent = decBytes.toString(CryptoJS.enc.Utf8);
                   if (decContent !== undefined && decContent !== null) {
                     setContent((current) => current !== decContent ? decContent : current);
                   }
                   if (payload.new.file_url) {
                      setRemoteFileUrl(payload.new.file_url);
                   }
                 } catch (e) {
                   console.error(e);
                 }
              }
            } else {
              setContent((currentContent) => {
                if (payload.new.content !== currentContent) {
                  return payload.new.content || "";
                }
                return currentContent;
              });
              setRemoteFileUrl((currentUrl) => {
                if (payload.new.file_url !== currentUrl) {
                  return payload.new.file_url || null;
                }
                return currentUrl;
              });
              setRemoteFileName((currentName) => {
                if (payload.new.file_name !== currentName) {
                  return payload.new.file_name || null;
                }
                return currentName;
              });
            }
          }
        }
      )
      .on(
        "broadcast",
        { event: "snippet_updated" },
        (payload) => {
          if (payload.payload) {
            if (isPrivate && password) {
               try {
                 const decBytes = CryptoJS.AES.decrypt(payload.payload.content || "", password);
                 const decContent = decBytes.toString(CryptoJS.enc.Utf8);
                 if (decContent || !(payload.payload.content)) setContent(decContent || "");
               } catch(e) {
                 console.error(e);
               }
            } else if (!isPrivate) {
              setContent((currentContent) => {
                if (payload.payload.content !== currentContent) {
                  return payload.payload.content || "";
                }
                return currentContent;
              });
              setRemoteFileUrl((currentUrl) => {
                if (payload.payload.file_url !== currentUrl) {
                  return payload.payload.file_url || null;
                }
                return currentUrl;
              });
              setRemoteFileName((currentName) => {
                if (payload.payload.file_name !== currentName) {
                  return payload.payload.file_name || null;
                }
                return currentName;
              });
            }
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const newState = channel.presenceState();
        const users = {};
        for (const id in newState) {
           users[newState[id][0].id] = newState[id][0];
        }
        setPresenceUsers(users);
        // Clean up cursors for users who left
        setCursors(prev => {
          const next = { ...prev };
          for (const cid in next) {
            if (!users[cid]) delete next[cid];
          }
          return next;
        });
      })
      .on('broadcast', { event: 'cursor' }, (payload) => {
        if (payload.payload.id !== identity.id) {
          setCursors(prev => ({
            ...prev,
            [payload.payload.id]: {
              x: payload.payload.x,
              y: payload.payload.y,
              // We rely on presence data for color and name when rendering
            }
          }));
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track(identity);
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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
      toast.error("Room code must be exactly 6 characters.");
      return;
    }
    setShowJoinModal(false);
    await fetchRoomDataFromCode(cleanCode, false);
  };

  const handleNewRoom = () => {
    setRoomId(null);
    setRoomCode(generateRandomCode());
    setContent("");
    setSelectedFiles([]);
    setRemoteFileName(null);
    setRemoteFileUrl(null);
    setExpirationHours(1);
    setIsPrivate(false);
    setPassword("");
    setIsDecrypted(true);
    setPasswordModalOpen(false);
    setIsReadOnly(false);
    setReadOnlyCode(null);
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    // Validate 5MB combined limit for practical browser processing
    const totalSize = files.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > 5 * 1024 * 1024) {
      toast.error("Total files size is too large. Maximum combined size is 5MB.");
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

  const handleShareReadOnly = async () => {
    if (!roomId) {
      toast.error("Save the room first before sharing a read-only link.");
      return;
    }
    
    let currentReadOnlyCode = readOnlyCode;
    if (!currentReadOnlyCode) {
      // Generate and save a new read-only code
      currentReadOnlyCode = generateRandomCode();
      const { error } = await supabase.from("snippets").update({ read_only_code: currentReadOnlyCode }).eq("id", roomId);
      if (error) {
        toast.error("Failed to generate read-only link.");
        return;
      }
      setReadOnlyCode(currentReadOnlyCode);
    }
    
    const readOnlyUrl = `${window.location.origin}${window.location.pathname}?room=${currentReadOnlyCode}`;
    navigator.clipboard.writeText(readOnlyUrl);
    toast.success("Read-Only link copied to clipboard!");
  };

  const handleSave = async (overridePassword = null) => { // override is passed if saving immediately on lock
    if (isSavingRef.current) return;
    if (!content.trim() && selectedFiles.length === 0 && !remoteFileUrl) return;
    const currentPassword = (typeof overridePassword === 'string') ? overridePassword : password;
    if (isPrivate && !currentPassword) {
      toast.error("Please enter a password to save this private room.");
      return;
    }
    isSavingRef.current = true;
    hasUnsavedChangesRef.current = false;
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
        
        let finalBlobToUpload = zipBlob;
        
        if (isPrivate && password) {
           const base64data = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.readAsDataURL(zipBlob);
              reader.onloadend = () => resolve(reader.result);
           });
           const encryptedBase64 = CryptoJS.AES.encrypt(base64data, currentPassword).toString();
           finalBlobToUpload = new Blob([encryptedBase64], { type: "text/plain" });
        }

        const zipFileName = isPrivate ? `files-${Date.now()}.enc` : `files-${Date.now()}.zip`;
        const filePath = `${roomCode}/${zipFileName}`;

        const { error: uploadError } = await supabase.storage
          .from("room-files")
          .upload(filePath, finalBlobToUpload, {
            upsert: true,
            contentType: isPrivate ? "text/plain" : "application/zip",
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
      let dbContent = content;
      if (isPrivate && password) {
        dbContent = CryptoJS.AES.encrypt(content, currentPassword).toString();
      }

      const { data: dbData, error: dbError } = await supabase.from("snippets").upsert(
        {
          code: roomCode,
          content: dbContent,
          file_url: finalFileUrl,
          file_name: finalFileName,
          expires_at: expiresAtValue,
          is_private: isPrivate,
        },
        { onConflict: "code" },
      ).select("id").single();

      if (dbError) throw dbError;
      if (dbData && dbData.id) {
        setRoomId(dbData.id);
      }

      // Broadcast changes to other clients manually
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "snippet_updated",
          payload: {
            content: isPrivate ? CryptoJS.AES.encrypt(content, currentPassword).toString() : content,
            file_url: finalFileUrl,
            file_name: finalFileName,
          },
        });
      }
    } catch (error) {
      console.error("Error saving content:", error.message);
      toast.error("Failed to save to room: " + error.message);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
      // If more changes happened while saving, trigger another save
      if (hasUnsavedChangesRef.current && autoSaveEnabled) {
        setTimeout(() => {
          handleSave();
        }, 1500);
      }
    }
  };

  useEffect(() => {
    if (!autoSaveEnabled || !hasUnsavedChangesRef.current) return;

    const timer = setTimeout(() => {
      handleSave();
    }, 1500); // 1.5-second debounce for typing
    
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, autoSaveEnabled]);


  const handleDecrypt = async (e) => {
    e.preventDefault();
    if (!attemptPassword) {
      toast.error("Please enter a password.");
      return;
    }
    try {
      if (encryptedData.content) {
        const decBytes = CryptoJS.AES.decrypt(encryptedData.content, attemptPassword);
        const decContent = decBytes.toString(CryptoJS.enc.Utf8);
        if (!decContent && encryptedData.content.length > 0) throw new Error("Wrong password");
        setContent(decContent);
      }
      
      setRemoteFileUrl(encryptedData.file_url);
      setRemoteFileName(encryptedData.file_name);
      
      setPassword(attemptPassword);
      setIsDecrypted(true);
      setPasswordModalOpen(false);
      toast.success("Room unlocked!");
    } catch (e) {
      console.error(e);
      toast.error("Incorrect password.");
      setAttemptPassword("");
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


  const handleDownloadFile = async (e) => {
    e.preventDefault();
    if (!isPrivate) {
      window.open(remoteFileUrl, "_blank");
      return;
    }
    
    const loadingToast = toast.loading("Decrypting file...");
    try {
      const response = await fetch(remoteFileUrl);
      const encryptedBase64 = await response.text();
      const decBytes = CryptoJS.AES.decrypt(encryptedBase64, password);
      const decBase64 = decBytes.toString(CryptoJS.enc.Utf8);
      
      const a = document.createElement("a");
      a.href = decBase64;
      a.download = remoteFileName || "Shared Files.zip";
      a.click();
      toast.success("File decrypted!", { id: loadingToast });
    } catch(err) {
      console.error(err);
      toast.error("Failed to decrypt file.", { id: loadingToast });
    }
  };

  const handleCopyContent = () => {
    navigator.clipboard.writeText(content);
  };

  return (
    <>
      <Toaster position="bottom-center" />
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
              <button
                onClick={() => setShowQrModal(true)}
                title="Show QR Code"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                  transition: "color 0.2s",
                  marginLeft: "4px",
                }}
                onMouseOver={(e) => (e.currentTarget.style.color = "var(--text-main)")}
                onMouseOut={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                <QrCode size={16} />
              </button>
            </div>



            <button onClick={handleNewRoom} className="btn-secondary">
              <Plus size={16} />
              New Room
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

            {!isReadOnly && (
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
            )}

                        <button onClick={() => setShowSettingsModal(true)} className="btn-secondary" title="Settings">
              <Settings size={16} />
              More
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
              minHeight: 0,
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
                minHeight: 0,
              }}
              className="editor-scroll-container"
            >
              {!isDecrypted ? (
                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                    <Lock size={48} style={{ marginBottom: '16px', color: 'var(--danger)' }} />
                    <h2>This Room is Encrypted</h2>
                    <p>Enter the password to view and edit.</p>
                    <button onClick={() => setPasswordModalOpen(true)} className="btn-primary" style={{ marginTop: '16px' }}>Unlock Room</button>
                 </div>
              ) : (
              <Editor
                disabled={isReadOnly}
                value={content}
                onValueChange={(code) => {
                  if (code.length <= 500000) {
                    setContent(code);
                  } else {
                    setContent(code.slice(0, 500000));
                  }
                  if (autoSaveEnabled) {
                    hasUnsavedChangesRef.current = true;
                  }
                }}
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
              )}
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
                    href="#"
                    onClick={handleDownloadFile}
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
            {!isReadOnly && (
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
                  {content.length}/500000 characters
                </span>
              </div>
            </div>
            )}
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

            {/* Password Modal */}
      {passwordModalOpen && (
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
              <h3 style={{ margin: 0, fontSize: "1.25rem", display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Lock size={20} color="var(--danger)" /> Encrypted Room
              </h3>
            </div>
            <p
              style={{
                color: "var(--text-muted)",
                marginBottom: "20px",
                fontSize: "0.95rem",
              }}
            >
              This room is End-to-End encrypted. Please enter the password to view its contents.
            </p>
            <form onSubmit={handleDecrypt}>
              <input
                type="password"
                placeholder="Password"
                value={attemptPassword}
                onChange={(e) => setAttemptPassword(e.target.value)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--border-color)",
                  background: "var(--bg-main)",
                  color: "var(--text-main)",
                  fontSize: "1rem",
                  marginBottom: "20px",
                  boxSizing: "border-box",
                  outline: "none"
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
              >
                Unlock
              </button>
            </form>
          </div>
        </div>
      )}

                  {/* Settings Modal */}
      {showSettingsModal && (
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
             <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
               <h3 style={{ margin: 0, fontSize: "1.25rem", display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <Settings size={20} /> Room Settings
               </h3>
               <button onClick={() => setShowSettingsModal(false)} style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--text-muted)" }}><X size={20} /></button>
             </div>
             
             <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
               {/* Share Read-Only */}
               {!isReadOnly && (
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ color: "var(--text-main)", fontSize: "0.95rem" }}>Read-Only Link</span>
                   <button onClick={() => { handleShareReadOnly(); setShowSettingsModal(false); }} className="btn-secondary" style={{ padding: '6px 12px' }}>
                     <Eye size={16} /> Share
                   </button>
                 </div>
               )}

               {/* Expiration Timer */}
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span style={{ color: "var(--text-main)", fontSize: "0.95rem" }}>Auto-Destruct Timer</span>
                 <select value={expirationHours} onChange={(e) => setExpirationHours(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.875rem", outline: "none" }}>
                   <option value={1}>1 Hour</option>
                   <option value={2}>2 Hours</option>
                   <option value={3}>3 Hours</option>
                   <option value={6}>6 Hours (Max)</option>
                 </select>
               </div>

               {/* Auto-Save */}
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                 <span style={{ color: "var(--text-main)", fontSize: "0.95rem" }}>Auto-Save</span>
                 <input type="checkbox" checked={autoSaveEnabled} onChange={(e) => setAutoSaveEnabled(e.target.checked)} style={{ cursor: "pointer", width: "16px", height: "16px", accentColor: "var(--primary)" }} />
               </div>

               {/* Privacy */}
               {!isReadOnly && (
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <span style={{ color: "var(--text-main)", fontSize: "0.95rem" }}>E2E Encryption</span>
                   <button onClick={() => { 
                     if (isPrivate) { setIsPrivate(false); setPassword(""); toast.success("Room Unlocked"); } 
                     else { 
                       setShowSettingsModal(false);
                       toast.custom((t) => (
                         <div style={{ background: 'var(--content-bg)', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '250px' }}>
                           <span style={{ fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                             <Lock size={16} color="var(--danger)" /> Set Room Password
                           </span>
                           <input 
                             type="password" 
                             id="toast-password" 
                             placeholder="Secure Password..." 
                             style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-main)', color: 'var(--text-main)', outline: 'none' }} 
                             autoFocus 
                             onKeyDown={(e) => {
                               if (e.key === 'Enter') {
                                 document.getElementById('toast-lock-btn').click();
                               }
                             }}
                           />
                           <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                             <button onClick={() => toast.dismiss(t.id)} className="btn-secondary" style={{ padding: '6px 12px' }}>Cancel</button>
                             <button 
                               id="toast-lock-btn"
                               onClick={() => {
                                 const pwd = document.getElementById('toast-password').value;
                                 if (!pwd) { toast.error("Password required"); return; }
                                 setPassword(pwd);
                                 setIsPrivate(true);
                                 toast.dismiss(t.id);
                                 toast.success("Room is now E2E encrypted!");
                                 handleSave(pwd);
                               }} 
                               className="btn-primary" 
                               style={{ padding: '6px 12px' }}
                             >
                               Lock Room
                             </button>
                           </div>
                         </div>
                       ), { duration: Infinity });
                     } 
                   }} className={isPrivate ? "btn-secondary" : "btn-primary"} style={{ padding: '6px 12px', background: isPrivate ? "rgba(239, 68, 68, 0.1)" : "", color: isPrivate ? "var(--danger)" : "", borderColor: isPrivate ? "var(--danger)" : "" }}>
                     {isPrivate ? <><Unlock size={16} /> Unlock</> : <><Lock size={16} /> Lock Room</>}
                   </button>
                 </div>
               )}
             </div>
          </div>
        </div>
      )}

      
      {/* Live Multiplayer Cursors */}
      {Object.keys(cursors).map(id => {
         const cursor = cursors[id];
         const user = presenceUsers[id];
         if (!user) return null;
         
         return (
           <div 
             key={id} 
             style={{
               position: 'fixed',
               left: cursor.x,
               top: cursor.y,
               pointerEvents: 'none',
               zIndex: 9999,
               transform: 'translate(-2px, -2px)',
               transition: 'left 0.05s linear, top 0.05s linear',
             }}
           >
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
               <path d="M5.65376 21.2577C5.07185 21.6669 4.25 21.2505 4.25 20.5369V3.46313C4.25 2.7495 5.07185 2.33315 5.65376 2.74233L19.7891 12.6841C20.3013 13.0444 20.2644 13.8219 19.7208 14.1287L13.847 17.443C13.626 17.5678 13.4354 17.7441 13.2987 17.9542L9.89782 23.1873C9.53765 23.7416 8.68065 23.6888 8.39708 23.0954L6.91136 19.9859C6.73295 19.6125 6.42539 19.3093 6.0487 19.1332L5.65376 21.2577Z" fill={user.color} stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
             </svg>
             <div style={{
               background: user.color,
               color: 'white',
               padding: '2px 8px',
               borderRadius: '12px',
               borderTopLeftRadius: '0',
               fontSize: '12px',
               fontWeight: 600,
               whiteSpace: 'nowrap',
               boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
               marginTop: '4px',
               marginLeft: '12px'
             }}>
               {user.name}
             </div>
           </div>
         );
      })}

      {/* QR Code Modal */}
      {showQrModal && (
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
          onClick={() => setShowQrModal(false)}
        >
          <div
            className="modal-content animate-fade-in"
            style={{
              background: "var(--content-bg)",
              padding: "32px",
              borderRadius: "24px",
              boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
              border: "1px solid var(--border-color)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 24px 0", color: "var(--text-main)" }}>Scan to Join</h3>
            <div style={{ background: "white", padding: "16px", borderRadius: "16px" }}>
              <QRCodeSVG value={window.location.href} size={200} />
            </div>
            <p style={{ margin: "24px 0 0 0", color: "var(--text-muted)", letterSpacing: "2px", fontWeight: "bold" }}>
              {roomCode}
            </p>
          </div>
        </div>
      )}

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
