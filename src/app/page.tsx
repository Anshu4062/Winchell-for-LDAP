"use client";

import { useState, useEffect } from "react";

type SavedProfile = {
  name: string;
  url: string;
  bindDN: string;
  password: string;
  insecure: boolean;
};

export default function Home() {
  const [url, setUrl] = useState("ldap://localhost:389");
  const [bindDN, setBindDN] = useState("cn=admin,dc=dcm4che,dc=org");
  const [password, setPassword] = useState("secret");
  const [insecure, setInsecure] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("ldapProfiles");
    if (saved) {
      try {
        setSavedProfiles(JSON.parse(saved));
      } catch {}
    }
  }, []);

  function isConnectionAlreadySaved(): boolean {
    return savedProfiles.some(
      (profile) =>
        profile.url === url &&
        profile.bindDN === bindDN &&
        profile.insecure === insecure
    );
  }

  async function loadProfile(name: string) {
    const profile = savedProfiles.find((p) => p.name === name);
    if (profile) {
      setUrl(profile.url);
      setBindDN(profile.bindDN);
      setPassword(profile.password);
      setInsecure(profile.insecure);
      setSelectedProfile(name);

      // Automatically connect after loading profile
      await connectWithProfile(profile);
    }
  }

  async function connectWithProfile(profile: SavedProfile) {
    setLoading(true);
    setResult(null);

    try {
      const connectPayload = {
        url: profile.url,
        bindDN: profile.bindDN,
        password: profile.password,
        tls: profile.insecure ? { rejectUnauthorized: false } : undefined,
      };

      const res = await fetch("/api/ldap/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectPayload),
      });

      const data = await res.json();

      if (res.ok && data?.ok) {
        setResult("Connected successfully.");

        // Store connection in sessionStorage and redirect
        const sessionData = {
          url: profile.url,
          bindDN: profile.bindDN,
          password: profile.password,
          insecure: profile.insecure,
          baseDN: "dc=dcm4che,dc=org",
        };
        sessionStorage.setItem("ldapConnection", JSON.stringify(sessionData));

        // Redirect to browse page
        window.location.href = "/browse";
      } else {
        setResult(`Failed: ${data?.error || res.statusText}`);
      }
    } catch (err) {
      setResult(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  function deleteProfile(name: string) {
    if (confirm(`Delete profile "${name}"?`)) {
      const updated = savedProfiles.filter((p) => p.name !== name);
      setSavedProfiles(updated);
      localStorage.setItem("ldapProfiles", JSON.stringify(updated));
      if (selectedProfile === name) setSelectedProfile("");
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("🔍 [DEBUG] onSubmit() called");
    console.log("🔍 [DEBUG] Form data:", {
      url,
      bindDN,
      password: password ? "***" : "undefined",
      insecure,
    });

    setLoading(true);
    setResult(null);
    try {
      const connectPayload = {
        url,
        bindDN,
        password,
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };
      console.log("🔍 [DEBUG] Sending connect request:", {
        ...connectPayload,
        password: "***",
      });

      const res = await fetch("/api/ldap/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectPayload),
      });

      console.log(
        "📡 [DEBUG] Connect response status:",
        res.status,
        res.statusText
      );

      const data = await res.json();
      console.log("📊 [DEBUG] Connect response data:", data);

      if (res.ok && data?.ok) {
        console.log("✅ [DEBUG] Connection successful, setting result");
        setResult("Connected successfully.");

        // Check if connection is already saved
        if (!isConnectionAlreadySaved()) {
          console.log("💾 [DEBUG] Connection not saved, showing save prompt");
          setNewProfileName("LDAP Connection");
          setShowSavePrompt(true);
        } else {
          console.log(
            "✅ [DEBUG] Connection already saved, redirecting to browse"
          );
          // Store connection in sessionStorage and redirect
          const sessionData = {
            url,
            bindDN,
            password,
            insecure,
            baseDN: "dc=dcm4che,dc=org",
          };
          console.log("💾 [DEBUG] Saving to sessionStorage:", {
            ...sessionData,
            password: "***",
          });
          sessionStorage.setItem("ldapConnection", JSON.stringify(sessionData));

          console.log("🔄 [DEBUG] Redirecting to /browse");
          window.location.href = "/browse";
        }
      } else {
        console.log(
          "❌ [DEBUG] Connection failed:",
          data?.error || res.statusText
        );
        setResult(`Failed: ${data?.error || res.statusText}`);
      }
    } catch (err) {
      console.error("❌ [DEBUG] Connection exception:", err);
      setResult(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
      console.log("🏁 [DEBUG] onSubmit() completed");
    }
  }

  function handleSaveProfile() {
    if (newProfileName.trim()) {
      const newProfile: SavedProfile = {
        name: newProfileName.trim(),
        url,
        bindDN,
        password,
        insecure,
      };
      const updated = [
        ...savedProfiles.filter((p) => p.name !== newProfileName.trim()),
        newProfile,
      ];
      setSavedProfiles(updated);
      localStorage.setItem("ldapProfiles", JSON.stringify(updated));
      setResult(
        `Connected successfully and saved as "${newProfileName.trim()}" profile.`
      );
      setShowSavePrompt(false);

      // Store connection in sessionStorage and redirect
      sessionStorage.setItem(
        "ldapConnection",
        JSON.stringify({
          url,
          bindDN,
          password,
          insecure,
          baseDN: "dc=dcm4che,dc=org",
        })
      );
      window.location.href = "/browse";
    }
  }

  function handleSkipSave() {
    console.log("🔍 [DEBUG] handleSkipSave() called");
    setShowSavePrompt(false);

    // Store connection in sessionStorage and redirect
    const sessionData = {
      url,
      bindDN,
      password,
      insecure,
      baseDN: "dc=dcm4che,dc=org",
    };
    console.log("💾 [DEBUG] Saving to sessionStorage:", {
      ...sessionData,
      password: "***",
    });
    sessionStorage.setItem("ldapConnection", JSON.stringify(sessionData));

    console.log("🔄 [DEBUG] Redirecting to /browse");
    window.location.href = "/browse";
  }

  return (
    <div
      style={{
        maxWidth: 800,
        margin: "60px auto",
        padding: "40px",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
        background: "#fff",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: "40px" }}>
        <h1
          style={{
            fontSize: "32px",
            fontWeight: "600",
            margin: "0 0 8px 0",
            color: "#1a1a1a",
          }}
        >
          Connect to LDAP
        </h1>
        <p
          style={{
            color: "#6b7280",
            margin: "0",
            fontSize: "16px",
          }}
        >
          Manage your LDAP server connections
        </p>
      </div>

      {/* Saved Profiles Section */}
      {savedProfiles.length > 0 && (
        <div
          style={{
            marginBottom: "32px",
            padding: "24px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#fafafa",
          }}
        >
          <h3
            style={{
              margin: "0 0 16px 0",
              fontSize: "18px",
              fontWeight: "600",
              color: "#374151",
            }}
          >
            Saved Profiles
          </h3>
          <div
            style={{
              display: "grid",
              gap: "16px",
              gridTemplateColumns: "1fr auto auto",
              alignItems: "center",
            }}
          >
            <select
              value={selectedProfile}
              onChange={(e) => loadProfile(e.target.value)}
              disabled={loading}
              style={{
                padding: "12px 16px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                background: loading ? "#f3f4f6" : "#fff",
                color: loading ? "#9ca3af" : "#374151",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              <option value="">Select a profile...</option>
              {savedProfiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => loadProfile(selectedProfile)}
              disabled={!selectedProfile || loading}
              style={{
                padding: "12px 20px",
                borderRadius: "8px",
                border: "none",
                background: selectedProfile && !loading ? "#374151" : "#d1d5db",
                color: "#fff",
                cursor: selectedProfile && !loading ? "pointer" : "not-allowed",
                fontWeight: "500",
                fontSize: "14px",
                transition: "all 0.2s ease",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
              }}
              onMouseOver={(e) => {
                if (selectedProfile && !loading) {
                  e.currentTarget.style.background = "#1f2937";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }
              }}
              onMouseOut={(e) => {
                if (selectedProfile && !loading) {
                  e.currentTarget.style.background = "#374151";
                  e.currentTarget.style.transform = "translateY(0)";
                }
              }}
            >
              {loading ? "Connecting..." : "Load Profile"}
            </button>
            {selectedProfile && (
              <button
                onClick={() => deleteProfile(selectedProfile)}
                style={{
                  padding: "12px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#ef4444",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#dc2626";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#ef4444";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {/* Connection Form */}
      <div
        style={{
          padding: "32px",
          border: "1px solid #e5e7eb",
          borderRadius: "12px",
          background: "#fff",
        }}
      >
        <h3
          style={{
            margin: "0 0 24px 0",
            fontSize: "20px",
            fontWeight: "600",
            color: "#374151",
          }}
        >
          Connection Details
        </h3>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "20px" }}>
          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
                fontSize: "14px",
              }}
            >
              Server URL
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="ldap://localhost:389"
              required
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#3b82f6";
                e.target.style.outline = "none";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#d1d5db";
              }}
            />
            <div
              style={{
                fontSize: "12px",
                color: "#6b7280",
                marginTop: "4px",
              }}
            >
              e.g. ldap://host:389 or ldaps://host:636
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
                fontSize: "14px",
              }}
            >
              Bind DN
            </label>
            <input
              value={bindDN}
              onChange={(e) => setBindDN(e.target.value)}
              placeholder="cn=admin,dc=example,dc=com"
              required
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#3b82f6";
                e.target.style.outline = "none";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#d1d5db";
              }}
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: "500",
                color: "#374151",
                fontSize: "14px",
              }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "14px 16px",
                border: "1px solid #d1d5db",
                borderRadius: "8px",
                fontSize: "14px",
                transition: "border-color 0.2s ease",
                boxSizing: "border-box",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#3b82f6";
                e.target.style.outline = "none";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#d1d5db";
              }}
            />
          </div>

          <label
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={insecure}
              onChange={(e) => setInsecure(e.target.checked)}
              style={{
                width: "18px",
                height: "18px",
                cursor: "pointer",
              }}
            />
            <span
              style={{
                fontSize: "14px",
                color: "#374151",
              }}
            >
              Allow insecure TLS (do not verify certificate)
            </span>
          </label>

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "16px 24px",
              borderRadius: "8px",
              border: "none",
              background: "#1f2937",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              fontWeight: "600",
              fontSize: "16px",
              transition: "all 0.2s ease",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
              marginTop: "8px",
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#111827";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 6px 20px rgba(0, 0, 0, 0.2)";
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.background = "#1f2937";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 4px 12px rgba(0, 0, 0, 0.15)";
              }
            }}
          >
            {loading ? "Connecting..." : "Connect to Server"}
          </button>
        </form>
      </div>

      {result && (
        <div
          style={{
            marginTop: "24px",
            padding: "16px",
            borderRadius: "8px",
            background:
              result.includes("Failed") || result.includes("Error")
                ? "#fef2f2"
                : "#f0fdf4",
            border: `1px solid ${
              result.includes("Failed") || result.includes("Error")
                ? "#fecaca"
                : "#bbf7d0"
            }`,
            color:
              result.includes("Failed") || result.includes("Error")
                ? "#dc2626"
                : "#16a34a",
            fontSize: "14px",
            fontWeight: "500",
          }}
        >
          <strong>Result:</strong> {result}
        </div>
      )}

      {/* Custom Save Profile Prompt */}
      {showSavePrompt && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "32px",
              borderRadius: "12px",
              boxShadow: "0 20px 40px rgba(0, 0, 0, 0.2)",
              maxWidth: "400px",
              width: "90%",
            }}
          >
            <h3
              style={{
                margin: "0 0 16px 0",
                fontSize: "20px",
                fontWeight: "600",
                color: "#1a1a1a",
              }}
            >
              Save Connection Profile
            </h3>
            <p
              style={{
                margin: "0 0 20px 0",
                fontSize: "14px",
                color: "#6b7280",
              }}
            >
              Connection successful! Save this connection for future use.
            </p>

            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  marginBottom: "8px",
                  fontWeight: "500",
                  color: "#374151",
                  fontSize: "14px",
                }}
              >
                Profile Name
              </label>
              <input
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                placeholder="Enter profile name"
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  border: "1px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "14px",
                  transition: "border-color 0.2s ease",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "#3b82f6";
                  e.target.style.outline = "none";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "#d1d5db";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveProfile();
                  } else if (e.key === "Escape") {
                    handleSkipSave();
                  }
                }}
                autoFocus
              />
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={handleSaveProfile}
                disabled={!newProfileName.trim()}
                style={{
                  flex: 1,
                  padding: "12px 20px",
                  borderRadius: "8px",
                  border: "none",
                  background: newProfileName.trim() ? "#3b82f6" : "#d1d5db",
                  color: "#fff",
                  cursor: newProfileName.trim() ? "pointer" : "not-allowed",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  if (newProfileName.trim()) {
                    e.currentTarget.style.background = "#2563eb";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseOut={(e) => {
                  if (newProfileName.trim()) {
                    e.currentTarget.style.background = "#3b82f6";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                Save Profile
              </button>
              <button
                onClick={handleSkipSave}
                style={{
                  padding: "12px 20px",
                  borderRadius: "8px",
                  border: "1px solid #d1d5db",
                  background: "#fff",
                  color: "#374151",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#f9fafb";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#fff";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
