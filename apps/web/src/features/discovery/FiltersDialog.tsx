import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import type { Dictionaries } from "@web/entities/profile/queries";
import type { DiscoveryFilters } from "@web/entities/discovery/queries";
import { filterCount } from "@web/entities/discovery/filters";
import { Button } from "@web/shared/ui/button";
import { Field, inputClass } from "@web/shared/ui/feedback";
import { Icon } from "@web/shared/ui/icon";

export function FiltersDialog({
  filters,
  dictionaries,
  disabled,
  onChange,
  open,
  onOpenChange,
}: {
  filters: DiscoveryFilters;
  dictionaries: Dictionaries;
  disabled: boolean;
  onChange: (filters: DiscoveryFilters) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <Button ref={trigger} variant="outline" disabled={disabled}>
          <Icon name="settings" size={17} />
          Настроить подборку{" "}
          {filterCount(filters) > 0 && `(${filterCount(filters)})`}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-foreground/30" />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 z-50 max-h-[85dvh] w-[calc(100%-32px)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-xl"
        >
          <Dialog.Title className="text-xl font-bold">
            Кто вам интересен?
          </Dialog.Title>
          <Dialog.Description className="mb-6 mt-2 text-muted-foreground">
            Категории сочетаются: специализация И опыт И навыки И цели. Все
            выбранные навыки, хотя бы одна выбранная цель.
          </Dialog.Description>
          <div className="grid gap-5">
            {(
              [
                [
                  "specializationId",
                  "Специализация",
                  dictionaries.specializations,
                ],
                ["experienceId", "Опыт", dictionaries.experienceLevels],
              ] as const
            ).map(([key, label, items]) => (
              <Field key={key} label={label}>
                <select
                  className={inputClass}
                  value={filters[key] ?? ""}
                  disabled={disabled}
                  onChange={(event) => {
                    const next = { ...filters };
                    if (event.target.value) next[key] = event.target.value;
                    else delete next[key];
                    onChange(next);
                  }}
                >
                  <option value="">Любая</option>
                  {filters[key] &&
                    !items.some((item) => item.id === filters[key]) && (
                      <option value={filters[key]}>
                        Неизвестное значение: {filters[key]}
                      </option>
                    )}
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
            {(
              [
                ["skillIds", "Навыки — все выбранные", dictionaries.skills, 20],
                ["goalIds", "Цели — хотя бы одна", dictionaries.goals, 5],
              ] as const
            ).map(([key, label, items, limit]) => (
              <fieldset key={key} className="grid gap-3">
                <legend className="mb-3 font-semibold">{label}</legend>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => {
                    const selected = filters[key]?.includes(item.id) ?? false;
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={
                            disabled ||
                            (!selected && (filters[key]?.length ?? 0) >= limit)
                          }
                          onChange={() => {
                            const values = selected
                              ? (filters[key]?.filter((id) => id !== item.id) ??
                                [])
                              : [...(filters[key] ?? []), item.id];
                            const next = { ...filters };
                            if (values.length) next[key] = values;
                            else delete next[key];
                            onChange(next);
                          }}
                        />
                        {item.label}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="mt-7 flex flex-wrap justify-between gap-3">
            <Button
              variant="outline"
              disabled={disabled}
              onClick={() => onChange({})}
            >
              Сбросить фильтры
            </Button>
            <Dialog.Close asChild>
              <Button>Готово</Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
