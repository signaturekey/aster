import { useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { useSession } from "@web/shared/lib/session-context";
import { LandingPage } from "@web/pages/landing/LandingPage";
import { DiscoveryPage } from "@web/pages/discovery/DiscoveryPage";
import { MatchesPage } from "@web/pages/discovery/MatchesPage";
import { ProfilePage } from "@web/pages/profile/ProfilePage";
import { AuthPage } from "@web/pages/auth/AuthPage";
import { ProjectsPage, MyProjectsPage } from "@web/pages/projects/ProjectsPage";
import {
  ProjectDetailPage,
  ProjectManagePage,
} from "@web/pages/projects/ProjectDetailPage";
import { ProjectFormPage } from "@web/pages/projects/ProjectFormPage";
import { ApplicationsPage } from "@web/pages/projects/ApplicationsPage";
import { MessagesPage } from "@web/pages/messages/MessagesPage";
import { MessageEvents } from "@web/features/messages/MessageEvents";
import { Button } from "@web/shared/ui/button";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";

function Guard() {
  const session = useSession();
  const location = useLocation();
  if (session.loading) return <Loading />;
  if (session.error)
    return (
      <ErrorPanel
        error={session.error}
        retry={() => {
          void session.refresh().catch(() => undefined);
        }}
      />
    );
  if (!session.me)
    return (
      <Navigate
        replace
        to={`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
      />
    );
  return <Shell />;
}

const navigation = [
  ["/discover", "Люди"],
  ["/projects", "Проекты"],
  ["/matches", "Совпадения"],
  ["/messages", "Сообщения"],
] as const;
function Shell() {
  const session = useSession();
  const location = useLocation();
  const content = useRef<HTMLElement>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    document.title = `${navigation.find(([path]) => location.pathname.startsWith(path))?.[1] ?? "Личный кабинет"} — Aster`;
    content.current?.focus();
  }, [location.pathname]);
  return (
    <>
      <a href="#content" className="sr-only focus:not-sr-only">
        Перейти к содержимому
      </a>
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link className="wordmark" to="/">
            aster<span>.</span>
          </Link>
          <nav
            aria-label="Основная навигация"
            className="order-3 flex w-full flex-wrap gap-1 md:order-none md:w-auto"
          >
            {navigation.map(([to, title]) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold md:px-4 ${isActive ? "bg-muted" : "hover:bg-background"}`
                }
              >
                {title}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/profile" className="text-sm font-semibold">
              Мой профиль
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                void session.logout().catch(setError);
              }}
            >
              Выйти
            </Button>
          </div>
        </div>
      </header>
      <main
        id="content"
        ref={content}
        tabIndex={-1}
        className="mx-auto max-w-6xl px-5 py-8 outline-none"
      >
        <MessageEvents />
        {error !== null && <ErrorPanel error={error} />}
        {!session.me?.profile.complete && (
          <aside className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <p>Заполните профиль, чтобы искать людей и подавать заявки.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/onboarding">Заполнить профиль</Link>
            </Button>
          </aside>
        )}
        <Outlet />
      </main>
    </>
  );
}
export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/sign-in" element={<AuthPage />} />
      <Route path="/sign-up" element={<AuthPage register />} />
      <Route element={<Guard />}>
        <Route path="/discover" element={<DiscoveryPage />} />
        <Route path="/people/:personId" element={<ProfilePage />} />
        <Route path="/matches" element={<MatchesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/edit" element={<ProfilePage edit />} />
        <Route path="/onboarding" element={<ProfilePage edit />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<ProjectFormPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/projects/:projectId/edit" element={<ProjectFormPage />} />
        <Route
          path="/projects/:projectId/manage"
          element={<ProjectManagePage />}
        />
        <Route path="/messages" element={<MessagesPage />} />
        <Route path="/messages/:conversationId" element={<MessagesPage />} />
        <Route path="/my-projects" element={<MyProjectsPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
      </Route>
      <Route
        path="*"
        element={
          <main className="mx-auto max-w-xl px-5 py-20">
            <Empty title="Такой страницы нет">
              <Link to="/">Вернуться на главную</Link>
            </Empty>
          </main>
        }
      />
    </Routes>
  );
}
