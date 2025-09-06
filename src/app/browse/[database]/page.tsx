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
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showJsonDetails, setShowJsonDetails] = useState(false);
  const [quickAddData, setQuickAddData] = useState({
    cn: "",
    hostname: "",
    port: "",
    tlsCipherSuites: ["TLS_RSA_WITH_AES_128_CBC_SHA"],
    noTls: false,
    clientBindAddress: "0.0.0.0",
    bindAddress: "0.0.0.0",
    maxOpsInvoked: "0",
    maxOpsPerformed: "0",
  });

  const tlsCipherSuiteOptions = [
    "SSL_RSA_WITH_3DES_EDE_CBC_SHA",
    "SSL_RSA_WITH_NULL_SHA",
    "TLS_DHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_DHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_RSA_WITH_AES_128_CBC_SHA",
  ];

  const isDicomPortEntry = (entry: LdapEntry): boolean => {
    return entry.dicomPort !== undefined && entry.dicomHostname !== undefined;
  };

  const formatDicomEntry = (entry: LdapEntry) => {
    const cn = String(entry.cn || "Unknown");
    const hostname = String(entry.dicomHostname || "Not specified");
    const port = String(entry.dicomPort || "Not specified");
    const deviceName = String(entry.dicomDeviceName || "Unknown Device");

    return {
      name: cn,
      hostname,
      port,
      deviceName,
      hasTls:
        entry.dicomTLSCipherSuite &&
        Array.isArray(entry.dicomTLSCipherSuite) &&
        entry.dicomTLSCipherSuite.length > 0,
      clientBindAddress: String(entry.dcmClientBindAddress || "0.0.0.0"),
      bindAddress: String(entry.dcmBindAddress || "0.0.0.0"),
      maxOpsInvoked: String(entry.dcmMaxOpsInvoked || "0"),
      maxOpsPerformed: String(entry.dcmMaxOpsPerformed || "0"),
    };
  };

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
    let f = "(objectClass=*)";
    if (activeAction === "viewOUs") {
      f = "(objectClass=organizationalUnit)";
    } else if (activeAction === "viewDicomPorts") {
      f = "(dicomPort=*)";
    }
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

  const handleQuickAdd = async () => {
    if (isSubmitting) return;
    if (!url || !bindDN || !password) {
      setError("Missing connection details");
      return;
    }
    if (!quickAddData.cn.trim()) {
      setError("Please provide a name (cn) for the new connection");
      return;
    }

    const dn = `cn=${quickAddData.cn.trim()},dicomDeviceName=dcm4chee-arc,cn=Devices,cn=DICOM Configuration,dc=dcm4che,dc=org`;
    const attrs: Record<string, string | string[]> = {
      objectClass: ["dicomNetworkConnection", "dcmNetworkConnection"],
      cn: quickAddData.cn.trim(),
      dicomHostname: quickAddData.hostname,
      dicomPort: quickAddData.port,
      dcmClientBindAddress: quickAddData.clientBindAddress,
      dcmBindAddress: quickAddData.bindAddress,
      dcmMaxOpsInvoked: quickAddData.maxOpsInvoked,
      dcmMaxOpsPerformed: quickAddData.maxOpsPerformed,
    };

    // Only add dicomTLSCipherSuite if there are selected cipher suites and noTls is false
    if (!quickAddData.noTls && quickAddData.tlsCipherSuites.length > 0) {
      attrs.dicomTLSCipherSuite = quickAddData.tlsCipherSuites;
    }

    // Check parent exists
    const parentDn = `dicomDeviceName=dcm4chee-arc,cn=Devices,cn=DICOM Configuration,dc=dcm4che,dc=org`;
    setIsSubmitting(true);
    setError(null);
    try {
      const parentCheck = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          baseDN: parentDn,
          scope: "base",
          filter: "(objectClass=*)",
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });
      const parentData = await parentCheck.json();
      if (
        !parentCheck.ok ||
        !parentData?.ok ||
        parentData?.entries?.length !== 1
      ) {
        throw new Error(
          `Parent DN not found: ${parentDn}. Create the parent entry first.`
        );
      }

      const res = await fetch("/api/ldap/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          entryDN: dn,
          attributes: attrs,
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || res.statusText);

      setShowQuickAddModal(false);
      setQuickAddData({
        cn: "",
        hostname: "localhost",
        port: "11112",
        tlsCipherSuites: ["TLS_RSA_WITH_AES_128_CBC_SHA"],
        noTls: false,
        clientBindAddress: "0.0.0.0",
        bindAddress: "0.0.0.0",
        maxOpsInvoked: "0",
        maxOpsPerformed: "0",
      });
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
    } catch {
      setError("Attributes must be valid JSON");
      return;
    }

    // Require objectClass for new entries
    const hasObjectClass = Object.keys(attrs).some(
      (k) => k.toLowerCase() === "objectclass"
    );
    if (!hasObjectClass) {
      setError("Attributes must include objectClass");
      return;
    }

    // Determine parent DN and ensure it exists to avoid LDAP 0x35 errors
    const dnTrimmed = newDn.trim();
    // Compute parent DN by taking everything after the first unescaped comma
    // Handles extra spaces after the comma as well.
    const firstCommaIndex = dnTrimmed.indexOf(",");
    const parentDn =
      firstCommaIndex >= 0 ? dnTrimmed.slice(firstCommaIndex + 1).trim() : "";
    if (!parentDn) {
      setError(
        "Unable to determine parent DN. Provide a DN with a parent, e.g., cn=John,ou=People,dc=example,dc=com"
      );
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      // Verify parent entry exists
      const parentCheck = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          baseDN: parentDn,
          scope: "base",
          filter: "(objectClass=*)",
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });
      const parentData = await parentCheck.json();
      if (
        !parentCheck.ok ||
        !parentData?.ok ||
        parentData?.entries?.length !== 1
      ) {
        throw new Error(
          `Parent DN not found: ${parentDn}. Create the parent entry first.`
        );
      }

      const res = await fetch("/api/ldap/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          entryDN: dnTrimmed,
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

        <div
          style={{
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background:
              activeAction === "viewDicomPorts" ? "#0051c9" : "#f8fafc",
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onMouseOver={(e) => {
            if (activeAction !== "viewDicomPorts") {
              e.currentTarget.style.background = "#f1f5f9";
              e.currentTarget.style.borderColor = "#cbd5e1";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          }}
          onMouseOut={(e) => {
            if (activeAction !== "viewDicomPorts") {
              e.currentTarget.style.background = "#f8fafc";
              e.currentTarget.style.borderColor = "#e5e7eb";
              e.currentTarget.style.transform = "translateY(0)";
            }
          }}
          onClick={() => {
            const f = "(dicomPort=*)";
            setActiveAction("viewDicomPorts");
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
              stroke={
                activeAction === "viewDicomPorts" ? "#ffffff" : "currentColor"
              }
              strokeWidth="2"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color:
                  activeAction === "viewDicomPorts" ? "#ffffff" : "#374151",
              }}
            >
              View DICOM Port Entries
            </h3>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: activeAction === "viewDicomPorts" ? "#e5e7eb" : "#6b7280",
            }}
          >
            Show entries with DICOM port configuration
          </p>
        </div>

        <div
          style={{
            padding: "20px",
            border: "1px solid #e5e7eb",
            borderRadius: "12px",
            background: "#f8fafc",
            cursor: "pointer",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "#f1f5f9";
            e.currentTarget.style.borderColor = "#cbd5e1";
            e.currentTarget.style.transform = "translateY(-1px)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "#f8fafc";
            e.currentTarget.style.borderColor = "#e5e7eb";
            e.currentTarget.style.transform = "translateY(0)";
          }}
          onClick={() => {
            setShowQuickAddModal(true);
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
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path>
            </svg>
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: "#374151",
              }}
            >
              Quick Add DICOM Connection
            </h3>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "#6b7280",
            }}
          >
            Add DICOM network connection with form fields
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
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
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
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={showJsonDetails}
                  onChange={(e) => setShowJsonDetails(e.target.checked)}
                  style={{
                    width: "16px",
                    height: "16px",
                    accentColor: "#0051c9",
                  }}
                />
                <span style={{ fontSize: "14px", color: "#6b7280" }}>
                  Show JSON Details
                </span>
              </label>
            </div>
          </div>
          <div style={{ padding: "20px" }}>
            {entries.map((entry, index) => {
              const isDicom = isDicomPortEntry(entry);
              const dicomData = isDicom ? formatDicomEntry(entry) : null;

              return (
                <div
                  key={index}
                  style={{
                    padding: "20px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "12px",
                    marginBottom: "16px",
                    background: isDicom ? "#f8fafc" : "#f9fafb",
                    borderLeft: isDicom
                      ? "4px solid #0051c9"
                      : "4px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: isDicom ? "16px" : "8px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <strong style={{ color: "#374151", fontSize: "16px" }}>
                        {entry.dn}
                      </strong>
                      {isDicom && dicomData && (
                        <div style={{ marginTop: "12px" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(200px, 1fr))",
                              gap: "16px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    fontSize: "14px",
                                  }}
                                >
                                  Connection Name:
                                </span>
                                <div
                                  style={{
                                    color: "#6b7280",
                                    fontSize: "14px",
                                    marginTop: "2px",
                                  }}
                                >
                                  {dicomData.name}
                                </div>
                              </div>
                              <div>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    fontSize: "14px",
                                  }}
                                >
                                  Device Name:
                                </span>
                                <div
                                  style={{
                                    color: "#6b7280",
                                    fontSize: "14px",
                                    marginTop: "2px",
                                  }}
                                >
                                  {dicomData.deviceName}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    fontSize: "14px",
                                  }}
                                >
                                  Hostname:
                                </span>
                                <div
                                  style={{
                                    color: "#6b7280",
                                    fontSize: "14px",
                                    marginTop: "2px",
                                  }}
                                >
                                  {dicomData.hostname}
                                </div>
                              </div>
                              <div>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    fontSize: "14px",
                                  }}
                                >
                                  Port:
                                </span>
                                <div
                                  style={{
                                    color: "#6b7280",
                                    fontSize: "14px",
                                    marginTop: "2px",
                                  }}
                                >
                                  {dicomData.port}
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "8px",
                              }}
                            >
                              <div>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    fontSize: "14px",
                                  }}
                                >
                                  TLS Security:
                                </span>
                                <div
                                  style={{
                                    color: dicomData.hasTls
                                      ? "#059669"
                                      : "#dc2626",
                                    fontSize: "14px",
                                    marginTop: "2px",
                                    fontWeight: "500",
                                  }}
                                >
                                  {dicomData.hasTls
                                    ? "✓ Enabled"
                                    : "✗ Disabled"}
                                </div>
                              </div>
                              <div>
                                <span
                                  style={{
                                    fontWeight: "600",
                                    color: "#374151",
                                    fontSize: "14px",
                                  }}
                                >
                                  Client Bind:
                                </span>
                                <div
                                  style={{
                                    color: "#6b7280",
                                    fontSize: "14px",
                                    marginTop: "2px",
                                  }}
                                >
                                  {dicomData.clientBindAddress}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        marginLeft: "16px",
                      }}
                    >
                      <button
                        onClick={() => openEdit(entry)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "6px",
                          border: "none",
                          background: "#0051c9",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(entry.dn)}
                        style={{
                          padding: "8px 16px",
                          borderRadius: "6px",
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "14px",
                          fontWeight: "500",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {showJsonDetails && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "12px",
                        background: "#f3f4f6",
                        borderRadius: "8px",
                      }}
                    >
                      <div
                        style={{
                          marginBottom: "8px",
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        Raw JSON Data:
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: "12px",
                          color: "#6b7280",
                          whiteSpace: "pre-wrap",
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                        }}
                      >
                        {JSON.stringify(entry, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
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

      {showQuickAddModal && (
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
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowQuickAddModal(false);
            }
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "90%",
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "20px",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "20px", fontWeight: "600" }}>
                Quick Add DICOM Connection
              </h2>
              <button
                onClick={() => setShowQuickAddModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: "#6b7280",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: "grid", gap: "16px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Connection Name (cn) *
                </label>
                <input
                  type="text"
                  value={quickAddData.cn}
                  onChange={(e) =>
                    setQuickAddData({ ...quickAddData, cn: e.target.value })
                  }
                  placeholder="e.g., dicom"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Hostname
                </label>
                <input
                  placeholder="e.g., localhost"
                  type="text"
                  value={quickAddData.hostname}
                  onChange={(e) =>
                    setQuickAddData({
                      ...quickAddData,
                      hostname: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Port
                </label>
                <input
                  placeholder="e.g., 8080"
                  type="text"
                  value={quickAddData.port}
                  onChange={(e) =>
                    setQuickAddData({ ...quickAddData, port: e.target.value })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Client Bind Address
                </label>
                <input
                  type="text"
                  value={quickAddData.clientBindAddress}
                  onChange={(e) =>
                    setQuickAddData({
                      ...quickAddData,
                      clientBindAddress: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Bind Address
                </label>
                <input
                  type="text"
                  value={quickAddData.bindAddress}
                  onChange={(e) =>
                    setQuickAddData({
                      ...quickAddData,
                      bindAddress: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Max Ops Invoked
                </label>
                <input
                  type="text"
                  value={quickAddData.maxOpsInvoked}
                  onChange={(e) =>
                    setQuickAddData({
                      ...quickAddData,
                      maxOpsInvoked: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "4px",
                    fontWeight: "500",
                  }}
                >
                  Max Ops Performed
                </label>
                <input
                  type="text"
                  value={quickAddData.maxOpsPerformed}
                  onChange={(e) =>
                    setQuickAddData({
                      ...quickAddData,
                      maxOpsPerformed: e.target.value,
                    })
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #e5e7eb",
                    borderRadius: "6px",
                    fontSize: "14px",
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "600",
                    fontSize: "16px",
                    color: "#374151",
                  }}
                >
                  TLS CipherSuites
                </label>

                <div
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    padding: "16px",
                    backgroundColor: "#fafafa",
                    maxHeight: "200px",
                    overflowY: "auto",
                  }}
                >
                  <div style={{ marginBottom: "12px" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        cursor: "pointer",
                        padding: "4px 0",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={quickAddData.noTls}
                        onChange={(e) => {
                          setQuickAddData({
                            ...quickAddData,
                            noTls: e.target.checked,
                            tlsCipherSuites: e.target.checked
                              ? []
                              : ["TLS_RSA_WITH_AES_128_CBC_SHA"],
                          });
                        }}
                        style={{
                          width: "16px",
                          height: "16px",
                          accentColor: "#0051c9",
                        }}
                      />
                      <span style={{ fontWeight: "500", color: "#6b7280" }}>
                        No TLS (TLS disabled)
                      </span>
                    </label>
                  </div>

                  <div
                    style={{
                      marginBottom: "8px",
                      fontSize: "14px",
                      color: "#6b7280",
                    }}
                  >
                    The TLS CipherSuites that are supported on this particular
                    connection. If not present TLS is disabled.
                  </div>

                  {tlsCipherSuiteOptions.map((option) => (
                    <div key={option} style={{ marginBottom: "8px" }}>
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          cursor: "pointer",
                          padding: "4px 0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={quickAddData.tlsCipherSuites.includes(
                            option
                          )}
                          disabled={quickAddData.noTls}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setQuickAddData({
                                ...quickAddData,
                                tlsCipherSuites: [
                                  ...quickAddData.tlsCipherSuites,
                                  option,
                                ],
                                noTls: false,
                              });
                            } else {
                              setQuickAddData({
                                ...quickAddData,
                                tlsCipherSuites:
                                  quickAddData.tlsCipherSuites.filter(
                                    (suite) => suite !== option
                                  ),
                              });
                            }
                          }}
                          style={{
                            width: "16px",
                            height: "16px",
                            accentColor: "#0051c9",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "13px",
                            fontFamily: "monospace",
                            color: quickAddData.noTls ? "#9ca3af" : "#374151",
                          }}
                        >
                          {option}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: "12px",
                marginTop: "24px",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowQuickAddModal(false)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "6px",
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  color: "#374151",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleQuickAdd}
                disabled={isSubmitting}
                style={{
                  padding: "10px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background: "#0051c9",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {isSubmitting ? "Adding..." : "Add Connection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
