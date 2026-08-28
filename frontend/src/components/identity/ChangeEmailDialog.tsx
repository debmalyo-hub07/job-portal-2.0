import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { EmailChangeResponse, ProfileView } from "@jobportal/shared";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/layout/FormField";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";
import { apiClient, setCsrfToken } from "@/lib/apiClient";
import { getApiErrorCode, getApiErrorMessage } from "@/lib/apiError";
import { clearPortalHint } from "@/lib/portal";
import { loginPathFor } from "@/lib/portalHome";
import { clearPortalSession } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

type ChangeEmailDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  profile: ProfileView;
};

/** Which code the dialog is waiting for. Admins see both, in order. */
type Step = "form" | "current-code" | "new-code";

/** The readable sentence for each refusal the start step can make. */
function startErrorFor(code: string | null, fallback: string): string {
  if (code === "EMAIL_TAKEN") return "An account already exists for that address.";
  if (code === "PASSWORD_INVALID") return "That password is incorrect.";
  if (code === "EMAIL_UNCHANGED") return "That is already your email address.";
  return fallback;
}

/**
 * The email-change flow, on the profile of every portal.
 *
 * The shape follows the session projection: `hasPassword` decides whether the
 * password re-entry renders (admins always have one; a Google-only account
 * has none), and a `pendingEmailChange` left over from a closed dialog
 * resumes at the code step — for an admin, at whichever of the two code steps
 * the pending state says is next.
 *
 * Completing the change is a sign-out on purpose: the server killed every
 * session including this one, so the dialog clears the portal's local state
 * and lands on that portal's own login with the sentence explaining why.
 */
const ChangeEmailDialog = ({ open, setOpen, profile }: ChangeEmailDialogProps) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const { user } = profile;
  const isAdmin = user.portal === "admin";
  // The admin mount (ADR-0006) vs the shared user mount; both expose the
  // same two steps.
  const base = isAdmin ? "/admin" : "/user";

  const [step, setStep] = useState<Step>("form");
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The password field renders for accounts that have one — the step-up that
  // keeps a stolen session from redirecting the account's mail. An admin
  // always has one (password login is the only admin sign-in), so the
  // projection answers true for them too.
  const needsPassword = user.hasPassword;

  // Reset on open, resuming a pending change at the code step it is on. The
  // pending state survives the dialog being closed mid-flow.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setStatus(null);
    setCode("");
    setPassword("");
    const pending = user.pendingEmailChange;
    if (!pending) {
      setStep("form");
      setNewEmail("");
      return;
    }
    setNewEmail(pending.newEmail);
    setStep(isAdmin && !pending.confirmedCurrentAt ? "current-code" : "new-code");
  }, [open, user.pendingEmailChange, isAdmin]);

  const submitStart = async (): Promise<void> => {
    const res = await apiClient.post<EmailChangeResponse>(`${base}/email-change`, {
      newEmail,
      ...(needsPassword ? { password } : {}),
    });
    setStatus(res.data.message ?? null);
    setStep(isAdmin ? "current-code" : "new-code");
    setCode("");
  };

  const finish = (): void => {
    const portal = user.portal;
    // The server already killed every session; mirror that locally so guards
    // and the navbar do not act on a session that no longer exists.
    dispatch(clearPortalSession(portal));
    setCsrfToken(portal, null);
    clearPortalHint(portal);
    setOpen(false);
    navigate(loginPathFor(portal), {
      state: { notice: "Email updated — sign in with your new address." },
    });
  };

  const submitConfirm = async (): Promise<void> => {
    const res = await apiClient.post<EmailChangeResponse>(`${base}/email-change/confirm`, { code });
    if (step === "current-code") {
      // Admin stage 1 of 2: the current address is proven, and the second
      // code has just been mailed to the new one.
      setStatus(res.data.message ?? null);
      setStep("new-code");
      setCode("");
      return;
    }
    toast.success(res.data.message ?? "Email updated.");
    finish();
  };

  const submit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (step === "form") {
        await submitStart();
      } else {
        await submitConfirm();
      }
    } catch (caught) {
      // Confirm's rejections other than EMAIL_TAKEN are uniform by design,
      // so the generic sentence is the honest one for a bad code.
      setError(startErrorFor(getApiErrorCode(caught), getApiErrorMessage(caught, "That did not work. Please try again.")));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    step === "form"
      ? newEmail.trim().length > 0 && (!needsPassword || password.length > 0)
      : /^\d{6}$/.test(code.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent data-density="compact" className="sm:max-w-md" onInteractOutside={() => setOpen(false)}>
        <DialogHeader>
          <DialogTitle>
            {step === "form" ? "Change your email address" : "Enter the confirmation code"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} noValidate>
          <div className="py-2">
            {status ? (
              <p role="status" className="mb-(--space-field) text-sm text-ink-muted">
                {status}
              </p>
            ) : null}

            {step === "form" ? (
              <>
                <FormField label="Current email" htmlFor="change-email-current">
                  <Input id="change-email-current" value={user.email} readOnly disabled />
                </FormField>
                <FormField
                  label="New email address"
                  htmlFor="change-email-new"
                  required
                  hint="A confirmation code is sent to the new address; nothing changes until it is entered."
                >
                  <Input
                    id="change-email-new"
                    name="newEmail"
                    type="email"
                    autoComplete="email"
                    spellCheck={false}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    disabled={busy}
                    placeholder="you@example.com"
                  />
                </FormField>
                {needsPassword ? (
                  <FormField
                    label="Password"
                    htmlFor="change-email-password"
                    required
                    hint="Confirming it is you before the address that recovers your account moves."
                  >
                    <PasswordInput
                      id="change-email-password"
                      name="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                    />
                  </FormField>
                ) : null}
              </>
            ) : (
              <FormField
                label={
                  step === "current-code"
                    ? "Code sent to your current address"
                    : "Code sent to your new address"
                }
                htmlFor="change-email-code"
                required
                hint={
                  step === "current-code"
                    ? `Changing to ${newEmail}. First confirm the address you are leaving.`
                    : `Enter the code sent to ${newEmail}.`
                }
              >
                <Input
                  id="change-email-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  disabled={busy}
                  placeholder="6-digit code"
                />
              </FormField>
            )}

            {error ? (
              <p role="alert" className="mt-2 text-xs text-danger-text">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" className="my-2 w-full" disabled={busy || !canSubmit}>
              {busy ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Please wait
                </>
              ) : step === "form" ? (
                "Send code"
              ) : (
                "Confirm"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ChangeEmailDialog;
