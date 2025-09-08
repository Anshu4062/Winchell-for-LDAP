"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";

export default function Browse() {
  const [url, setUrl] = useState("");
  const [bindDN, setBindDN] = useState("");
  const [password, setPassword] = useState("");
  const [baseDN, setBaseDN] = useState("");
  const [filter, setFilter] = useState("(objectClass=*)");
  const [insecure, setInsecure] = useState(false);
  type LdapEntry = { dn: string; [key: string]: unknown };
  const [entries, setEntries] = useState<LdapEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDn, setNewDn] = useState("");
  const [newAttrs, setNewAttrs] = useState(
    '{\n  "objectClass": ["top", "organizationalUnit"],\n  "ou": "TestOU"\n}'
  );
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>("");
  const [loadingDatabases, setLoadingDatabases] = useState(false);
  const [treeStructure, setTreeStructure] = useState<{
    [key: string]: { children: string[]; type: string; dn: string };
  }>({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loadingTree] = useState(false);
  const connectionLoadedRef = useRef(false);
  const [showDicomConnections, setShowDicomConnections] = useState(false);
  const [dicomEntries, setDicomEntries] = useState<LdapEntry[]>([]);
  const [selectedDicomEntry, setSelectedDicomEntry] =
    useState<LdapEntry | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({
    cn: "",
    hostname: "",
    port: "",
  });
  const [showDicomAETitle, setShowDicomAETitle] = useState(false);
  const [dicomAEEntries, setDicomAEEntries] = useState<LdapEntry[]>([]);
  const [selectedAEEntry, setSelectedAEEntry] = useState<LdapEntry | null>(
    null
  );
  const [showAEEditModal, setShowAEEditModal] = useState(false);
  const [aeEditFormData, setAEEditFormData] = useState({
    dicomAETitle: "",
  });

  useEffect(() => {
    console.log("🔄 [DEBUG] Initial useEffect triggered");

    const raw = sessionStorage.getItem("ldapConnection");
    console.log(
      "🔍 [DEBUG] Raw sessionStorage data:",
      raw ? "exists" : "not found"
    );

    if (raw) {
      try {
        const cfg = JSON.parse(raw) as {
          url: string;
          bindDN: string;
          password: string;
          insecure?: boolean;
          baseDN?: string;
        };
        console.log("🔍 [DEBUG] Parsed connection config:", {
          ...cfg,
          password: cfg.password ? "***" : "undefined",
        });

        console.log("🔧 [DEBUG] About to set state variables");
        setUrl(cfg.url || "");
        setBindDN(cfg.bindDN || "");
        setPassword(cfg.password || "");
        setInsecure(!!cfg.insecure);
        if (cfg.baseDN) {
          setBaseDN(cfg.baseDN);
        }

        console.log("✅ [DEBUG] Connection details set from sessionStorage");
        console.log("🔧 [DEBUG] State variables set to:", {
          url: cfg.url || "",
          bindDN: cfg.bindDN || "",
          password: cfg.password ? "***" : "undefined",
          insecure: !!cfg.insecure,
        });

        // Mark that connection details have been loaded
        connectionLoadedRef.current = true;
        console.log("🔧 [DEBUG] connectionLoadedRef set to true");
      } catch (err) {
        console.error("❌ [DEBUG] Failed to parse sessionStorage:", err);
      }
    } else {
      console.log("⚠️ [DEBUG] No connection details found in sessionStorage");
    }

    // Load saved databases from localStorage
    const savedDatabases = JSON.parse(
      localStorage.getItem("ldapDatabases") || "[]"
    );
    console.log(
      "💾 [DEBUG] Saved databases from localStorage:",
      savedDatabases
    );

    if (savedDatabases.length > 0) {
      setDatabases(savedDatabases);
      if (!selectedDatabase) {
        console.log(
          "🎯 [DEBUG] Auto-selecting first saved database:",
          savedDatabases[0]
        );
        setSelectedDatabase(savedDatabases[0]);
        setBaseDN(savedDatabases[0]);
      }
    }

    console.log("🏁 [DEBUG] Initial useEffect completed");

    // Cleanup function to reset the ref
    return () => {
      connectionLoadedRef.current = false;
      console.log("🧹 [DEBUG] connectionLoadedRef reset to false");
    };
  }, []);

  async function loadDatabases() {
    console.log("🔍 [DEBUG] loadDatabases() called");
    console.log("🔍 [DEBUG] Connection details:", {
      url,
      bindDN,
      password: password ? "***" : "undefined",
      insecure,
    });

    if (!url || !bindDN || !password) {
      console.log("❌ [DEBUG] Missing connection details:", {
        hasUrl: !!url,
        hasBindDN: !!bindDN,
        hasPassword: !!password,
      });
      return;
    }

    setLoadingDatabases(true);
    try {
      // First try to load from localStorage for persistence
      const savedDatabases = JSON.parse(
        localStorage.getItem("ldapDatabases") || "[]"
      );
      console.log(
        "💾 [DEBUG] Saved databases from localStorage:",
        savedDatabases
      );

      // Try to discover base DNs from LDAP server using root DSE search
      const discoveredDatabases: string[] = [];

      try {
        // Try to discover existing databases by searching from the root
        console.log("🔍 [DEBUG] Starting database discovery...");

        // First try to search from root to find existing base DNs
        try {
          const rootSearchPayload = {
            url,
            bindDN,
            password,
            baseDN: "dc=dcm4che,dc=org", // Use the actual base DN
            filter: "(objectClass=*)",
            scope: "one", // Only immediate children
            tls: insecure ? { rejectUnauthorized: false } : undefined,
          };

          console.log("🔍 [DEBUG] Trying to discover databases from root...");

          const rootRes = await fetch("/api/ldap/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(rootSearchPayload),
          });

          if (rootRes.ok) {
            const rootData = await rootRes.json();
            if (rootData?.ok && rootData.entries) {
              // Extract DNs that look like base DNs
              const foundDNs = rootData.entries
                .map((entry: LdapEntry) => entry.dn)
                .filter((dn: string) => {
                  // Look for entries that could be base DNs
                  return (
                    dn.includes("dc=") ||
                    dn.includes("ou=") ||
                    dn.includes("o=")
                  );
                });

              discoveredDatabases.push(...foundDNs);
              console.log("🔍 [DEBUG] Found base DNs from root:", foundDNs);
            }
          } else {
            console.log(
              "⚠️ [DEBUG] Root search failed, trying common base DNs..."
            );

            // Fallback: try common base DNs
            const commonBaseDNs = [
              "dc=dcm4che,dc=org", // Primary domain
              "dc=example,dc=com",
              "dc=test,dc=com",
              "dc=local",
              "dc=internal",
              "dc=corp",
            ];

            for (const baseDN of commonBaseDNs) {
              try {
                const searchPayload = {
                  url,
                  bindDN,
                  password,
                  baseDN: baseDN,
                  filter: "(objectClass=*)",
                  scope: "base", // Check if this DN exists
                  tls: insecure ? { rejectUnauthorized: false } : undefined,
                };

                console.log("🔍 [DEBUG] Checking if base DN exists:", baseDN);

                const res = await fetch("/api/ldap/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(searchPayload),
                });

                if (res.ok) {
                  const data = await res.json();
                  if (data?.ok) {
                    discoveredDatabases.push(baseDN);
                    console.log("🔍 [DEBUG] Found existing base DN:", baseDN);
                  }
                }
              } catch (err) {
                console.log(
                  "⚠️ [DEBUG] Failed to check base DN",
                  baseDN,
                  ":",
                  err
                );
                continue;
              }
            }
          }
        } catch (err) {
          console.log("⚠️ [DEBUG] Root search failed:", err);
        }
      } catch (err) {
        console.log("⚠️ [DEBUG] Database discovery failed:", err);
      }

      // Merge discovered databases with saved ones
      const dbList = [
        ...new Set([...savedDatabases, ...discoveredDatabases]),
      ].sort();

      console.log("✅ [DEBUG] Final database list:", dbList);
      setDatabases(dbList);

      // Update localStorage with the merged list
      if (dbList.length > 0) {
        localStorage.setItem("ldapDatabases", JSON.stringify(dbList));
        console.log("💾 [DEBUG] Updated localStorage with databases");
      }

      if (dbList.length > 0 && !selectedDatabase) {
        console.log("🎯 [DEBUG] Auto-selecting first database:", dbList[0]);
        setSelectedDatabase(dbList[0]);
        setBaseDN(dbList[0]);
      }
    } catch (err) {
      console.error("❌ [DEBUG] Failed to load databases:", err);
      // Fallback to saved databases
      const savedDatabases = JSON.parse(
        localStorage.getItem("ldapDatabases") || "[]"
      );
      console.log("🔄 [DEBUG] Fallback to saved databases:", savedDatabases);
      setDatabases(savedDatabases);
      if (savedDatabases.length > 0 && !selectedDatabase) {
        setSelectedDatabase(savedDatabases[0]);
        setBaseDN(savedDatabases[0]);
      }
    } finally {
      setLoadingDatabases(false);
      console.log("🏁 [DEBUG] loadDatabases() completed");
    }
  }

  useEffect(() => {
    console.log("🔄 [DEBUG] Connection useEffect triggered");
    console.log(
      "🔍 [DEBUG] connectionLoadedRef.current:",
      connectionLoadedRef.current
    );
    console.log("🔍 [DEBUG] Current state:", {
      url: !!url,
      bindDN: !!bindDN,
      password: !!password,
      insecure,
    });
    console.log("🔍 [DEBUG] Actual state values:", {
      url: url,
      bindDN: bindDN,
      password: password ? "***" : "undefined",
      insecure,
    });

    // Only proceed if connection details have been loaded from sessionStorage
    if (!connectionLoadedRef.current) {
      console.log(
        "⚠️ [DEBUG] Connection not yet loaded from sessionStorage, skipping"
      );
      return;
    }

    if (url && bindDN && password) {
      console.log(
        "✅ [DEBUG] All connection details present, calling loadDatabases()"
      );
      loadDatabases();
    } else {
      console.log(
        "⚠️ [DEBUG] Missing connection details, skipping loadDatabases()"
      );
    }
  }, [url, bindDN, password]);

  // Update the new DN field when a database is selected
  useEffect(() => {
    if (selectedDatabase) {
      // Suggest a new entry DN based on the selected database
      const baseParts = selectedDatabase.split(",");

      // If the selected database starts with 'ou=', suggest creating under it
      // If it starts with 'dc=', suggest creating an 'ou' under it
      let suggestedDN: string;
      if (selectedDatabase.startsWith("ou=")) {
        suggestedDN = `ou=NewOU,${baseParts.join(",")}`;
        setNewAttrs(
          `{\n  "objectClass": ["top", "organizationalUnit"],\n  "ou": "NewOU"\n}`
        );
      } else if (selectedDatabase.startsWith("dc=")) {
        suggestedDN = `ou=NewOU,${baseParts.join(",")}`;
        setNewAttrs(
          `{\n  "objectClass": ["top", "organizationalUnit"],\n  "ou": "NewOU"\n}`
        );
      } else {
        // Generic fallback
        suggestedDN = `ou=NewOU,${baseParts.join(",")}`;
        setNewAttrs(
          `{\n  "objectClass": ["top", "organizationalUnit"],\n  "ou": "NewOU"\n}`
        );
      }

      setNewDn(suggestedDN);
    }
  }, [selectedDatabase]);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    console.log("🔍 [DEBUG] onSearch() called");
    console.log("🔍 [DEBUG] Search parameters:", {
      baseDN,
      filter,
      url,
      bindDN,
      password: password ? "***" : "undefined",
      insecure,
    });

    setLoading(true);
    setError(null);
    setEntries(null);
    try {
      const searchPayload = {
        url,
        bindDN,
        password,
        baseDN,
        filter,
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };
      console.log("🔍 [DEBUG] Sending search request:", {
        ...searchPayload,
        password: "***",
      });

      const res = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchPayload),
      });

      console.log(
        "📡 [DEBUG] Search response status:",
        res.status,
        res.statusText
      );

      const data = await res.json();
      console.log("📊 [DEBUG] Search response data:", data);

      if (res.ok && data?.ok) {
        console.log(
          "✅ [DEBUG] Search successful, entries found:",
          data.entries?.length || 0
        );
        setEntries(data.entries || []);

        // Build tree structure from entries
        if (data.entries && data.entries.length > 0) {
          const tree = buildTreeStructure(data.entries);
          setTreeStructure(tree);
          console.log("🌳 [DEBUG] Built tree structure:", tree);
        }
      } else {
        const errorMsg = data?.error || res.statusText;
        console.log("❌ [DEBUG] Search failed with error:", errorMsg);

        if (
          errorMsg.includes("0x35") ||
          errorMsg.includes("no global superior knowledge")
        ) {
          const error = `Database "${baseDN}" doesn't exist on the LDAP server yet. Try creating it first or check if you have the correct base DN.`;
          console.log("❌ [DEBUG] Setting 0x35 error:", error);
          setError(error);
        } else {
          console.log("❌ [DEBUG] Setting generic error:", errorMsg);
          setError(errorMsg);
        }
      }
    } catch (err) {
      console.error("❌ [DEBUG] Search exception:", err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
      console.log("🏁 [DEBUG] onSearch() completed");
    }
  }

  /*
  async function handleDatabaseClick(database: string) {
    setSelectedDatabase(database);
    setBaseDN(database);
    setEntries(null);
    setError(null);
    setTreeStructure({});
    setExpandedNodes(new Set());
    setLoadingTree(true);

    // Automatically search for entries in this database to build tree structure
    if (url && bindDN && password) {
      try {
        console.log(
          "🔍 [DEBUG] Auto-searching database for tree structure:",
          database
        );

        const searchPayload = {
          url,
          bindDN,
          password,
          baseDN: database,
          filter: "(objectClass=*)",
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        };

        const res = await fetch("/api/ldap/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(searchPayload),
        });

        if (res.ok) {
          const data = await res.json();
          if (data?.ok && data.entries && data.entries.length > 0) {
            console.log(
              "✅ [DEBUG] Auto-search successful, building tree structure"
            );
            setEntries(data.entries);

            // Build tree structure from entries
            const tree = buildTreeStructure(data.entries);
            setTreeStructure(tree);
            console.log(
              "🌳 [DEBUG] Built tree structure from auto-search:",
              tree
            );
          } else {
            console.log("⚠️ [DEBUG] Auto-search returned no entries");
          }
        } else {
          console.log("⚠️ [DEBUG] Auto-search failed:", res.status);
        }
      } catch (err) {
        console.error("❌ [DEBUG] Auto-search error:", err);
      } finally {
        setLoadingTree(false);
      }
    } else {
      setLoadingTree(false);
    }
  }
  */

  function removeDatabase(database: string) {
    if (confirm(`Remove database "${database}" from the list?`)) {
      const updatedDatabases = databases.filter((db) => db !== database);
      setDatabases(updatedDatabases);
      localStorage.setItem("ldapDatabases", JSON.stringify(updatedDatabases));

      // If the removed database was selected, select another one
      if (selectedDatabase === database) {
        if (updatedDatabases.length > 0) {
          setSelectedDatabase(updatedDatabases[0]);
          setBaseDN(updatedDatabases[0]);
        } else {
          setSelectedDatabase("");
          setBaseDN("");
        }
        setEntries(null);
        setError(null);
      }
    }
  }

  // FIXED: Proper LDAP entry creation following schema rules
  async function createDatabaseOnServer(dn: string) {
    console.log("🏗️ [DEBUG] createDatabaseOnServer() called with DN:", dn);

    try {
      // Parse the DN to determine the appropriate objectClass and attributes
      const dnParts = dn.split(",");
      const firstPart = dnParts[0].trim();
      console.log("🔍 [DEBUG] Parsed DN parts:", { dnParts, firstPart });

      // Check if parent DN exists first
      if (dnParts.length > 1) {
        const parentDN = dnParts.slice(1).join(",");
        console.log("🔍 [DEBUG] Checking if parent DN exists:", parentDN);

        // Special handling for top-level domains like dc=org, dc=com, etc.
        if (dnParts.length === 2 && firstPart.startsWith("dc=")) {
          console.log(
            "🔍 [DEBUG] This appears to be a top-level domain creation"
          );

          try {
            // Try to create the parent DN first
            console.log(
              "🏗️ [DEBUG] Attempting to create top-level parent DN:",
              parentDN
            );
            const parentCreated = await createDatabaseOnServer(parentDN);
            if (!parentCreated) {
              console.log(
                "❌ [DEBUG] Failed to create top-level parent DN:",
                parentDN
              );
              // For top-level domains, we might need to skip this check
              console.log(
                "⚠️ [DEBUG] Skipping parent DN check for top-level domain"
              );
            } else {
              console.log(
                "✅ [DEBUG] Successfully created top-level parent DN:",
                parentDN
              );
            }
          } catch (err) {
            console.error(
              "❌ [DEBUG] Error creating top-level parent DN:",
              err
            );
            console.log(
              "⚠️ [DEBUG] Continuing with top-level domain creation despite parent DN error"
            );
          }
        } else {
          // Normal parent DN handling for non-top-level domains
          try {
            const checkRes = await fetch("/api/ldap/search", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url,
                bindDN,
                password,
                baseDN: parentDN,
                filter: "(objectClass=*)",
                scope: "base",
                tls: insecure ? { rejectUnauthorized: false } : undefined,
              }),
            });

            if (!checkRes.ok) {
              console.log(
                "❌ [DEBUG] Parent DN check failed:",
                checkRes.status
              );
              // Try to create the parent DN recursively
              console.log(
                "🏗️ [DEBUG] Attempting to create parent DN recursively:",
                parentDN
              );
              const parentCreated = await createDatabaseOnServer(parentDN);
              if (!parentCreated) {
                console.log(
                  "❌ [DEBUG] Failed to create parent DN recursively:",
                  parentDN
                );
                return false;
              }
              console.log(
                "✅ [DEBUG] Parent DN created recursively:",
                parentDN
              );
            } else {
              const checkData = await checkRes.json();
              if (!checkData?.ok) {
                console.log("❌ [DEBUG] Parent DN doesn't exist:", parentDN);
                // Try to create the parent DN recursively
                console.log(
                  "🏗️ [DEBUG] Attempting to create parent DN recursively:",
                  parentDN
                );
                const parentCreated = await createDatabaseOnServer(parentDN);
                if (!parentCreated) {
                  console.log(
                    "❌ [DEBUG] Failed to create parent DN recursively:",
                    parentDN
                  );
                  return false;
                }
                console.log(
                  "✅ [DEBUG] Parent DN created recursively:",
                  parentDN
                );
              } else {
                console.log("✅ [DEBUG] Parent DN exists:", parentDN);
              }
            }
          } catch (err) {
            console.error("❌ [DEBUG] Error checking parent DN:", err);
            // Try to create the parent DN recursively anyway
            console.log(
              "🏗️ [DEBUG] Attempting to create parent DN recursively after error:",
              parentDN
            );
            const parentCreated = await createDatabaseOnServer(parentDN);
            if (!parentCreated) {
              console.log(
                "❌ [DEBUG] Failed to create parent DN recursively after error:",
                parentDN
              );
              return false;
            }
            console.log(
              "✅ [DEBUG] Parent DN created recursively after error:",
              parentDN
            );
          }
        }
      }

      // FIXED: Proper LDAP schema attributes based on RFC standards
      let baseAttrs: Record<string, string | string[]>;

      if (firstPart.startsWith("dc=")) {
        // Domain component - create as dcObject (RFC 4519)
        baseAttrs = {
          objectClass: ["top", "dcObject"],
          dc: firstPart.replace("dc=", ""),
        };
        console.log(
          "🏗️ [DEBUG] Creating as dcObject with attributes:",
          baseAttrs
        );
      } else if (firstPart.startsWith("ou=")) {
        // Organizational unit - create as organizationalUnit (RFC 4519)
        baseAttrs = {
          objectClass: ["top", "organizationalUnit"],
          ou: firstPart.replace("ou=", ""),
        };
        console.log(
          "🏗️ [DEBUG] Creating as organizationalUnit with attributes:",
          baseAttrs
        );
      } else if (firstPart.startsWith("o=")) {
        // Organization - create as organization (RFC 4519)
        baseAttrs = {
          objectClass: ["top", "organization"],
          o: firstPart.replace("o=", ""),
        };
        console.log(
          "🏗️ [DEBUG] Creating as organization with attributes:",
          baseAttrs
        );
      } else {
        // Generic - try to create as organizationalUnit
        baseAttrs = {
          objectClass: ["top", "organizationalUnit"],
          cn: firstPart.includes("=") ? firstPart.split("=")[1] : firstPart,
        };
        console.log(
          "🏗️ [DEBUG] Creating as generic organizationalUnit with attributes:",
          baseAttrs
        );
      }

      const addPayload = {
        url,
        bindDN,
        password,
        entryDN: dn,
        attributes: baseAttrs,
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };
      console.log("🔍 [DEBUG] Sending LDAP add request:", {
        ...addPayload,
        password: "***",
      });

      const res = await fetch("/api/ldap/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addPayload),
      });

      console.log(
        "📡 [DEBUG] LDAP add response status:",
        res.status,
        res.statusText
      );

      if (res.ok) {
        const data = await res.json();
        console.log("📊 [DEBUG] LDAP add response data:", data);
        if (data?.ok) {
          console.log("✅ [DEBUG] Database successfully created on server");
          return true; // Successfully created on server
        } else {
          console.log("❌ [DEBUG] LDAP add failed:", data);
        }
      } else {
        console.log(
          "❌ [DEBUG] LDAP add HTTP error:",
          res.status,
          res.statusText
        );
        try {
          const errorData = await res.text();
          console.log("❌ [DEBUG] Error response body:", errorData);
        } catch {
          console.log("❌ [DEBUG] Could not read error response body");
        }
      }
      return false;
    } catch (err) {
      console.error("❌ [DEBUG] Exception in createDatabaseOnServer:", err);
      return false;
    }
  }

  async function handleCreateDatabase(newDN: string) {
    console.log("🏗️ [DEBUG] handleCreateDatabase() called with:", newDN);

    if (!newDN || !newDN.trim()) {
      console.log("❌ [DEBUG] Empty or invalid DN provided");
      return;
    }

    const trimmedDN = newDN.trim();
    console.log("🏗️ [DEBUG] Trimmed DN:", trimmedDN);

    try {
      // Try to create the database on the LDAP server first
      console.log("🏗️ [DEBUG] Attempting to create database on server...");
      const createdOnServer = await createDatabaseOnServer(trimmedDN);
      console.log("🏗️ [DEBUG] Server creation result:", createdOnServer);

      if (createdOnServer) {
        // Successfully created on server, now add to local list
        console.log(
          "✅ [DEBUG] Database created on server, updating local state"
        );
        setSelectedDatabase(trimmedDN);
        setBaseDN(trimmedDN);

        const updatedDatabases = [...databases, trimmedDN];
        console.log("🔄 [DEBUG] Updated databases list:", updatedDatabases);
        setDatabases(updatedDatabases);

        // Save to localStorage for persistence
        localStorage.setItem("ldapDatabases", JSON.stringify(updatedDatabases));
        console.log("💾 [DEBUG] Saved to localStorage");

        // Clear any previous errors
        setError(null);
        console.log("✅ [DEBUG] Database creation completed successfully");
      } else {
        // Failed to create on server, but still add to local list for manual creation
        console.log(
          "⚠️ [DEBUG] Failed to create on server, adding to local list only"
        );
        const warningMsg = `Warning: Database "${trimmedDN}" was added to the list but couldn't be created on the LDAP server. This usually means the parent DN doesn't exist or you don't have sufficient permissions. Try creating a simpler DN like "dc=example,dc=com" first.`;
        console.log("⚠️ [DEBUG] Setting warning message:", warningMsg);
        setError(warningMsg);

        setSelectedDatabase(trimmedDN);
        setBaseDN(trimmedDN);

        const updatedDatabases = [...databases, trimmedDN];
        console.log(
          "🔄 [DEBUG] Updated databases list (local only):",
          updatedDatabases
        );
        setDatabases(updatedDatabases);
        localStorage.setItem("ldapDatabases", JSON.stringify(updatedDatabases));
        console.log("💾 [DEBUG] Saved to localStorage (local only)");
      }
    } catch (err) {
      console.error("❌ [DEBUG] Exception in handleCreateDatabase:", err);
      const errorMsg = `Failed to create database: ${(err as Error).message}`;
      console.log("❌ [DEBUG] Setting error message:", errorMsg);
      setError(errorMsg);
    }
  }

  /*
  // Function to create a basic LDAP structure
  async function createBasicLDAPStructure() {
    console.log("🏗️ [DEBUG] Creating basic LDAP structure...");

    try {
      // Create the root domain first
      const rootDN = "dc=example,dc=com";
      console.log("🏗️ [DEBUG] Creating root domain:", rootDN);

      const rootCreated = await createDatabaseOnServer(rootDN);
      if (!rootCreated) {
        console.log("❌ [DEBUG] Failed to create root domain");
        return false;
      }

      // Create an organizational unit under it
      const ouDN = "ou=Users,dc=example,dc=com";
      console.log("🏗️ [DEBUG] Creating organizational unit:", ouDN);

      const ouCreated = await createDatabaseOnServer(ouDN);
      if (!ouCreated) {
        console.log("❌ [DEBUG] Failed to create organizational unit");
        return false;
      }

      console.log("✅ [DEBUG] Basic LDAP structure created successfully");
      return true;
    } catch (err) {
      console.error("❌ [DEBUG] Error creating basic LDAP structure:", err);
      return false;
    }
  }
  */

  // Function to ensure parent DN structure exists - FIXED VERSION
  async function ensureParentDNStructure(dn: string): Promise<boolean> {
    console.log("🔍 [DEBUG] Ensuring parent DN structure exists for:", dn);

    const dnParts = dn.split(",");
    if (dnParts.length <= 1) {
      console.log("✅ [DEBUG] No parent DN needed");
      return true;
    }

    // Check and create parent DNs from bottom up (excluding the first part which is the entry itself)
    for (let i = dnParts.length - 1; i > 0; i--) {
      const parentDN = dnParts.slice(i).join(",");
      console.log("🔍 [DEBUG] Checking parent DN:", parentDN);

      try {
        // First check if the parent DN already exists
        console.log("🔍 [DEBUG] Checking if parent DN exists:", parentDN);
        const checkRes = await fetch("/api/ldap/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            bindDN,
            password,
            baseDN: parentDN,
            filter: "(objectClass=*)",
            scope: "base",
            tls: insecure ? { rejectUnauthorized: false } : undefined,
          }),
        });

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData?.ok) {
            console.log("✅ [DEBUG] Parent DN already exists:", parentDN);
            continue; // Move to next parent DN
          }
        }

        // If parent DN doesn't exist, try to create it
        console.log(
          "🏗️ [DEBUG] Parent DN doesn't exist, attempting to create:",
          parentDN
        );
        const created = await createDatabaseOnServer(parentDN);
        if (created) {
          console.log("✅ [DEBUG] Successfully created parent DN:", parentDN);
          continue; // Move to next parent DN
        }

        // If creation failed, check if it's a top-level domain issue
        if (parentDN.split(",").length === 1 && parentDN.startsWith("dc=")) {
          console.log(
            "⚠️ [DEBUG] Top-level domain creation failed, this is expected for security reasons"
          );
          console.log(
            "⚠️ [DEBUG] Continuing anyway - the entry might still work if the parent exists on the server"
          );
          continue; // Skip this parent DN and continue
        }

        // If we get here, the parent DN doesn't exist and couldn't be created
        console.log(
          "❌ [DEBUG] Parent DN doesn't exist and couldn't be created:",
          parentDN
        );
        return false;
      } catch (err) {
        console.error("❌ [DEBUG] Error with parent DN:", parentDN, err);

        // If it's a top-level domain error, continue anyway
        if (parentDN.split(",").length === 1 && parentDN.startsWith("dc=")) {
          console.log("⚠️ [DEBUG] Top-level domain error, continuing anyway");
          continue;
        }

        // For other errors, try to create this parent DN anyway as a last resort
        console.log(
          "🏗️ [DEBUG] Last resort: attempting to create parent DN:",
          parentDN
        );
        const created = await createDatabaseOnServer(parentDN);
        if (!created) {
          console.log(
            "❌ [DEBUG] Failed to create parent DN in last resort:",
            parentDN
          );
          return false;
        }
        console.log(
          "✅ [DEBUG] Successfully created parent DN in last resort:",
          parentDN
        );
      }
    }

    console.log("✅ [DEBUG] All parent DNs verified/created successfully");
    return true;
  }

  // FIXED: Proper LDAP entry templates following RFC schema standards
  function getLDAPEntryTemplate(objectClass: string): {
    dn: string;
    attributes: string;
  } {
    const templates: Record<string, { dn: string; attributes: string }> = {
      person: {
        dn: `cn=John Doe,${selectedDatabase}`,
        attributes: JSON.stringify(
          {
            objectClass: [
              "top",
              "person",
              "organizationalPerson",
              "inetOrgPerson",
            ],
            cn: "John Doe",
            sn: "Doe",
            givenName: "John",
            uid: "jdoe",
            mail: "john.doe@example.com",
            displayName: "John Doe",
            // Required attributes for inetOrgPerson
            userPassword: "{SHA}W6ph5Mm5Pz8GgiULbPgzG37mj9g=", // Default password hash
          },
          null,
          2
        ),
      },
      organizationalUnit: {
        dn: `ou=NewOU,${selectedDatabase}`,
        attributes: JSON.stringify(
          {
            objectClass: ["top", "organizationalUnit"],
            ou: "NewOU",
            description: "New Organizational Unit",
          },
          null,
          2
        ),
      },
      groupOfNames: {
        dn: `cn=NewGroup,${selectedDatabase}`,
        attributes: JSON.stringify(
          {
            objectClass: ["top", "groupOfNames"],
            cn: "NewGroup",
            description: "New Group",
            member: [], // Required attribute for groupOfNames
          },
          null,
          2
        ),
      },
      posixAccount: {
        dn: `uid=user1,${selectedDatabase}`,
        attributes: JSON.stringify(
          {
            objectClass: ["top", "posixAccount"],
            uid: "user1",
            cn: "User One",
            uidNumber: "1000",
            gidNumber: "1000",
            homeDirectory: "/home/user1",
            loginShell: "/bin/bash",
            // Required attributes for posixAccount
            userPassword: "{SHA}W6ph5Mm5Pz8GgiULbPgzG37mj9g=",
          },
          null,
          2
        ),
      },
    };

    return templates[objectClass] || templates["organizationalUnit"];
  }

  // Function to search for specific DICOM AE Title entry (entry #662)
  async function searchSpecificDicomAE() {
    if (!url || !bindDN || !password || !selectedDatabase) {
      setError("Missing connection details or no database selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Search for all entries to get the full list
      const searchPayload = {
        url,
        bindDN,
        password,
        baseDN: selectedDatabase,
        filter: "(objectClass=*)",
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };

      const res = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchPayload),
      });

      const data = await res.json();

      if (res.ok && data?.ok && data.entries) {
        console.log("Found all entries:", data.entries.length);

        // Target entry #662 (index 661 in 0-based array)
        const targetIndex = 661; // Entry #662 is at index 661

        if (data.entries.length > targetIndex) {
          const targetEntry = data.entries[targetIndex];
          console.log(`Found entry #662 (index ${targetIndex}):`, targetEntry);
          handleAEEntrySelect(targetEntry);
        } else {
          setError(
            `Entry #662 not found. Only ${data.entries.length} entries available.`
          );
        }
      } else {
        setError(data?.error || "Failed to search for entries");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Function to search for DICOM AE Title entries (all entries)
  async function searchDicomAEEntries() {
    if (!url || !bindDN || !password || !selectedDatabase) {
      setError("Missing connection details or no database selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchPayload = {
        url,
        bindDN,
        password,
        baseDN: selectedDatabase,
        filter: "(dicomAETitle=*)",
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };

      const res = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchPayload),
      });

      const data = await res.json();

      if (res.ok && data?.ok && data.entries) {
        console.log("Found DICOM AE entries:", data.entries);
        setDicomAEEntries(data.entries);
        setShowDicomAETitle(true);
      } else {
        setError(data?.error || "Failed to search DICOM AE entries");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Function to handle DICOM AE entry selection
  function handleAEEntrySelect(entry: LdapEntry) {
    console.log("Selected DICOM AE entry:", entry);
    setSelectedAEEntry(entry);
    setAEEditFormData({
      dicomAETitle: String(entry.dicomAETitle || ""),
    });
    setShowAEEditModal(true);
  }

  // Function to save edited DICOM AE entry
  async function saveDicomAEEntry() {
    if (!selectedAEEntry || !url || !bindDN || !password) return;

    setLoading(true);
    setError(null);

    try {
      const originalAETitle = String(selectedAEEntry.dicomAETitle || "");
      const newAETitle = aeEditFormData.dicomAETitle;
      const aeTitleChanged = originalAETitle !== newAETitle;

      console.log("Saving DICOM AE entry:", {
        entryDN: selectedAEEntry.dn,
        originalAETitle,
        newAETitle,
        aeTitleChanged,
        formData: aeEditFormData,
      });

      // Use rename operation to change the dicomAETitle in the RDN
      if (aeTitleChanged) {
        console.log("Renaming entry to update dicomAETitle in RDN");

        const newRdn = `dicomAETitle=${newAETitle}`;

        const renameRes = await fetch("/api/ldap/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            bindDN,
            password,
            entryDN: selectedAEEntry.dn,
            newRdn: newRdn,
            tls: insecure ? { rejectUnauthorized: false } : undefined,
          }),
        });

        const renameData = await renameRes.json();
        console.log("Rename response:", {
          status: renameRes.status,
          data: renameData,
        });

        if (!renameRes.ok || !renameData?.ok) {
          throw new Error(
            `Failed to rename entry: ${
              renameData?.error || renameRes.statusText
            }`
          );
        }

        // Update the selected entry's DN and dicomAETitle
        const oldRdn = `dicomAETitle=${originalAETitle}`;
        selectedAEEntry.dn = selectedAEEntry.dn.replace(oldRdn, newRdn);
        selectedAEEntry.dicomAETitle = newAETitle;
        console.log("Updated entry after rename:", selectedAEEntry);
      }

      setShowAEEditModal(false);
      setSelectedAEEntry(null);
      // Refresh the DICOM AE entries list
      await searchDicomAEEntries();
    } catch (err) {
      console.error("Error saving DICOM AE entry:", err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Function to search for DICOM port entries
  async function searchDicomEntries() {
    if (!url || !bindDN || !password || !selectedDatabase) {
      setError("Missing connection details or no database selected");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const searchPayload = {
        url,
        bindDN,
        password,
        baseDN: selectedDatabase,
        filter: "(dicomPort=*)",
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };

      const res = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(searchPayload),
      });

      const data = await res.json();

      if (res.ok && data?.ok && data.entries) {
        console.log("Found DICOM entries:", data.entries);
        setDicomEntries(data.entries);
        setShowDicomConnections(true);
      } else {
        setError(data?.error || "Failed to search DICOM entries");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Function to handle DICOM entry selection
  function handleDicomEntrySelect(entry: LdapEntry) {
    console.log("Selected DICOM entry:", entry);
    setSelectedDicomEntry(entry);
    setEditFormData({
      cn: String(entry.cn || ""),
      hostname: String(entry.dicomHostname || ""),
      port: String(entry.dicomPort || ""),
    });
    setShowEditModal(true);
  }

  // Function to save edited DICOM entry
  async function saveDicomEntry() {
    if (!selectedDicomEntry || !url || !bindDN || !password) return;

    setLoading(true);
    setError(null);

    try {
      const originalCn = String(selectedDicomEntry.cn || "");
      const newCn = editFormData.cn;
      const cnChanged = originalCn !== newCn;

      console.log("Saving DICOM entry:", {
        entryDN: selectedDicomEntry.dn,
        originalCn,
        newCn,
        cnChanged,
        formData: editFormData,
      });

      // If cn changed, we need to rename the entry first
      if (cnChanged) {
        console.log("Renaming entry due to cn change");
        const renameRes = await fetch("/api/ldap/rename", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            bindDN,
            password,
            entryDN: selectedDicomEntry.dn,
            newRdn: `cn=${newCn}`,
            tls: insecure ? { rejectUnauthorized: false } : undefined,
          }),
        });

        const renameData = await renameRes.json();
        console.log("Rename response:", {
          status: renameRes.status,
          data: renameData,
        });

        if (!renameRes.ok || !renameData?.ok) {
          throw new Error(
            `Failed to rename entry: ${
              renameData?.error || renameRes.statusText
            }`
          );
        }

        // Update the selected entry's DN for the modify operation
        selectedDicomEntry.dn = selectedDicomEntry.dn.replace(
          `cn=${originalCn}`,
          `cn=${newCn}`
        );
      }

      // Now modify the other attributes (dicomHostname and dicomPort)
      const changes = [
        {
          type: "replace" as const,
          attribute: "dicomHostname",
          values: [editFormData.hostname],
        },
        {
          type: "replace" as const,
          attribute: "dicomPort",
          values: [editFormData.port],
        },
      ];

      console.log("Modifying other attributes:", {
        entryDN: selectedDicomEntry.dn,
        changes,
      });

      const res = await fetch("/api/ldap/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          entryDN: selectedDicomEntry.dn,
          changes,
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });

      const data = await res.json();
      console.log("Modify response:", { status: res.status, data });

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || `HTTP ${res.status}: ${res.statusText}`);
      }

      // Update the selected entry's attributes
      selectedDicomEntry.cn = editFormData.cn;
      selectedDicomEntry.dicomHostname = editFormData.hostname;
      selectedDicomEntry.dicomPort = editFormData.port;
      console.log("Updated entry after modify:", selectedDicomEntry);

      setShowEditModal(false);
      setSelectedDicomEntry(null);
      // Refresh the DICOM entries list
      await searchDicomEntries();
    } catch (err) {
      console.error("Error saving DICOM entry:", err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // FIXED: Function to validate LDAP server connection and schema
  async function validateLDAPConnection(): Promise<boolean> {
    console.log("🔍 [DEBUG] Validating LDAP server connection...");

    try {
      // Test basic connection and binding
      const testRes = await fetch("/api/ldap/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          bindDN,
          password,
          tls: insecure ? { rejectUnauthorized: false } : undefined,
        }),
      });

      if (!testRes.ok) {
        console.log("❌ [DEBUG] LDAP connection test failed:", testRes.status);
        return false;
      }

      const testData = await testRes.json();
      if (!testData?.ok) {
        console.log("❌ [DEBUG] LDAP binding failed:", testData.error);
        return false;
      }

      console.log("✅ [DEBUG] LDAP connection validated successfully");
      return true;
    } catch (err) {
      console.error("❌ [DEBUG] LDAP connection validation error:", err);
      return false;
    }
  }

  // Function to discover and use existing LDAP structure
  async function discoverExistingLDAPStructure() {
    console.log("🔍 [DEBUG] Discovering existing LDAP structure...");

    try {
      // Try to search from root to find existing base DNs
      const rootSearchPayload = {
        url,
        bindDN,
        password,
        baseDN: "", // Empty means root DSE
        filter: "(objectClass=*)",
        scope: "one", // Only immediate children
        tls: insecure ? { rejectUnauthorized: false } : undefined,
      };

      console.log("🔍 [DEBUG] Searching root DSE for existing structure...");

      const rootRes = await fetch("/api/ldap/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rootSearchPayload),
      });

      if (rootRes.ok) {
        const rootData = await rootRes.json();
        if (rootData?.ok && rootData.entries && rootData.entries.length > 0) {
          // Found existing structure, add it to our database list
          const existingDNs = rootData.entries
            .map((entry: LdapEntry) => entry.dn)
            .filter((dn: string) => {
              // Look for entries that could be base DNs
              return (
                dn.includes("dc=") || dn.includes("ou=") || dn.includes("o=")
              );
            });

          console.log("🔍 [DEBUG] Found existing LDAP structure:", existingDNs);

          if (existingDNs.length > 0) {
            // Add these to our database list
            const updatedDatabases = [
              ...new Set([...databases, ...existingDNs]),
            ].sort();
            setDatabases(updatedDatabases);
            localStorage.setItem(
              "ldapDatabases",
              JSON.stringify(updatedDatabases)
            );

            // Auto-select the first one
            if (!selectedDatabase) {
              setSelectedDatabase(existingDNs[0]);
              setBaseDN(existingDNs[0]);
            }

            console.log(
              "✅ [DEBUG] Successfully discovered and added existing LDAP structure"
            );
            return true;
          }
        }
      }

      // If root search failed, try some common existing DNs
      console.log(
        "🔍 [DEBUG] Root search failed, trying common existing DNs..."
      );

      const commonDNs = [
        "dc=dcm4che,dc=org", // Your existing DN
        "dc=example,dc=com",
        "dc=test,dc=com",
        "dc=local",
        "dc=internal",
        "dc=corp",
      ];

      for (const dn of commonDNs) {
        try {
          const checkRes = await fetch("/api/ldap/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url,
              bindDN,
              password,
              baseDN: dn,
              filter: "(objectClass=*)",
              scope: "base",
              tls: insecure ? { rejectUnauthorized: false } : undefined,
            }),
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            if (checkData?.ok) {
              console.log("🔍 [DEBUG] Found existing DN:", dn);

              // Add this to our database list
              const updatedDatabases = [...new Set([...databases, dn])].sort();
              setDatabases(updatedDatabases);
              localStorage.setItem(
                "ldapDatabases",
                JSON.stringify(updatedDatabases)
              );

              // Auto-select it
              if (!selectedDatabase) {
                setSelectedDatabase(dn);
                setBaseDN(dn);
              }

              console.log(
                "✅ [DEBUG] Successfully found and added existing DN:",
                dn
              );
              return true;
            }
          }
        } catch (err) {
          console.log("⚠️ [DEBUG] Failed to check DN:", dn, err);
          continue;
        }
      }

      console.log("❌ [DEBUG] No existing LDAP structure found");
      return false;
    } catch (err) {
      console.error("❌ [DEBUG] Error discovering LDAP structure:", err);
      return false;
    }
  }

  // Function to build tree structure from entries
  function buildTreeStructure(entries: LdapEntry[]) {
    const tree: {
      [key: string]: { children: string[]; type: string; dn: string };
    } = {};

    entries.forEach((entry) => {
      const dnParts = entry.dn.split(",");
      const currentDN = entry.dn;

      // Determine entry type based on first RDN
      const firstRDN = dnParts[0].trim();
      let type = "entry";
      if (firstRDN.startsWith("ou=")) type = "ou";
      else if (firstRDN.startsWith("cn=")) type = "user";
      else if (firstRDN.startsWith("dc=")) type = "domain";

      // Add to tree
      tree[currentDN] = {
        children: [],
        type,
        dn: currentDN,
      };

      // Find parent and add as child
      if (dnParts.length > 1) {
        const parentDN = dnParts.slice(1).join(",");
        if (tree[parentDN]) {
          tree[parentDN].children.push(currentDN);
        }
      }
    });

    return tree;
  }

  // Function to toggle node expansion
  function toggleNodeExpansion(dn: string) {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(dn)) {
      newExpanded.delete(dn);
    } else {
      newExpanded.add(dn);
    }
    setExpandedNodes(newExpanded);
  }

  // Function to render tree node
  function renderTreeNode(dn: string, level: number = 0) {
    const node = treeStructure[dn];
    if (!node) return null;

    const isExpanded = expandedNodes.has(dn);
    const hasChildren = node.children.length > 0;

    return (
      <div key={dn} style={{ marginLeft: `${level * 20}px` }}>
        <div
          onClick={() => {
            toggleNodeExpansion(dn);
            // Only call handleDatabaseClick if this is a root-level node (database)
            const dnParts = dn.split(",");
            if (
              dnParts.length <= 2 ||
              dnParts[dnParts.length - 1].trim().startsWith("dc=")
            ) {
              // Navigate to the database page instead of handling locally
              window.location.href = `/browse/${encodeURIComponent(dn)}`;
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 12px",
            cursor: "pointer",
            borderRadius: "6px",
            marginBottom: "2px",
            background: selectedDatabase === dn ? "#3b82f6" : "transparent",
            color: selectedDatabase === dn ? "#fff" : "#374151",
            transition: "all 0.2s ease",
          }}
          onMouseOver={(e) => {
            if (selectedDatabase !== dn) {
              e.currentTarget.style.background = "#e5e7eb";
            }
          }}
          onMouseOut={(e) => {
            if (selectedDatabase !== dn) {
              e.currentTarget.style.background =
                selectedDatabase === dn ? "#3b82f6" : "transparent";
            }
          }}
        >
          {/* Expand/collapse icon */}
          {hasChildren && (
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                marginRight: "6px",
                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.2s ease",
              }}
            >
              <polyline points="9,18 15,12 9,6"></polyline>
            </svg>
          )}

          {/* Entry type icon */}
          <span style={{ marginRight: "6px" }}>
            {node.type === "ou" ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
              </svg>
            ) : node.type === "user" ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="8" r="5"></circle>
                <path d="M20 21a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2"></path>
              </svg>
            ) : node.type === "domain" ? (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            ) : (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10"></circle>
              </svg>
            )}
          </span>

          {/* Entry name */}
          <span
            style={{
              flex: 1,
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>{dn.split(",")[0].split("=")[1]}</span>
            {level === 0 && dn.includes("dc=") && (
              <span
                style={{
                  color: "#ffffff",
                  fontSize: "11px",
                }}
              >
                (Database)
              </span>
            )}
          </span>
        </div>

        {/* Render children if expanded */}
        {isExpanded && hasChildren && (
          <div>
            {node.children.map((childDN) => renderTreeNode(childDN, level + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        maxWidth: "100%",
        margin: "20px",
        padding: "0",
        fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial",
        background: "#fff",
        borderRadius: "16px",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.08)",
        height: "calc(100vh - 40px)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Page Title */}
      <div
        style={{
          padding: "20px 24px",
          borderBottom: "1px solid #e5e7eb",
          background: "#fafafa",
          borderRadius: "16px 16px 0 0",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h1 style={{ fontSize: "24px", margin: 0, color: "#1a1a1a" }}>
            Browse LDAP
          </h1>
          <button
            onClick={() => {
              sessionStorage.removeItem("ldapConnection");
              window.location.href = "/";
            }}
            style={{
              padding: "10px 18px",
              borderRadius: "8px",
              border: "none",
              background: "#6b7280",
              color: "#fff",
              cursor: "pointer",
              fontWeight: "500",
              fontSize: "14px",
              transition: "all 0.2s ease",
              minHeight: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "#4b5563";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "#6b7280";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ marginRight: "6px" }}
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16,17 21,12 16,7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Sign out
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left Sidebar - Database Tree */}
        <div
          style={{
            width: "300px",
            borderRight: "1px solid #e5e7eb",
            background: "#fafafa",
            overflowY: "auto",
            padding: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "16px",
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: "600",
                color: "#374151",
              }}
            >
              Databases
            </h3>
            {url && bindDN && password && (
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => {
                    const newDN = prompt(
                      "Enter the base DN for new database (e.g., dc=example,dc=com):"
                    );
                    if (newDN && newDN.trim()) {
                      handleCreateDatabase(newDN.trim());
                    }
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#10b981",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                    transition: "all 0.2s ease",
                    minHeight: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "#059669";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "#10b981";
                  }}
                  title="Create new database"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                </button>
                <button
                  onClick={loadDatabases}
                  disabled={loadingDatabases}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: "#6b7280",
                    color: "#fff",
                    cursor: loadingDatabases ? "not-allowed" : "pointer",
                    fontSize: "12px",
                    transition: "all 0.2s ease",
                    minHeight: "32px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  onMouseOver={(e) => {
                    if (!loadingDatabases) {
                      e.currentTarget.style.background = "#4b5563";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!loadingDatabases) {
                      e.currentTarget.style.background = "#6b7280";
                    }
                  }}
                  title="Refresh databases"
                >
                  {loadingDatabases ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ animation: "spin 1s linear infinite" }}
                    >
                      <path d="M21 2v6h-6"></path>
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                      <path d="M3 22v-6h6"></path>
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 2v6h-6"></path>
                      <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                      <path d="M3 22v-6h6"></path>
                      <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>

          {loadingDatabases ? (
            <div style={{ color: "#6b7280", fontSize: "14px" }}>
              Loading databases...
            </div>
          ) : databases.length === 0 ? (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <div style={{ color: "#6b7280", fontSize: "14px" }}>
                No databases found
              </div>
              <button
                onClick={() => {
                  const newDN = prompt(
                    "Enter the base DN for new database (e.g., dc=example,dc=com):"
                  );
                  if (newDN && newDN.trim()) {
                    handleCreateDatabase(newDN.trim());
                  }
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#10b981",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#059669";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#10b981";
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: "6px" }}
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                Create Database
              </button>
              <button
                onClick={async () => {
                  try {
                    setError(null);
                    console.log(
                      "🔍 [DEBUG] Validating LDAP connection first..."
                    );
                    const connectionValid = await validateLDAPConnection();
                    if (!connectionValid) {
                      setError(
                        "LDAP connection failed. Please check your connection details."
                      );
                      return;
                    }

                    console.log(
                      "🔍 [DEBUG] Discovering existing LDAP structure..."
                    );
                    const success = await discoverExistingLDAPStructure();
                    if (success) {
                      setError(null);
                    } else {
                      setError(
                        "No existing LDAP structure found. Try creating a database manually or check your LDAP server configuration."
                      );
                    }
                  } catch (err) {
                    console.error(
                      "❌ [DEBUG] Error discovering LDAP structure:",
                      err
                    );
                    setError(
                      `Error discovering structure: ${(err as Error).message}`
                    );
                  }
                }}
                style={{
                  padding: "12px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "14px",
                  transition: "all 0.2s ease",
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#2563eb";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#3b82f6";
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: "6px" }}
                >
                  <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                Discover Existing Structure
              </button>
            </div>
          ) : (
            <div
              style={{ display: "flex", flexDirection: "column", gap: "4px" }}
            >
              {/* Show loading state, tree structure, or flat list */}
              {loadingTree ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "12px",
                    color: "#6b7280",
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
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: "spin 1s linear infinite" }}
                  >
                    <path d="M21 2v6h-6"></path>
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                    <path d="M3 22v-6h6"></path>
                    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                  </svg>
                  Loading structure...
                </div>
              ) : Object.keys(treeStructure).length > 0 ? (
                <div>
                  {/* Go Back button */}
                  <button
                    onClick={() => {
                      setTreeStructure({});
                      setExpandedNodes(new Set());
                      setSelectedDatabase("");
                      setBaseDN("");
                      setEntries(null);
                      setError(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      marginBottom: "12px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s ease",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.borderColor = "#9ca3af";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6"></path>
                    </svg>
                    Back to Databases
                  </button>

                  {/* Tree Structure Header */}
                  <div
                    style={{
                      padding: "8px 0",
                      borderBottom: "1px solid #e5e7eb",
                      marginBottom: "8px",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#374151",
                    }}
                  >
                    Tree Structure
                  </div>

                  {/* Render root nodes (entries without parents) */}
                  {Object.keys(treeStructure)
                    .filter((dn) => {
                      const dnParts = dn.split(",");
                      return (
                        dnParts.length === 1 ||
                        !treeStructure[dnParts.slice(1).join(",")]
                      );
                    })
                    .map((dn) => renderTreeNode(dn))}
                </div>
              ) : (
                /* Fallback to flat database list */
                databases.map((database) => (
                  <div
                    key={database}
                    onClick={() => {
                      // Navigate to the database page
                      window.location.href = `/browse/${encodeURIComponent(
                        database
                      )}`;
                    }}
                    style={{
                      padding: "12px 16px",
                      border: "none",
                      background:
                        selectedDatabase === database
                          ? "#3b82f6"
                          : "transparent",
                      color: selectedDatabase === database ? "#fff" : "#374151",
                      cursor: "pointer",
                      borderRadius: "8px",
                      textAlign: "left",
                      fontSize: "14px",
                      fontWeight: selectedDatabase === database ? "500" : "400",
                      transition: "all 0.2s ease",
                      wordBreak: "break-all",
                    }}
                    onMouseOver={(e) => {
                      if (selectedDatabase !== database) {
                        e.currentTarget.style.background = "#e5e7eb";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (selectedDatabase !== database) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <span style={{ fontSize: "16px" }}>
                        {selectedDatabase === database ? (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
                          </svg>
                        ) : (
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 20h16a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"></path>
                          </svg>
                        )}
                      </span>
                      <span style={{ flex: 1 }}>
                        {database.split(",").map((part, idx) => (
                          <span key={idx}>
                            {idx > 0 && <br />}
                            {part.trim()}
                          </span>
                        ))}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDatabase(database);
                        }}
                        style={{
                          padding: "4px 6px",
                          borderRadius: "4px",
                          border: "none",
                          background: "#ef4444",
                          color: "#fff",
                          cursor: "pointer",
                          fontSize: "10px",
                          transition: "all 0.2s ease",
                          minHeight: "24px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                        onMouseOver={(e) => {
                          e.currentTarget.style.background = "#dc2626";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.background = "#ef4444";
                        }}
                        title="Remove database"
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18"></line>
                          <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right Content Area */}
        <div
          style={{
            flex: 1,
            padding: "24px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {!url || !bindDN || !password ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "20px" }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect
                    width="18"
                    height="11"
                    x="3"
                    y="11"
                    rx="2"
                    ry="2"
                  ></rect>
                  <circle cx="12" cy="16" r="1"></circle>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
              </div>
              <h2
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "24px",
                  fontWeight: "600",
                  color: "#374151",
                }}
              >
                Connection Required
              </h2>
              <p
                style={{
                  margin: "0 0 24px 0",
                  color: "#6b7280",
                  fontSize: "16px",
                  maxWidth: "500px",
                }}
              >
                Please connect to an LDAP server first to browse and manage
                entries.
              </p>
              <Link
                href="/"
                style={{
                  display: "inline-block",
                  padding: "12px 24px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#3b82f6",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "500",
                  fontSize: "16px",
                  textDecoration: "none",
                  transition: "all 0.2s ease",
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = "#2563eb";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = "#3b82f6";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Go to Connect Page
              </Link>
            </div>
          ) : false && selectedDatabase ? (
            <>
              {/* Database Header - HIDDEN */}
              <div style={{ marginBottom: "24px" }}>
                <h2
                  style={{
                    margin: "0 0 8px 0",
                    fontSize: "20px",
                    fontWeight: "600",
                    color: "#1a1a1a",
                  }}
                >
                  {selectedDatabase}
                </h2>
                <p style={{ margin: 0, color: "#6b7280", fontSize: "14px" }}>
                  Database Management - Add, Edit, and View Entries
                </p>
              </div>
            </>
          ) : false && loadingDatabases ? (
            <div
              style={{
                textAlign: "center",
                padding: "60px 20px",
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "20px" }}>
                <svg
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ animation: "spin 2s linear infinite" }}
                >
                  <path d="M21 2v6h-6"></path>
                  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"></path>
                  <path d="M3 22v-6h6"></path>
                  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"></path>
                </svg>
              </div>
              <h2
                style={{
                  margin: "0 0 16px 0",
                  fontSize: "24px",
                  fontWeight: "600",
                  color: "#374151",
                }}
              >
                Loading Databases...
              </h2>
              <p style={{ margin: 0, color: "#6b7280", fontSize: "16px" }}>
                Please wait while we discover available databases
              </p>
            </div>
          ) : (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f9fafb",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: "18px",
                    fontWeight: "500",
                    marginBottom: "24px",
                  }}
                >
                  Select your database
                </div>

                {selectedDatabase && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                      alignItems: "center",
                    }}
                  >
                    <button
                      onClick={searchDicomEntries}
                      disabled={loading}
                      style={{
                        padding: "12px 24px",
                        borderRadius: "8px",
                        border: "none",
                        background: loading ? "#9ca3af" : "#3b82f6",
                        color: "#fff",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: "500",
                        fontSize: "14px",
                        transition: "all 0.2s ease",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                      }}
                      onMouseOver={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = "#2563eb";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = "#3b82f6";
                          e.currentTarget.style.transform = "translateY(0)";
                        }
                      }}
                    >
                      {loading ? "Loading..." : "View DICOM Connections"}
                    </button>

                    <button
                      onClick={searchSpecificDicomAE}
                      disabled={loading}
                      style={{
                        padding: "12px 24px",
                        borderRadius: "8px",
                        border: "none",
                        background: loading ? "#9ca3af" : "#10b981",
                        color: "#fff",
                        cursor: loading ? "not-allowed" : "pointer",
                        fontWeight: "500",
                        fontSize: "14px",
                        transition: "all 0.2s ease",
                        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
                      }}
                      onMouseOver={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = "#059669";
                          e.currentTarget.style.transform = "translateY(-1px)";
                        }
                      }}
                      onMouseOut={(e) => {
                        if (!loading) {
                          e.currentTarget.style.background = "#10b981";
                          e.currentTarget.style.transform = "translateY(0)";
                        }
                      }}
                    >
                      {loading ? "Loading..." : "Edit RADSHARE AE Title"}
                    </button>
                  </div>
                )}

                {showDicomConnections && dicomEntries.length > 0 && (
                  <div
                    style={{
                      marginTop: "24px",
                      maxWidth: "400px",
                      margin: "24px auto 0",
                    }}
                  >
                    <label
                      style={{
                        display: "block",
                        marginBottom: "8px",
                        fontWeight: "500",
                        color: "#374151",
                        fontSize: "14px",
                      }}
                    >
                      Select DICOM Connection:
                    </label>
                    <select
                      onChange={(e) => {
                        const selectedEntry = dicomEntries.find(
                          (entry) => entry.dn === e.target.value
                        );
                        if (selectedEntry) {
                          handleDicomEntrySelect(selectedEntry);
                        }
                      }}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        border: "1px solid #d1d5db",
                        borderRadius: "8px",
                        fontSize: "14px",
                        background: "#fff",
                        color: "#374151",
                        cursor: "pointer",
                      }}
                    >
                      <option value="">Choose a connection...</option>
                      {dicomEntries.map((entry) => (
                        <option key={entry.dn} value={entry.dn}>
                          {String(entry.cn || "Unknown Connection")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {showDicomConnections && dicomEntries.length === 0 && (
                  <div
                    style={{
                      marginTop: "24px",
                      color: "#6b7280",
                      fontSize: "14px",
                    }}
                  >
                    No DICOM connections found
                  </div>
                )}
              </div>
            </div>
          )}

          {false && error && (
            <div
              style={{
                marginBottom: "16px",
                padding: "16px",
                borderRadius: "8px",
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#dc2626",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              <div style={{ marginBottom: "12px" }}>Error: {error}</div>
              {error?.includes("Warning: Database") && (
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      const newDN = prompt(
                        "Enter a simpler base DN (e.g., dc=example,dc=com):"
                      );
                      if (newDN && newDN.trim()) {
                        handleCreateDatabase(newDN.trim());
                      }
                    }}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#3b82f6",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s ease",
                      minHeight: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "#2563eb";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "#3b82f6";
                    }}
                  >
                    Try Simpler DN
                  </button>
                  <button
                    onClick={() => setError(null)}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "none",
                      background: "#6b7280",
                      color: "#fff",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s ease",
                      minHeight: "32px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "#4b5563";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "#6b7280";
                    }}
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Add Entry Section - Only show when database is selected - HIDDEN */}
          {false && selectedDatabase && (
            <div
              id="add-entry-section"
              style={{
                border: "1px solid #e5e7eb",
                padding: "24px",
                borderRadius: "12px",
                background: "#fafafa",
                marginBottom: "24px",
              }}
            >
              <h2
                style={{
                  marginTop: 0,
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#374151",
                  marginBottom: "20px",
                }}
              >
                Add New Entry
              </h2>

              {/* LDAP Entry Templates */}
              <div style={{ marginBottom: "16px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "8px",
                    fontWeight: "500",
                    color: "#374151",
                    fontSize: "14px",
                  }}
                >
                  Quick Templates
                </label>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {[
                    "person",
                    "organizationalUnit",
                    "groupOfNames",
                    "posixAccount",
                  ].map((template) => (
                    <button
                      key={template}
                      onClick={() => {
                        const templateData = getLDAPEntryTemplate(template);
                        setNewDn(templateData.dn);
                        setNewAttrs(templateData.attributes);
                      }}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        color: "#374151",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "500",
                        transition: "all 0.2s ease",
                        textTransform: "capitalize",
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = "#f3f4f6";
                        e.currentTarget.style.borderColor = "#9ca3af";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = "#fff";
                        e.currentTarget.style.borderColor = "#d1d5db";
                      }}
                    >
                      {template}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: "grid", gap: "16px" }}>
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
                    Distinguished Name (DN)
                  </label>
                  <input
                    value={newDn}
                    onChange={(e) => setNewDn(e.target.value)}
                    placeholder="ou=TestOU,dc=example,dc=com"
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
                    Attributes (JSON)
                  </label>
                  <textarea
                    rows={6}
                    value={newAttrs}
                    onChange={(e) => setNewAttrs(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      border: "1px solid #d1d5db",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontFamily: "monospace",
                      transition: "border-color 0.2s ease",
                      boxSizing: "border-box",
                      resize: "vertical",
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
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    onClick={async () => {
                      setError(null);
                      try {
                        console.log("🔍 [DEBUG] Add Entry button clicked");
                        console.log("🔍 [DEBUG] Current state values:", {
                          url: url,
                          bindDN: bindDN,
                          password: password ? "***" : "undefined",
                          newDn: newDn,
                          newAttrs: newAttrs,
                          insecure: insecure,
                        });

                        // Validate the entry DN format
                        if (!newDn || !newDn.trim()) {
                          throw new Error("Entry DN cannot be empty");
                        }

                        // Parse and validate attributes
                        let parsedAttrs: Record<string, string | string[]>;
                        try {
                          parsedAttrs = JSON.parse(newAttrs);
                        } catch {
                          throw new Error("Invalid JSON in attributes field");
                        }

                        // FIXED: Enhanced LDAP schema validation
                        if (
                          !parsedAttrs.objectClass ||
                          !Array.isArray(parsedAttrs.objectClass)
                        ) {
                          throw new Error(
                            "objectClass must be an array of strings"
                          );
                        }

                        // Validate that objectClass contains valid values
                        const validObjectClasses = [
                          "top",
                          "person",
                          "organizationalPerson",
                          "inetOrgPerson",
                          "organizationalUnit",
                          "groupOfNames",
                          "posixAccount",
                          "dcObject",
                          "organization",
                          "domain",
                          "country",
                        ];

                        for (const oc of parsedAttrs.objectClass) {
                          if (
                            typeof oc !== "string" ||
                            !validObjectClasses.includes(oc)
                          ) {
                            console.warn(
                              `⚠️ [DEBUG] Unknown objectClass: ${oc}`
                            );
                          }
                        }

                        // Ensure required attributes based on objectClass
                        if (parsedAttrs.objectClass.includes("person")) {
                          if (!parsedAttrs.cn || !parsedAttrs.sn) {
                            throw new Error(
                              "person entries require 'cn' and 'sn' attributes"
                            );
                          }
                        }

                        if (
                          parsedAttrs.objectClass.includes("organizationalUnit")
                        ) {
                          if (!parsedAttrs.ou) {
                            throw new Error(
                              "organizationalUnit entries require 'ou' attribute"
                            );
                          }
                        }

                        if (parsedAttrs.objectClass.includes("groupOfNames")) {
                          if (!parsedAttrs.member) {
                            throw new Error(
                              "groupOfNames entries require 'member' attribute"
                            );
                          }
                        }

                        if (parsedAttrs.objectClass.includes("posixAccount")) {
                          if (
                            !parsedAttrs.uid ||
                            !parsedAttrs.uidNumber ||
                            !parsedAttrs.gidNumber ||
                            !parsedAttrs.homeDirectory
                          ) {
                            throw new Error(
                              "posixAccount entries require 'uid', 'uidNumber', 'gidNumber', and 'homeDirectory' attributes"
                            );
                          }
                        }

                        console.log(
                          "🔍 [DEBUG] Parsed attributes:",
                          parsedAttrs
                        );

                        // FIXED: Enhanced validation before LDAP operations
                        if (!selectedDatabase) {
                          throw new Error(
                            "No database selected. Please select a database first."
                          );
                        }

                        // Validate LDAP connection first
                        console.log("🔍 [DEBUG] Validating LDAP connection...");
                        const connectionValid = await validateLDAPConnection();
                        if (!connectionValid) {
                          throw new Error(
                            "LDAP server connection failed. Please check your connection details."
                          );
                        }

                        // Ensure the parent DN structure exists before adding entries
                        console.log(
                          "🔍 [DEBUG] Ensuring parent DN structure exists..."
                        );
                        const parentStructureOk = await ensureParentDNStructure(
                          newDn
                        );
                        if (!parentStructureOk) {
                          throw new Error(
                            `Failed to create parent DN structure for "${newDn}". Please create the required parent DNs first.`
                          );
                        }
                        console.log(
                          "✅ [DEBUG] Parent DN structure verified/created"
                        );

                        // FIXED: Test LDAP add operation with simple validation
                        console.log("🔍 [DEBUG] Testing LDAP add operation...");

                        // Ensure the entry DN is properly formatted
                        if (!newDn.includes("=")) {
                          throw new Error(
                            "Invalid DN format. DN must contain at least one attribute=value pair."
                          );
                        }

                        // Validate that the DN ends with the selected database
                        if (!newDn.endsWith(selectedDatabase)) {
                          throw new Error(
                            `Entry DN "${newDn}" must end with the selected database "${selectedDatabase}"`
                          );
                        }

                        const requestBody = {
                          url,
                          bindDN,
                          password,
                          entryDN: newDn,
                          attributes: parsedAttrs,
                          tls: insecure
                            ? { rejectUnauthorized: false }
                            : undefined,
                        };

                        // FIXED: Enhanced debugging for LDAP operations
                        console.log("🔍 [DEBUG] Sending add request:", {
                          ...requestBody,
                          password: "***",
                        });

                        // Log the exact LDAP entry structure being created
                        console.log("🔍 [DEBUG] LDAP Entry Structure:", {
                          dn: newDn,
                          objectClass: parsedAttrs.objectClass,
                          attributes: Object.keys(parsedAttrs).filter(
                            (key) => key !== "objectClass"
                          ),
                          parentDN: selectedDatabase,
                        });

                        const res = await fetch("/api/ldap/add", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(requestBody),
                        });

                        console.log(
                          "📡 [DEBUG] Add response status:",
                          res.status,
                          res.statusText
                        );

                        const data = await res.json();
                        console.log("📊 [DEBUG] Add response data:", data);

                        if (!res.ok || !data?.ok) {
                          const errorMsg = data?.error || res.statusText;

                          // FIXED: Better LDAP error handling with specific guidance
                          if (
                            errorMsg.includes("0x35") ||
                            errorMsg.includes("no global superior knowledge")
                          ) {
                            throw new Error(
                              `The parent DN "${selectedDatabase}" doesn't exist on the LDAP server yet. Please create it first using the "Create Database" button.`
                            );
                          } else if (
                            errorMsg.includes("0x20") ||
                            errorMsg.includes("attribute or value exists")
                          ) {
                            throw new Error(
                              `Entry already exists with DN "${newDn}". LDAP DNs must be unique.`
                            );
                          } else if (
                            errorMsg.includes("0x32") ||
                            errorMsg.includes("no such attribute")
                          ) {
                            throw new Error(
                              `Invalid attribute in entry. Check that all attributes are valid for the specified objectClass.`
                            );
                          } else if (
                            errorMsg.includes("0x21") ||
                            errorMsg.includes("invalid attribute syntax")
                          ) {
                            throw new Error(
                              `Invalid attribute syntax. Check that attribute values match the expected format.`
                            );
                          } else if (
                            errorMsg.includes("0x50") ||
                            errorMsg.includes("insufficient access")
                          ) {
                            throw new Error(
                              `Insufficient permissions to create entry. Check your bind DN permissions.`
                            );
                          } else {
                            throw new Error(`LDAP Error: ${errorMsg}`);
                          }
                        }

                        console.log(
                          "✅ [DEBUG] Entry added successfully, refreshing search results"
                        );
                        await onSearch(
                          new Event("submit") as unknown as React.FormEvent
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                    style={{
                      padding: "12px 20px",
                      borderRadius: "8px",
                      border: "none",
                      background: "#10b981",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: "500",
                      fontSize: "14px",
                      transition: "all 0.2s ease",
                      boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
                      minHeight: "44px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "#059669";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "#10b981";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    {entries?.some((entry) => entry.dn === newDn)
                      ? "Update Entry"
                      : "Add Entry"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Search Results */}
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
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      setFilter("(objectClass=*)");
                      onSearch(
                        new Event("submit") as unknown as React.FormEvent
                      );
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.borderColor = "#9ca3af";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }}
                  >
                    Show All
                  </button>
                  <button
                    onClick={() => {
                      setFilter("(objectClass=organizationalUnit)");
                      onSearch(
                        new Event("submit") as unknown as React.FormEvent
                      );
                    }}
                    style={{
                      padding: "6px 12px",
                      borderRadius: "6px",
                      border: "1px solid #d1d5db",
                      background: "#fff",
                      color: "#374151",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: "500",
                      transition: "all 0.2s ease",
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = "#f3f4f6";
                      e.currentTarget.style.borderColor = "#9ca3af";
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = "#fff";
                      e.currentTarget.style.borderColor = "#d1d5db";
                    }}
                  >
                    OUs Only
                  </button>
                </div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: "14px",
                  }}
                >
                  <thead>
                    <tr style={{ background: "#f9fafb" }}>
                      <th
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          padding: "16px",
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        Distinguished Name
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          padding: "16px",
                          fontWeight: "600",
                          color: "#374151",
                        }}
                      >
                        Attributes
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr
                        key={idx}
                        style={{ borderBottom: "1px solid #f3f4f6" }}
                      >
                        <td
                          style={{
                            verticalAlign: "top",
                            padding: "16px",
                            borderRight: "1px solid #f3f4f6",
                            background: "#fafafa",
                            width: "300px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "12px",
                            }}
                          >
                            <span
                              style={{
                                flex: 1,
                                fontFamily: "monospace",
                                fontSize: "13px",
                                wordBreak: "break-all",
                              }}
                            >
                              {entry.dn}
                            </span>
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                onClick={() => {
                                  // Set the form to edit this entry
                                  setNewDn(entry.dn);
                                  setNewAttrs(JSON.stringify(entry, null, 2));
                                  // Scroll to add entry section
                                  document
                                    .getElementById("add-entry-section")
                                    ?.scrollIntoView({ behavior: "smooth" });
                                }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#3b82f6",
                                  color: "#fff",
                                  cursor: "pointer",
                                  fontWeight: "500",
                                  fontSize: "12px",
                                  transition: "all 0.2s ease",
                                  whiteSpace: "nowrap",
                                  minHeight: "32px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = "#2563eb";
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = "#3b82f6";
                                }}
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  setError(null);
                                  try {
                                    const ok = confirm(`Delete ${entry.dn}?`);
                                    if (!ok) return;
                                    const res = await fetch(
                                      "/api/ldap/delete",
                                      {
                                        method: "POST",
                                        headers: {
                                          "Content-Type": "application/json",
                                        },
                                        body: JSON.stringify({
                                          url,
                                          bindDN,
                                          password,
                                          entryDN: entry.dn,
                                          tls: insecure
                                            ? { rejectUnauthorized: false }
                                            : undefined,
                                        }),
                                      }
                                    );
                                    const data = await res.json();
                                    if (!res.ok || !data?.ok)
                                      throw new Error(
                                        data?.error || res.statusText
                                      );
                                    await onSearch(
                                      new Event(
                                        "submit"
                                      ) as unknown as React.FormEvent
                                    );
                                  } catch (e) {
                                    setError((e as Error).message);
                                  }
                                }}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: "6px",
                                  border: "none",
                                  background: "#ef4444",
                                  color: "#fff",
                                  cursor: "pointer",
                                  fontWeight: "500",
                                  fontSize: "12px",
                                  transition: "all 0.2s ease",
                                  whiteSpace: "nowrap",
                                  minHeight: "32px",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                onMouseOver={(e) => {
                                  e.currentTarget.style.background = "#dc2626";
                                }}
                                onMouseOut={(e) => {
                                  e.currentTarget.style.background = "#ef4444";
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            verticalAlign: "top",
                            padding: "16px",
                          }}
                        >
                          <pre
                            style={{
                              margin: 0,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                              fontSize: "13px",
                              fontFamily: "monospace",
                              color: "#374151",
                              background: "#f9fafb",
                              padding: "12px",
                              borderRadius: "6px",
                              border: "1px solid #e5e7eb",
                            }}
                          >
                            {JSON.stringify(entry, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit DICOM Connection Modal */}
      {showEditModal && (
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
              setShowEditModal(false);
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
                Edit DICOM Connection
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
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
                    fontSize: "14px",
                  }}
                >
                  Connection Name (cn) *
                </label>
                <input
                  type="text"
                  value={editFormData.cn}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, cn: e.target.value })
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
                    fontSize: "14px",
                  }}
                >
                  Hostname *
                </label>
                <input
                  type="text"
                  value={editFormData.hostname}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
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
                    fontSize: "14px",
                  }}
                >
                  Port *
                </label>
                <input
                  type="text"
                  value={editFormData.port}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, port: e.target.value })
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
                onClick={() => setShowEditModal(false)}
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
                onClick={saveDicomEntry}
                disabled={
                  loading ||
                  !editFormData.cn ||
                  !editFormData.hostname ||
                  !editFormData.port
                }
                style={{
                  padding: "10px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    loading ||
                    !editFormData.cn ||
                    !editFormData.hostname ||
                    !editFormData.port
                      ? "#9ca3af"
                      : "#3b82f6",
                  color: "#fff",
                  cursor:
                    loading ||
                    !editFormData.cn ||
                    !editFormData.hostname ||
                    !editFormData.port
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "14px",
                }}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {error && error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  color: "#dc2626",
                  fontSize: "14px",
                }}
              >
                Error: {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit DICOM AE Title Modal */}
      {showAEEditModal && (
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
              setShowAEEditModal(false);
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
                Edit DICOM AE Title
              </h2>
              <button
                onClick={() => setShowAEEditModal(false)}
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
                    fontSize: "14px",
                  }}
                >
                  DICOM AE Title *
                </label>
                <input
                  type="text"
                  value={aeEditFormData.dicomAETitle}
                  onChange={(e) =>
                    setAEEditFormData({
                      ...aeEditFormData,
                      dicomAETitle: e.target.value,
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
                onClick={() => setShowAEEditModal(false)}
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
                onClick={saveDicomAEEntry}
                disabled={loading || !aeEditFormData.dicomAETitle}
                style={{
                  padding: "10px 16px",
                  borderRadius: "6px",
                  border: "none",
                  background:
                    loading || !aeEditFormData.dicomAETitle
                      ? "#9ca3af"
                      : "#10b981",
                  color: "#fff",
                  cursor:
                    loading || !aeEditFormData.dicomAETitle
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "14px",
                }}
              >
                {loading ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {error && error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "12px",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: "6px",
                  color: "#dc2626",
                  fontSize: "14px",
                }}
              >
                Error: {error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
