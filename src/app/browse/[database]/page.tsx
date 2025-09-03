"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { use } from "react";

interface LdapEntry {
  dn: string;
  [key: string]: unknown;
}

export default function DatabasePage({
  params,
}: {
  params: Promise<{ database: string }>;
}) {
  const [url, setUrl] = useState("");
  const [bindDN, setBindDN] = useState("");
  const [password, setPassword] = useState("");
  const [insecure, setInsecure] = useState(false);
  const [entries, setEntries] = useState<LdapEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeAction, setActiveAction] = useState<string>("");
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDn, setNewDn] = useState("");
  const [newAttrs, setNewAttrs] = useState("");
  const [editingEntry, setEditingEntry] = useState<LdapEntry | null>(null);
  const [editAttrs, setEditAttrs] = useState("");

  const resolvedParams = use(params);
  const databaseName = decodeURIComponent(resolvedParams.database);

  const loadDatabaseEntries = useCallback(
    async (
      ldapUrl: string,
      ldapBindDN: string,
      ldapPassword: string,
      ldapInsecure: boolean
    ) => {
      setLoading(true);
      setError(null);

      try {
        const searchPayload = {
          url: ldapUrl,
          bindDN: ldapBindDN,
          password: ldapPassword,
          baseDN: databaseName,
          filter: "(objectClass=*)",
          tls: ldapInsecure ? { rejectUnauthorized: false } : undefined,
        };

        const res = await fetch("/api/ldap/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchPayload),
        });

        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData?.error || res.statusText);
        }

        const data = await res.json();
        if (data?.ok && data.entries) {
          setEntries(data.entries);
        } else {
          setEntries([]);
        }
      } catch (e) {
        setError((e as Error).message);
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [databaseName]
  );

  useEffect(() => {
    const connectionData = sessionStorage.getItem("ldapConnection");
    if (connectionData) {
      try {
        const config = JSON.parse(connectionData);
        setUrl(config.url || "");
        setBindDN(config.bindDN || "");
        setPassword(config.password || "");
        setInsecure(config.insecure || false);

        if (config.url && config.bindDN && config.password) {
          loadDatabaseEntries(
            config.url,
            config.bindDN,
            config.password,
            config.insecure
          );
        }
      } catch (e) {
        console.error("Failed to parse connection data:", e);
      }
    }
  }, [databaseName, loadDatabaseEntries]);

  const performSearch = async (chosenFilter: string) => {
    if (isSearching || loading) return;
    if (!url || !bindDN || !password) {
      setError("Missing connection details");
      return;
    }

    setIsSearching(true);
    setLoading(true);
    setError(null);

    try {
      const searchPayload = {
        url,
        bindDN,
        password,
        baseDN: databaseName,
        filter: chosenFilter || "(objectClass=*)",
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };

      const res = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchPayload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData?.error || res.statusText);
      }

      const data = await res.json();
      if (data?.ok && data.entries) {
        setEntries(data.entries);
      } else {
        setEntries([]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setIsSearching(false);
    }
  };

  const refreshAfterAction = async () => {
    const f =
      activeAction === "viewOUs"
        ? "(objectClass=organizationalUnit)"
        : "(objectClass=*)";
    await performSearch(f);
  };

  const sanitizeAttributes = (
    raw: Record<string, unknown>
  ): Record<string, string | string[]> => {
    const cleaned: Record<string, string | string[]> = {};
    for (const [keyRaw, valueRaw] of Object.entries(raw)) {
      const key = String(keyRaw).trim();
      if (!key || key.toLowerCase() === "dn") continue; // DN must not be in attributes
      if (valueRaw === undefined || valueRaw === null) continue;
      if (Array.isArray(valueRaw)) {
        cleaned[key] = valueRaw.map((v) => String(v));
      } else {
        cleaned[key] = [String(valueRaw)];
      }
    }
    return cleaned;
  };

  const openEdit = (entry: LdapEntry) => {
    setEditingEntry(entry);
    const clone = { ...entry } as Record<string, unknown>;
    delete (clone as Record<string, unknown>).dn;
    setEditAttrs(JSON.stringify(clone, null, 2));
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;
    if (isSubmitting) return;
    let attrs: Record<string, unknown>;
    try {
      attrs = JSON.parse(editAttrs || "{}");
    } catch {
      setError("Edited attributes must be valid JSON");
      return;
    }
    const changes = Object.entries(attrs)
      .filter(([attribute]) => attribute.toLowerCase() !== "dn")
      .map(([attribute, value]) => ({
        type: "replace" as const,
        attribute,
        values: Array.isArray(value) ? (value as unknown[]) : [value],
      }));
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ldap/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          entryDN: editingEntry.dn,
          changes,
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);
      setEditingEntry(null);
      setEditAttrs("");
      await refreshAfterAction();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (entryDn: string) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ldap/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          entryDN: entryDn,
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);
      await refreshAfterAction();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAdd = async () => {
    if (isSubmitting) return;
    if (!url || !bindDN || !password) {
      setError("Missing connection details");
      return;
    }
    if (!newDn.trim()) {
      setError("Please provide DN for the new entry");
      return;
    }
    let attrs: Record<string, string | string[]>;
    try {
      const parsed = JSON.parse(newAttrs || "{}") as Record<string, unknown>;
      attrs = sanitizeAttributes(parsed);
    } catch (e) {
      setError("Attributes must be valid JSON");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ldap/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          entryDN: newDn.trim(),
          attributes: attrs,
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);
      const addedDn = newDn.trim();
      setNewDn("");
      setNewAttrs("");
      // If the added DN is not under current base, navigate to its base so it becomes visible
      const currentBase = databaseName.toLowerCase();
      const isUnderCurrent = addedDn.toLowerCase().endsWith(currentBase);
      if (!isUnderCurrent) {
        const parts = addedDn.split(/,(.+)/); // [RDN, rest]
        if (parts.length === 2 && parts[1]) {
          const newBase = parts[1];
          if (typeof window !== "undefined") {
            window.location.href = `/browse/${encodeURIComponent(newBase)}`;
            return;
          }
        }
      }
      await refreshAfterAction();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!url || !bindDN || !password) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <h2>Connection Required</h2>
        <p>Please connect to an LDAP server first.</p>
        <Link href="/" style={{ color: "#0051c9", textDecoration: "none" }}>
          Go to Connect Page
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div style={{ marginBottom: "32px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "16px",
          }}
        >
          <Link
            href="/browse"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              color: "#6b7280",
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to Databases
          </Link>
        </div>
        <h1
          style={{
            margin: "0 0 8px 0",
            fontSize: "28px",
            fontWeight: "600",
            color: "#1a1a1a",
          }}
        >
          {databaseName}
        </h1>
        <p style={{ margin: 0, color: "#6b7280", fontSize: "16px" }}>
          Database Management - View, Create, Edit, and Delete Entries
        </p>
      </div>

      {error && (
        <div
          style={{
            padding: "16px",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            marginBottom: "24px",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: "16px",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: activeAction === "viewAll" ? "#0051c9" : "#f8fafc",
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onMouseOver={(e) => {
            if (activeAction !== "viewAll") {
              e.currentTarget.style.background = "#f1f5f9";
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseOut={(e) => {
            if (activeAction !== "viewAll") {
              e.currentTarget.style.background = "#f8fafc";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
          onClick={() => {
            const f = "(objectClass=*)";
            setActiveAction("viewAll");
            performSearch(f);
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={activeAction === "viewAll" ? "#ffffff" : "currentColor"}
              strokeWidth="2"
            >
              <path d="M9 12l2 2 4-4"></path>
              <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3z"></path>
              <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3z"></path>
            </svg>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: activeAction === "viewAll" ? "#ffffff" : "#374151",
              }}
            >
              View All Entries
            </h3>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: activeAction === "viewAll" ? "#e5e7eb" : "#6b7280",
            }}
          >
            Browse all existing entries in this database
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: activeAction === "viewOUs" ? "#0051c9" : "#f8fafc",
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onMouseOver={(e) => {
            if (activeAction !== "viewOUs") {
              e.currentTarget.style.background = "#f1f5f9";
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseOut={(e) => {
            if (activeAction !== "viewOUs") {
              e.currentTarget.style.background = "#f8fafc";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
          onClick={() => {
            const f = "(objectClass=organizationalUnit)";
            setActiveAction("viewOUs");
            performSearch(f);
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={activeAction === "viewOUs" ? "#ffffff" : "currentColor"}
              strokeWidth="2"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
            </svg>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: activeAction === "viewOUs" ? "#ffffff" : "#374151",
              }}
            >
              View OUs Only
            </h3>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: activeAction === "viewOUs" ? "#e5e7eb" : "#6b7280",
            }}
          >
            Show only organizational units
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: activeAction === "addNew" ? "#0051c9" : "#f8fafc",
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onMouseOver={(e) => {
            if (activeAction !== "addNew") {
              e.currentTarget.style.background = "#f1f5f9";
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseOut={(e) => {
            if (activeAction !== "addNew") {
              e.currentTarget.style.background = "#f8fafc";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
          onClick={() => {
            setActiveAction("addNew");
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginBottom: "8px",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke={activeAction === "addNew" ? "#ffffff" : "currentColor"}
              strokeWidth="2"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: activeAction === "addNew" ? "#ffffff" : "#374151",
              }}
            >
              Add New Entry
            </h3>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: activeAction === "addNew" ? "#e5e7eb" : "#6b7280",
            }}
          >
            Create new organizational units or users
          </p>
        </div>
      </div>

      {activeAction === "addNew" && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#fff",
            padding: "20px",
            marginBottom: "24px",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", color: "#111827" }}>
            Add New Entry
          </h3>
          <div style={{ display: "grid", gap: "12px" }}>
            <input
              placeholder="Entry DN (e.g., ou=NewOU,dc=example,dc=com)"
              value={newDn}
              onChange={(e) => setNewDn(e.target.value)}
              style={{
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "14px",
              }}
            />
            <textarea
              placeholder='Attributes JSON, e.g. {"objectClass":["top","organizationalUnit"],"ou":"NewOU"}'
              value={newAttrs}
              onChange={(e) => setNewAttrs(e.target.value)}
              rows={6}
              style={{
                padding: "10px 12px",
                border: "1px solid #e5e7eb",
                borderRadius: "8px",
                fontSize: "13px",
                fontFamily:
                  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \\"Liberation Mono\\", \\"Courier New\\", monospace',
              }}
            />
            <div>
              <button
                onClick={handleAdd}
                disabled={isSubmitting}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0051c9",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {isSubmitting ? "Adding..." : "Add Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {entries && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#fff",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "20px",
              borderBottom: "1px solid #e5e7eb",
              background: "#fafafa",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: "600",
                color: "#374151",
              }}
            >
              Search Results ({entries.length} entries)
            </h3>
          </div>
          <div style={{ padding: "20px" }}>
            {entries.map((entry, index) => (
              <div
                key={index}
                style={{
                  padding: "16px",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                  marginBottom: "12px",
                  background: "#f9fafb",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <strong style={{ color: "#374151" }}>{entry.dn}</strong>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => openEdit(entry)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background: "#0051c9",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(entry.dn)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: "4px",
                        border: "none",
                        background: "#ef4444",
                        color: "#fff",
                        cursor: "pointer",
                        fontSize: "12px",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <pre
                  style={{
                    margin: 0,
                    fontSize: "12px",
                    color: "#6b7280",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {JSON.stringify(entry, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {editingEntry && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#fff",
            padding: "20px",
            marginTop: "16px",
          }}
        >
          <h3 style={{ margin: "0 0 12px 0", color: "#111827" }}>Edit Entry</h3>
          <div
            style={{ marginBottom: "8px", color: "#374151", fontSize: "14px" }}
          >
            {editingEntry.dn}
          </div>
          <textarea
            value={editAttrs}
            onChange={(e) => setEditAttrs(e.target.value)}
            rows={8}
            style={{
              width: "100%",
              padding: "10px 12px",
              border: "1px solid #e5e7eb",
              borderRadius: "8px",
              fontSize: "13px",
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \\"Liberation Mono\\", \\"Courier New\\", monospace',
            }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
            <button
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                border: "none",
                background: "#0051c9",
                color: "#fff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => {
                setEditingEntry(null);
                setEditAttrs("");
              }}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#374151",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
