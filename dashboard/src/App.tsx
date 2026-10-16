import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, hasConfig, clearToken, getMeta, getConfig, type Project, type Service } from "./lib/api";
import { usePoll } from "./lib/usePoll";
import { statusOf } from "./lib/derive";
import { useStatusAlerts } from "./lib/useStatusAlerts";
import { primeAudio } from "./lib/sound";
import { enablePush, disablePush } from "./lib/push";
import { LoginGate } from "./components/LoginGate";
import { SetupGate } from "./components/SetupGate";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { Overview } from "./components/Overview";
import { ServiceDetail, ServiceDetailSkeleton } from "./components/ServiceDetail";
import { Settings } from "./components/Settings";
import { AddServiceModal } from "./components/AddServiceModal";
import { Toast } from "./components/Toast";
import { PublicStatus } from "./components/PublicStatus";

type Screen = "overview" | "settings" | "detail";
type Theme = "light" | "dark";
interface Route { screen: Screen; projectId: string | null; serviceId: string | null }

/** URL path -> app route.  /p/:pid  ·  /p/:pid/s/:sid  ·  /settings  ·  / */
function parsePath(): Route {
  const parts = location.pathname.split("/").filter(Boolean);
  if (parts[0] === "settings") return { screen: "settings", projectId: null, serviceId: null };
  if (parts[0] === "p" && parts[1]) {
    if (parts[2] === "s" && parts[3]) return { screen: "detail", projectId: parts[1], serviceId: parts[3] };
    return { screen: "overview", projectId: parts[1], serviceId: null };
  }
  return { screen: "overview", projectId: null, serviceId: null };
}
/** The share slug if this is a public status URL (/status/:slug), else null. */
function statusSlugFromPath(): string | null {
  const parts = location.pathname.split("/").filter(Boolean);
  return parts[0] === "status" && parts[1] ? parts[1] : null;
}

/** App route -> URL path. */
function buildPath(r: Route): string {
  if (r.screen === "settings") return "/settings";
  if (r.screen === "detail" && r.projectId && r.serviceId) return `/p/${r.projectId}/s/${r.serviceId}`;
  if (r.projectId) return `/p/${r.projectId}`;
  return "/";
}

function initialTheme(): Theme {
  const saved = localStorage.getItem("ug_theme");
  if (saved === "light" || saved === "dark") return saved;
  return matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export default function App() {
  const [authed, setAuthed] = useState(hasConfig());
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [screen, setScreen] = useState<Screen>(() => parsePath().screen);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState<string | null>(() => parsePath().projectId);
  const [serviceId, setServiceId] = useState<string | null>(() => parsePath().serviceId);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Service | null>(null);
  const [toast, setToast] = useState("");
  const [sound, setSound] = useState(() => localStorage.getItem("ug_sound") !== "0");
  const [notify, setNotify] = useState(() => localStorage.getItem("ug_notify") === "1");
  const [navOpen, setNavOpen] = useState(false);
  const [meta, setMeta] = useState<{ demo: boolean; setup_required: boolean } | null>(null);
  const toastT = useRef<number | undefined>(undefined);

  // --- Path routing: state is the source of truth; navigate() also writes the URL. ---
  const routeRef = useRef<Route>({ screen, projectId, serviceId });
  routeRef.current = { screen, projectId, serviceId };

  const navigate = useCallback((patch: Partial<Route>, replace = false) => {
    const next: Route = { ...routeRef.current, ...patch };
    routeRef.current = next;
    setScreen(next.screen);
    setProjectId(next.projectId);
    setServiceId(next.serviceId);
    const path = buildPath(next);
    if (location.pathname !== path) history[replace ? "replaceState" : "pushState"]({}, "", path);
  }, []);

  // Back/forward: read the URL back into state (no history write).
  useEffect(() => {
    const onPop = () => {
      const r = parsePath();
      routeRef.current = r;
      setScreen(r.screen);
      setProjectId(r.projectId);
      setServiceId(r.serviceId);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ug_theme", theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem("ug_sound", sound ? "1" : "0"); }, [sound]);
  useEffect(() => { localStorage.setItem("ug_notify", notify ? "1" : "0"); }, [notify]);

  // Ensure a push subscription exists whenever notifications are enabled (covers
  // users who turned them on before push, or after a service-worker update).
  useEffect(() => {
    if (authed && notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
      enablePush().catch(() => {});
    }
  }, [authed, notify]);

  // Reset scroll to the top on every view change, so opening a service from the
  // bottom of a long list doesn't land you scrolled halfway down the page.
  useEffect(() => { window.scrollTo(0, 0); }, [screen, serviceId, projectId]);

  // Lock background scrolling while a modal or the mobile nav drawer is open.
  useEffect(() => {
    const root = document.documentElement;
    const prev = root.style.overflow;
    if (addOpen || navOpen) root.style.overflow = "hidden";
    return () => { root.style.overflow = prev; };
  }, [addOpen, navOpen]);

  // Resume the AudioContext on the user's first interaction (browsers require a gesture).
  useEffect(() => {
    const h = () => { primeAudio(); window.removeEventListener("pointerdown", h); };
    window.addEventListener("pointerdown", h);
    return () => window.removeEventListener("pointerdown", h);
  }, []);

  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastT.current);
    toastT.current = window.setTimeout(() => setToast(""), 2600);
  }, []);

  const onAuthError = useCallback(() => setAuthed(false), []);

  // While logged out, learn whether this instance needs first-run setup or a login.
  useEffect(() => {
    if (!authed) getMeta(getConfig().baseUrl).then(setMeta).catch(() => setMeta({ demo: false, setup_required: false }));
  }, [authed]);

  const loadProjects = useCallback(async () => {
    try {
      const p = await api.listProjects();
      setProjects(p);
    } catch (e) {
      if (e instanceof Error && e.name === "AuthError") setAuthed(false);
    }
  }, []);

  useEffect(() => {
    if (authed) loadProjects();
  }, [authed, loadProjects]);

  // Resolve a default/valid project once projects load (e.g. landed on "/" or a stale id).
  useEffect(() => {
    if (statusSlugFromPath()) return; // don't hijack a public /status/ route
    if (!authed || projects.length === 0) return;
    const valid = projectId != null && projects.some((p) => p.id === projectId);
    if (valid) return;
    if (screen === "settings") {
      setProjectId(projects[0].id);
      routeRef.current = { ...routeRef.current, projectId: projects[0].id };
    } else {
      navigate({ projectId: projects[0].id, serviceId: null, screen: "overview" }, true);
    }
  }, [authed, projects, projectId, screen, navigate]);

  // Poll services for the selected project · visibility-aware, non-overlapping.
  const svc = usePoll<Service[]>(
    () => (projectId ? api.listServices(projectId) : Promise.resolve([])),
    [projectId],
    { enabled: authed && !!projectId, onAuthError }
  );
  const services = svc.data;

  const servicesByProject = useMemo<Record<string, Service[] | undefined>>(
    () => (projectId && services ? { [projectId]: services } : {}),
    [projectId, services]
  );

  useStatusAlerts(services, { sound, notify, say });

  const project = projects.find((p) => p.id === projectId) ?? null;
  const selected = services?.find((s) => s.id === serviceId) ?? null;
  const downCount = services ? services.filter((s) => statusOf(s) === "down").length : 0;
  const dotColor = svc.error ? "var(--warn)" : downCount > 0 ? "var(--down)" : "var(--up)";

  function logout() {
    clearToken();
    setAuthed(false);
    setProjects([]);
    navigate({ screen: "overview", projectId: null, serviceId: null }, true);
  }

  async function toggleNotify() {
    if (notify) { setNotify(false); disablePush().catch(() => {}); return; }
    if (typeof Notification === "undefined") { say("当前环境不支持通知"); return; }
    if (Notification.permission === "denied") { say("通知已被浏览器阻止"); return; }
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm !== "granted") { say("未获得通知权限"); return; }
    setNotify(true);
    try { await enablePush(); say("桌面通知已开启 · 关闭应用也能收到"); }
    catch { say("桌面通知已开启"); }
  }

  async function setPublic(makePublic: boolean) {
    if (!project) return;
    try {
      const updated = await api.setProjectPublic(project.id, makePublic);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      say(makePublic ? "公开状态页已开启" : "公开状态页已关闭");
    } catch {
      say("无法更新状态页");
    }
  }

  async function renameProject(name: string) {
    if (!project) return;
    try {
      const updated = await api.renameProject(project.id, name);
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      say(`已重命名为「${updated.name}」`);
    } catch {
      say("重命名项目失败");
    }
  }

  async function deleteProject() {
    if (!project) return;
    const gone = project.id;
    try {
      await api.deleteProject(gone);
      const rest = projects.filter((p) => p.id !== gone);
      setProjects(rest);
      // Land on whatever project is left, or the empty state.
      navigate({ projectId: rest[0]?.id ?? null, serviceId: null, screen: "overview" }, true);
      say("项目已删除");
    } catch {
      say("删除项目失败");
    }
  }

  async function createProject(name: string) {
    try {
      const p = await api.createProject(name);
      setProjects((prev) => [p, ...prev]);
      navigate({ projectId: p.id, serviceId: null, screen: "overview" });
      say(`项目「${p.name}」已创建`);
    } catch {
      say("创建项目失败");
    }
  }

  const publicSlug = statusSlugFromPath();
  if (publicSlug) return <PublicStatus slug={publicSlug} />;

  if (!authed) {
    if (meta === null) return null; // decide setup vs login once /api/meta returns
    const onReady = () => { setMeta(null); setAuthed(true); navigate({ projectId: null, serviceId: null, screen: "overview" }, true); };
    return meta.setup_required ? <SetupGate onReady={onReady} /> : <LoginGate onReady={onReady} />;
  }

  const crumb =
    screen === "detail" ? (project?.name ?? "").toUpperCase() + " / 服务详情"
    : screen === "settings" ? "所有者"
    : (project?.name ?? "-").toUpperCase() + (services ? ` / ${services.length} 个服务` : "");
  const title = screen === "detail" ? (selected?.name ?? "服务") : screen === "settings" ? "设置" : project?.name ?? "Uptime Guard";

  return (
    <div className="app">
      <div className="body">
        <Sidebar
          projects={projects}
          selectedId={projectId}
          servicesByProject={servicesByProject}
          screen={screen === "detail" ? "overview" : screen}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          onSelectProject={(id) => { navigate({ projectId: id, serviceId: null, screen: "overview" }); setNavOpen(false); }}
          onScreen={(s) => { navigate({ screen: s, serviceId: null }); setNavOpen(false); }}
          onCreateProject={createProject}
          onLogout={logout}
        />
        <main className="main">
          <Header
            crumb={crumb}
            title={title}
            dotColor={dotColor}
            updatedAt={svc.updatedAt}
            error={!!svc.error}
            sound={sound}
            onToggleSound={() => { primeAudio(); setSound((v) => !v); }}
            onMenu={() => setNavOpen(true)}
            onRefresh={svc.refresh}
            onAdd={() => { setEditTarget(null); setAddOpen(true); }}
          />

          {(() => {
            const overview = (
              <Overview
                services={services}
                loading={svc.loading}
                error={svc.error}
                projectName={project?.name ?? "此项目"}
                onOpen={(id) => navigate({ screen: "detail", serviceId: id })}
                onAdd={() => { setEditTarget(null); setAddOpen(true); }}
                onRefresh={svc.refresh}
                isPublic={!!project?.public && !!project?.public_slug}
                publicSlug={project?.public_slug ?? null}
                onSetPublic={setPublic}
                onRenameProject={renameProject}
                onDeleteProject={deleteProject}
              />
            );
            if (screen === "settings")
              return (
                <Settings
                  theme={theme}
                  onTheme={setTheme}
                  sound={sound}
                  onToggleSound={() => { primeAudio(); setSound((v) => !v); }}
                  notify={notify}
                  onToggleNotify={toggleNotify}
                  onLogout={logout}
                  say={say}
                />
              );
            if (screen === "detail") {
              if (selected)
                return (
                  <ServiceDetail
                    service={selected}
                    onBack={() => navigate({ screen: "overview", serviceId: null })}
                    onMutated={svc.refresh}
                    onEdit={(s) => { setEditTarget(s); setAddOpen(true); }}
                    say={say}
                  />
                );
              // Service not resolved yet: show a detail-shaped skeleton while loading
              // (prevents the Overview flashing in), and only fall back to Overview if
              // the list has loaded and the id genuinely isn't there.
              if (svc.loading || services == null)
                return <ServiceDetailSkeleton onBack={() => navigate({ screen: "overview", serviceId: null })} />;
            }
            return overview;
          })()}
        </main>
      </div>

      {addOpen && projectId && (
        <AddServiceModal
          projectId={projectId}
          projectName={project?.name ?? "项目"}
          edit={editTarget}
          onClose={() => { setAddOpen(false); setEditTarget(null); }}
          onCreated={() => { setAddOpen(false); setEditTarget(null); svc.refresh(); }}
          say={say}
        />
      )}
      {toast && <Toast msg={toast} />}
    </div>
  );
}
