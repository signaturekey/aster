import { ApplicationList } from "@web/features/projects/Applications";
import { ProjectHeading, ProjectNav } from "@web/features/projects/ui";
export function ApplicationsPage() {
  return (
    <>
      <ProjectNav />
      <ProjectHeading label="ВАШ СЛЕДУЮЩИЙ ШАГ" title="Начало общего дела." />
      <ApplicationList />
    </>
  );
}
