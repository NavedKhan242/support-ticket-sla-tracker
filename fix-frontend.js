import fs from "node:fs";
import path from "node:path";

const frontendFiles = {
  "frontend/package.json": JSON.stringify({
    name: "sla-tracker-frontend",
    private: true,
    version: "1.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc && vite build",
      preview: "vite preview"
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1"
    },
    devDependencies: {
      "@types/react": "^18.3.3",
      "@types/react-dom": "^18.3.0",
      "@vitejs/plugin-react": "^4.3.1",
      typescript: "^5.4.5",
      vite: "^5.3.4"
    }
  }, null, 2),

  "frontend/vite.config.ts": `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/graphql": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
`,

  "frontend/tsconfig.json": JSON.stringify({
    compilerOptions: {
      target: "ES2020",
      useDefineForClassFields: true,
      lib: ["ES2020", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      noEmit: true,
      jsx: "react-jsx",
      strict: true
    },
    include: ["src"]
  }, null, 2),

  "frontend/index.html": `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Support Ticket & SLA Tracker</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  "frontend/src/index.css": `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
}

body {
  background-color: #0f172a;
  color: #f8fafc;
  min-height: 100vh;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px;
}

.navbar {
  background-color: #1e293b;
  border-bottom: 1px solid #334155;
  padding: 16px 24px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav-links {
  display: flex;
  gap: 16px;
  align-items: center;
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary { background-color: #3b82f6; color: white; }
.btn-primary:hover { background-color: #2563eb; }
.btn-secondary { background-color: #334155; color: #f8fafc; }
.btn-secondary:hover { background-color: #475569; }
.btn-danger { background-color: #ef4444; color: white; }

.card {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-URGENT { background: #fee2e2; color: #991b1b; }
.badge-HIGH { background: #ffedd5; color: #9a3412; }
.badge-MEDIUM { background: #e0f2fe; color: #075985; }
.badge-LOW { background: #f1f5f9; color: #475569; }

.badge-OPEN { background: #dbeafe; color: #1e40af; }
.badge-IN_PROGRESS { background: #fef3c7; color: #92400e; }
.badge-RESOLVED { background: #dcfce7; color: #166534; }
.badge-CLOSED { background: #f3f4f6; color: #374151; }

.sla-ON_TRACK { background: #14532d; color: #86efac; }
.sla-AT_RISK { background: #713f12; color: #fde047; }
.sla-BREACHED { background: #7f1d1d; color: #fca5a5; }

.grid-cols-4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

input, select, textarea {
  width: 100%;
  padding: 10px;
  border-radius: 6px;
  background-color: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  margin-top: 6px;
  margin-bottom: 16px;
}

input:focus, select:focus, textarea:focus {
  outline: 2px solid #3b82f6;
}
`,

  "frontend/src/main.tsx": `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,

  "frontend/src/App.tsx": `import React, { useState, useEffect } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "REPORTER" | "AGENT";
}

interface SLAInfo {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: "ON_TRACK" | "AT_RISK" | "BREACHED";
  resolutionState: "ON_TRACK" | "AT_RISK" | "BREACHED";
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  reporter: { name: string };
  assignee?: { id: string; name: string };
  createdAt: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  sla: SLAInfo;
  comments: Array<{ id: string; content: string; author: { name: string }; createdAt: string }>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("token"));
  const [view, setView] = useState<"list" | "create" | "detail">("list");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<User[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [dashboard, setDashboard] = useState<any>(null);

  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("agent@example.com");
  const [authPassword, setAuthPassword] = useState("password123");
  const [authName, setAuthName] = useState("");
  const [authRole, setAuthRole] = useState<"REPORTER" | "AGENT">("AGENT");

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("HIGH");

  const [commentText, setCommentText] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  async function gql(query: string, variables = {}) {
    const res = await fetch("/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: \`Bearer \${token}\` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || "GraphQL Error");
    return json.data;
  }

  async function loadDashboardAndTickets() {
    try {
      const data = await gql(\`
        query {
          dashboard { openTickets inProgressTickets atRiskTickets breachedTickets }
          tickets {
            nodes {
              id title priority status createdAt
              reporter { name }
              assignee { id name }
              sla {
                firstResponseState resolutionState
                firstResponseRemainingMinutes resolutionRemainingMinutes
              }
            }
          }
          users(role: AGENT) { id name email }
        }
      \`);
      setDashboard(data.dashboard);
      setTickets(data.tickets.nodes);
      setAgents(data.users);
    } catch (e: any) {
      console.error(e);
    }
  }

  async function loadTicketDetail(id: string) {
    try {
      const data = await gql(\`
        query($id: ID!) {
          ticket(id: $id) {
            id title description priority status createdAt firstResponseAt resolvedAt
            reporter { name }
            assignee { id name }
            sla {
              firstResponseDueAt resolutionDueAt firstResponseState resolutionState
              firstResponseRemainingMinutes resolutionRemainingMinutes
            }
            comments { id content createdAt author { name } }
          }
        }
      \`, { id });
      setSelectedTicket(data.ticket);
    } catch (e: any) {
      alert(e.message);
    }
  }

  useEffect(() => {
    if (token) {
      loadDashboardAndTickets();
    }
  }, [token]);

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (authMode === "login") {
        const data = await gql(\`
          mutation($email: String!, $password: String!) {
            login(email: $email, password: $password) { token user { id name email role } }
          }
        \`, { email: authEmail, password: authPassword });
        setToken(data.login.token);
        setUser(data.login.user);
        localStorage.setItem("token", data.login.token);
        localStorage.setItem("user", JSON.stringify(data.login.user));
      } else {
        const data = await gql(\`
          mutation($name: String!, $email: String!, $password: String!, $role: UserRole!) {
            register(name: $name, email: $email, password: $password, role: $role) {
              token user { id name email role }
            }
          }
        \`, { name: authName, email: authEmail, password: authPassword, role: authRole });
        setToken(data.register.token);
        setUser(data.register.user);
        localStorage.setItem("token", data.register.token);
        localStorage.setItem("user", JSON.stringify(data.register.user));
      }
    } catch (e: any) {
      alert(e.message);
    }
  }

  function handleLogout() {
    setUser(null);
    setToken(null);
    localStorage.clear();
  }

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault();
    try {
      await gql(\`
        mutation($title: String!, $description: String!, $priority: Priority!) {
          createTicket(title: $title, description: $description, priority: $priority) { id }
        }
      \`, { title: newTitle, description: newDesc, priority: newPriority });
      setNewTitle("");
      setNewDesc("");
      setView("list");
      loadDashboardAndTickets();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTicketId || !commentText.trim()) return;
    try {
      await gql(\`
        mutation($ticketId: ID!, $content: String!) {
          addComment(ticketId: $ticketId, content: $content) { id }
        }
      \`, { ticketId: selectedTicketId, content: commentText });
      setCommentText("");
      loadTicketDetail(selectedTicketId);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleAssign(agentId: string) {
    if (!selectedTicketId) return;
    try {
      await gql(\`
        mutation($ticketId: ID!, $assigneeId: ID!) {
          assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) { id }
        }
      \`, { ticketId: selectedTicketId, assigneeId: agentId });
      loadTicketDetail(selectedTicketId);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleStatusChange(status: string) {
    if (!selectedTicketId) return;
    try {
      await gql(\`
        mutation($ticketId: ID!, $status: TicketStatus!) {
          changeTicketStatus(ticketId: $ticketId, status: $status) { id }
        }
      \`, { ticketId: selectedTicketId, status });
      loadTicketDetail(selectedTicketId);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleResolve() {
    if (!selectedTicketId) return;
    try {
      await gql(\`
        mutation($ticketId: ID!) {
          resolveTicket(ticketId: $ticketId) { id }
        }
      \`, { ticketId: selectedTicketId });
      loadTicketDetail(selectedTicketId);
    } catch (e: any) {
      alert(e.message);
    }
  }

  if (!token || !user) {
    return (
      <div className="container" style={{ maxWidth: "450px", marginTop: "80px" }}>
        <div className="card">
          <h2 style={{ marginBottom: "16px" }}>
            {authMode === "login" ? "Login to SLA Tracker" : "Create an Account"}
          </h2>
          <form onSubmit={handleAuth}>
            {authMode === "register" && (
              <div>
                <label>Full Name</label>
                <input value={authName} onChange={(e) => setAuthName(e.target.value)} required />
                <label>Role</label>
                <select value={authRole} onChange={(e) => setAuthRole(e.target.value as any)}>
                  <option value="AGENT">Support Agent</option>
                  <option value="REPORTER">Customer / Reporter</option>
                </select>
              </div>
            )}
            <label>Email</label>
            <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required />
            <label>Password</label>
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required />
            <button type="submit" className="btn btn-primary" style={{ width: "100%", marginTop: "12px" }}>
              {authMode === "login" ? "Sign In" : "Register"}
            </button>
          </form>
          <p style={{ marginTop: "16px", fontSize: "14px", textAlign: "center" }}>
            {authMode === "login" ? "No account? " : "Already have an account? "}
            <a
              href="#"
              style={{ color: "#3b82f6" }}
              onClick={(e) => {
                e.preventDefault();
                setAuthMode(authMode === "login" ? "register" : "login");
              }}
            >
              {authMode === "login" ? "Register here" : "Login here"}
            </a>
          </p>
          <div style={{ marginTop: "16px", padding: "12px", background: "#0f172a", borderRadius: "6px", fontSize: "12px" }}>
            <b>Demo Credentials:</b><br />
            Agent: <code>agent@example.com</code> / <code>password123</code><br />
            Reporter: <code>reporter@example.com</code> / <code>password123</code>
          </div>
        </div>
      </div>
    );
  }

  const filteredTickets = tickets.filter((t) => {
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    return true;
  });

  return (
    <div>
      <nav className="navbar">
        <h2 style={{ fontSize: "18px", color: "#38bdf8" }}>⚡ Support Ticket & SLA Tracker</h2>
        <div className="nav-links">
          <span>{user.name} ({user.role})</span>
          <button className="btn btn-secondary" onClick={() => { setView("list"); loadDashboardAndTickets(); }}>Tickets</button>
          <button className="btn btn-primary" onClick={() => setView("create")}>+ New Ticket</button>
          <button className="btn btn-danger" onClick={handleLogout}>Logout</button>
        </div>
      </nav>

      <div className="container">
        {dashboard && (
          <div className="grid-cols-4">
            <div className="card">
              <span style={{ color: "#94a3b8", fontSize: "14px" }}>Open Tickets</span>
              <h1 style={{ fontSize: "32px", color: "#60a5fa" }}>{dashboard.openTickets}</h1>
            </div>
            <div className="card">
              <span style={{ color: "#94a3b8", fontSize: "14px" }}>In Progress</span>
              <h1 style={{ fontSize: "32px", color: "#facc15" }}>{dashboard.inProgressTickets}</h1>
            </div>
            <div className="card">
              <span style={{ color: "#94a3b8", fontSize: "14px" }}>SLA At Risk</span>
              <h1 style={{ fontSize: "32px", color: "#fb923c" }}>{dashboard.atRiskTickets}</h1>
            </div>
            <div className="card">
              <span style={{ color: "#94a3b8", fontSize: "14px" }}>SLA Breached</span>
              <h1 style={{ fontSize: "32px", color: "#f87171" }}>{dashboard.breachedTickets}</h1>
            </div>
          </div>
        )}

        {view === "create" && (
          <div className="card" style={{ maxWidth: "600px", margin: "0 auto" }}>
            <h2>Create Support Ticket</h2>
            <form onSubmit={handleCreateTicket} style={{ marginTop: "16px" }}>
              <label>Title</label>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Payment gateway failure" required />
              <label>Priority</label>
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as any)}>
                <option value="LOW">LOW (24h Response / 72h Resolution)</option>
                <option value="MEDIUM">MEDIUM (8h Response / 48h Resolution)</option>
                <option value="HIGH">HIGH (4h Response / 24h Resolution)</option>
                <option value="URGENT">URGENT (1h Response / 4h Resolution)</option>
              </select>
              <label>Description</label>
              <textarea rows={4} value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Describe the issue in detail..." required />
              <div style={{ display: "flex", gap: "12px" }}>
                <button type="submit" className="btn btn-primary">Create Ticket</button>
                <button type="button" className="btn btn-secondary" onClick={() => setView("list")}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {view === "list" && (
          <div>
            <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
              <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} style={{ maxWidth: "200px" }}>
                <option value="">All Priorities</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ maxWidth: "200px" }}>
                <option value="">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="IN_PROGRESS">IN_PROGRESS</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>
            </div>

            {filteredTickets.map((t) => (
              <div
                key={t.id}
                className="card"
                style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onClick={() => {
                  setSelectedTicketId(t.id);
                  loadTicketDetail(t.id);
                  setView("detail");
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                    <span className={\`badge badge-\${t.priority}\`}>{t.priority}</span>
                    <span className={\`badge badge-\${t.status}\`}>{t.status}</span>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Reporter: {t.reporter.name}</span>
                  </div>
                  <h3>{t.title}</h3>
                </div>

                <div style={{ textAlign: "right" }}>
                  <span className={\`badge sla-\${t.sla.resolutionState}\`} style={{ display: "inline-block", marginBottom: "4px" }}>
                    Resolution: {t.sla.resolutionState} ({t.sla.resolutionRemainingMinutes}m left)
                  </span>
                  <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Assignee: {t.assignee?.name || "Unassigned"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {view === "detail" && selectedTicket && (
          <div>
            <button className="btn btn-secondary" onClick={() => setView("list")} style={{ marginBottom: "16px" }}>
              ← Back to Tickets
            </button>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                    <span className={\`badge badge-\${selectedTicket.priority}\`}>{selectedTicket.priority}</span>
                    <span className={\`badge badge-\${selectedTicket.status}\`}>{selectedTicket.status}</span>
                  </div>
                  <h2>{selectedTicket.title}</h2>
                  <p style={{ color: "#cbd5e1", marginTop: "8px" }}>{selectedTicket.description}</p>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ marginBottom: "8px" }}>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>First Response SLA: </span>
                    <span className={\`badge sla-\${selectedTicket.sla.firstResponseState}\`}>
                      {selectedTicket.sla.firstResponseState} ({selectedTicket.sla.firstResponseRemainingMinutes}m)
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: "12px", color: "#94a3b8" }}>Resolution SLA: </span>
                    <span className={\`badge sla-\${selectedTicket.sla.resolutionState}\`}>
                      {selectedTicket.sla.resolutionState} ({selectedTicket.sla.resolutionRemainingMinutes}m)
                    </span>
                  </div>
                </div>
              </div>

              {user.role === "AGENT" && (
                <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #334155", display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: "14px", fontWeight: "600" }}>Agent Actions:</span>
                  <select
                    style={{ maxWidth: "200px", margin: 0 }}
                    value={selectedTicket.assignee?.id || ""}
                    onChange={(e) => handleAssign(e.target.value)}
                  >
                    <option value="">Assign to Agent...</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>

                  {selectedTicket.status === "OPEN" && (
                    <button className="btn btn-primary" onClick={() => handleStatusChange("IN_PROGRESS")}>
                      Start Working (IN_PROGRESS)
                    </button>
                  )}

                  {selectedTicket.status === "IN_PROGRESS" && (
                    <button className="btn btn-primary" style={{ background: "#16a34a" }} onClick={handleResolve}>
                      Resolve Ticket
                    </button>
                  )}

                  {selectedTicket.status === "RESOLVED" && (
                    <>
                      <button className="btn btn-secondary" onClick={() => handleStatusChange("IN_PROGRESS")}>
                        Reopen Ticket
                      </button>
                      <button className="btn btn-danger" onClick={() => handleStatusChange("CLOSED")}>
                        Close Ticket
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <h3>Comments & First Response Track</h3>
              <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                {selectedTicket.comments.length === 0 ? (
                  <p style={{ color: "#94a3b8", fontSize: "14px" }}>No comments yet.</p>
                ) : (
                  selectedTicket.comments.map((c) => (
                    <div key={c.id} style={{ background: "#0f172a", padding: "12px", borderRadius: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <b style={{ color: "#38bdf8" }}>{c.author.name}</b>
                        <span style={{ fontSize: "12px", color: "#64748b" }}>
                          {new Date(c.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p style={{ fontSize: "14px", color: "#e2e8f0" }}>{c.content}</p>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleAddComment} style={{ marginTop: "20px" }}>
                <textarea
                  rows={3}
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Write a comment or response..."
                  required
                />
                <button type="submit" className="btn btn-primary">Add Comment</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
`,
};

console.log("⚡ Generating Frontend files...");
for (const [relativePath, content] of Object.entries(frontendFiles)) {
  const fullPath = path.join(process.cwd(), relativePath);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  console.log(" ✅ Created:", relativePath);
}
console.log("\n🎉 FRONTEND FILES GENERATED SUCCESSFULLY!");