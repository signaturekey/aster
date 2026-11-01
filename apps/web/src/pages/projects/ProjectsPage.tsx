import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  catalogueFilters,
  catalogueParams,
  dedupeRows,
  type CatalogueFilters,
} from "@web/entities/project/helpers";
import {
  useProjectDictionaries,
  useProjectList,
} from "@web/entities/project/queries";
import type { Dictionaries, Project } from "@web/entities/project/types";
import { within } from "@web/shared/lib/forms";
import { Button } from "@web/shared/ui/button";
import {
  Empty,
  ErrorPanel,
  Field,
  inputClass,
  Loading,
} from "@web/shared/ui/feedback";
import { More, ProjectHeading, ProjectNav } from "@web/features/projects/ui";

function Search({
  filters,
  dictionaries,
  onSearch,
}: {
  filters: CatalogueFilters;
  dictionaries: Dictionaries;
  onSearch: (next: CatalogueFilters) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CatalogueFilters>({ defaultValues: filters });
  const submit = handleSubmit(onSearch);
  return (
    <form
      onSubmit={(event) => {
        void submit(event);
      }}
      className="mb-8 grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_200px_auto] sm:items-end"
    >
      <Field label="Поиск по названию и описанию" error={errors.q?.message}>
        <input
          className={inputClass}
          placeholder="Какая идея вам близка?"
          {...register("q", { validate: (value) => within(value, 200) })}
        />
      </Field>
      <Field label="Формат">
        <select className={inputClass} {...register("goalId")}>
          <option value="">Все форматы</option>
          {dictionaries.goals.map((goal) => (
            <option key={goal.id} value={goal.id}>
              {goal.label}
            </option>
          ))}
        </select>
      </Field>
      <Button>Найти</Button>
    </form>
  );
}
function ProjectTile({
  project,
  dictionaries,
}: {
  project: Project;
  dictionaries: Dictionaries | undefined;
}) {
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-24 items-end justify-between gap-3 bg-[#eee7dc] p-5">
        <span className="rounded-full bg-card px-3 py-1 text-xs">
          {dictionaries?.goals.find((goal) => goal.id === project.goalId)
            ?.label ?? project.goalId}
        </span>
        <span className="text-xs">
          {project.recruitmentOpen ? "Набор открыт" : "Набор закрыт"}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <h2 className="text-base font-bold break-words">
          <Link to={`/projects/${project.id}`}>{project.title}</Link>
        </h2>
        <p className="line-clamp-3 break-words text-muted-foreground">
          {project.description}
        </p>
        <div className="flex flex-wrap gap-2">
          {project.requiredRoles.map((role, index) => (
            <span
              key={index}
              className="rounded-full border border-border px-3 py-1 text-xs break-words"
            >
              {role}
            </span>
          ))}
        </div>
        <Link
          className="mt-auto pt-3 text-sm font-semibold underline"
          to={`/projects/${project.id}`}
        >
          Познакомиться с проектом →
        </Link>
      </div>
    </article>
  );
}
export function ProjectsPage({ mine = false }: { mine?: boolean }) {
  const [params, setParams] = useSearchParams();
  const filters = catalogueFilters(params);
  const dictionaries = useProjectDictionaries();
  const query = useProjectList(mine, filters);
  const rows = dedupeRows(query.data?.pages, (project) => project.id);
  return (
    <>
      <ProjectNav />
      <ProjectHeading
        label={mine ? "ВАШИ КОМАНДЫ" : "ПРОЕКТЫ"}
        title={
          mine
            ? "То, что вы делаете вместе."
            : "Найдите идею, к которой хочется присоединиться."
        }
      >
        <Button asChild>
          <Link to="/projects/new">Создать проект</Link>
        </Button>
      </ProjectHeading>
      <p className="mb-6 max-w-xl text-muted-foreground">
        {mine
          ? "Свои проекты и команды, частью которых вы стали. Только текущее участие, не история принятых заявок."
          : "От маленького эксперимента до первого запуска. У каждого начала есть место для вас."}
      </p>
      {dictionaries.isError && (
        <ErrorPanel
          error={dictionaries.error}
          retry={() => {
            void dictionaries.refetch();
          }}
        />
      )}
      {!mine && dictionaries.data && (
        <Search
          key={params.toString()}
          filters={filters}
          dictionaries={dictionaries.data}
          onSearch={(next) => setParams(catalogueParams(next))}
        />
      )}
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Сначала новые проекты · без оценки общего количества
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
          }}
        >
          Обновить
        </Button>
      </div>
      {query.isPending && <Loading />}
      {query.isError && (
        <ErrorPanel
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      )}
      {query.isSuccess && !rows.length && (
        <Empty title={mine ? "Пока без команды" : "Пока ничего не нашлось"}>
          Попробуйте другой запрос или начните свой проект.
        </Empty>
      )}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((project) => (
          <ProjectTile
            key={project.id}
            project={project}
            dictionaries={dictionaries.data}
          />
        ))}
      </div>
      <More {...query} />
      <p className="mt-12 text-center text-muted-foreground">
        Не обязательно сразу менять мир.
        <br />
        Достаточно идеи, которую хочется проверить.
      </p>
    </>
  );
}
export function MyProjectsPage() {
  return <ProjectsPage mine />;
}
