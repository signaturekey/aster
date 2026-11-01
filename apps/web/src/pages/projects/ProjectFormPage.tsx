import { Link, useParams } from "react-router-dom";
import { useSession } from "@web/shared/lib/session-context";
import {
  useProject,
  useProjectDictionaries,
} from "@web/entities/project/queries";
import { ProjectForm } from "@web/features/projects/ProjectForm";
import { ProjectHeading, ProjectNav } from "@web/features/projects/ui";
import { Empty, ErrorPanel, Loading } from "@web/shared/ui/feedback";

export function ProjectFormPage() {
  const { projectId = "" } = useParams();
  const { me } = useSession();
  const project = useProject(projectId);
  const dictionaries = useProjectDictionaries();
  if (projectId && project.isError)
    return (
      <ErrorPanel
        error={project.error}
        retry={() => {
          void project.refetch();
        }}
      />
    );
  if (dictionaries.isError)
    return (
      <ErrorPanel
        error={dictionaries.error}
        retry={() => {
          void dictionaries.refetch();
        }}
      />
    );
  if (!dictionaries.data || (projectId && !project.data)) return <Loading />;
  if (projectId && project.data?.ownerId !== me?.id)
    return (
      <Empty title="Редактирование недоступно">
        Изменять проект может только текущий владелец.{" "}
        <Link to={`/projects/${projectId}`} className="underline">
          К проекту
        </Link>
      </Empty>
    );
  if (!projectId && !me?.profile.complete)
    return (
      <Empty title="Сначала немного о вас">
        Для создания проекта нужен полный профиль.{" "}
        <Link to="/profile/edit" className="underline">
          Заполнить профиль
        </Link>
      </Empty>
    );
  return (
    <>
      <ProjectNav />
      <ProjectHeading
        label={projectId ? "НАСТРОЙКА ИДЕИ" : "НОВЫЙ ПРОЕКТ"}
        title={
          projectId
            ? "Идеи меняются. Это нормально."
            : "Дайте своей идее начало."
        }
      />
      <ProjectForm
        key={`${me?.id}:${projectId}`}
        {...(projectId && project.data ? { project: project.data } : {})}
        dictionaries={dictionaries.data}
      />
    </>
  );
}
