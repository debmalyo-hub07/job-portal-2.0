import type { ReactNode } from "react";
import { Children, cloneElement, isValidElement } from "react";
import { Label } from "@/components/ui/label";

/**
 * Label + control + hint + error with one rhythm.
 *
 * The wiring matters more than the spacing: the control is cloned to receive
 * `aria-describedby` and `aria-invalid`, so a hint or an error is announced
 * rather than merely displayed. The inherited pages hardcoded hints as loose
 * `<p>` elements with no association at all.
 *
 * When both a hint and an error are present the error wins the description,
 * because it is the actionable one.
 */
export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const hintId = `${htmlFor}-hint`;
  const errorId = `${htmlFor}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const child = Children.only(children);
  const control = isValidElement<Record<string, unknown>>(child)
    ? cloneElement(child, {
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true } : {}),
      })
    : child;

  return (
    <div className="mb-(--space-field)">
      <Label htmlFor={htmlFor} className="mb-1.5 block">
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-danger">
            *
          </span>
        ) : null}
      </Label>
      {control}
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
