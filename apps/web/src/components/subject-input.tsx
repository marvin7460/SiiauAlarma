"use client";

import { useEffect, useId, useRef, useState } from "react";

interface Suggestion {
  code: string;
  name: string;
}

interface SubjectInputProps {
  name: string;
  defaultValue?: string;
  /** The campus currently selected in the form; suggestions depend on it. */
  centerSelectId: string;
}

/**
 * Text input with suggestions from subjects already seen in SIIAU (ARIA combobox pattern).
 * Without JavaScript it is a plain input and the search still works.
 */
export function SubjectInput({ name, defaultValue = "", centerSelectId }: SubjectInputProps) {
  const id = useId();
  const listId = `${id}-lista`;
  const [value, setValue] = useState(defaultValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef<AbortController>(undefined);

  // Cancel a pending lookup if the component goes away.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      inFlight.current?.abort();
    },
    [],
  );

  /** Waits until typing pauses for 200 ms, then asks our API (never SIIAU). */
  const requestSuggestions = (text: string) => {
    clearTimeout(timer.current);
    inFlight.current?.abort();
    const center = (document.getElementById(centerSelectId) as HTMLSelectElement | null)?.value;
    if (!center || text.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(() => {
      const controller = new AbortController();
      inFlight.current = controller;
      const params = new URLSearchParams({ centro: center, q: text.trim() });
      fetch(`/api/materias?${params.toString()}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<Suggestion[]>) : []))
        .then((items) => {
          setSuggestions(items);
          setActive(-1);
          setOpen(items.length > 0);
        })
        .catch(() => undefined); // aborted or offline: typing still works
    }, 200);
  };

  const choose = (suggestion: Suggestion) => {
    clearTimeout(timer.current);
    setValue(suggestion.code);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      const suggestion = suggestions[active];
      if (suggestion) choose(suggestion);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          requestSuggestions(event.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
        }}
        onFocus={() => {
          setOpen(suggestions.length > 0);
        }}
        required
        minLength={2}
        maxLength={60}
        autoComplete="off"
        spellCheck={false}
        placeholder="Clave (I5890) o nombre (bases de datos)"
        role="combobox"
        aria-label="Materia"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${String(active)}` : undefined}
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Materias sugeridas"
          className="absolute z-10 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-stone-200 bg-white shadow-lg dark:border-stone-700 dark:bg-stone-900"
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.code}
              id={`${listId}-${String(index)}`}
              role="option"
              aria-selected={index === active}
              // mousedown runs before the input's blur closes the list.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(suggestion);
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${
                index === active ? "bg-emerald-50 dark:bg-emerald-950" : ""
              }`}
            >
              <span className="font-mono font-semibold">{suggestion.code}</span>{" "}
              <span className="text-stone-600 dark:text-stone-400">{suggestion.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
