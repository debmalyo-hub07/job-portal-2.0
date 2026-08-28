import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import type { Portal, ProfileResponse } from "@jobportal/shared";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IdentityFieldset, type IdentityValue } from "./IdentityFieldset";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { landingAfterAuth } from "@/lib/portalHome";
import { setUser } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

/**
 * The identity gate's only exit — and, for a 16-17-year-old, the doorstep of
 * Project C's guardian stage.
 *
 * The identity block saves FIRST even for a minor: the DOB is the thing that
 * makes the response say `minor: true`, which is what makes this stage render.
 * A minor then gets the guardian email → code pair before
 * `profileComplete` flips and the redirect happens; an adult completes in one
 * step exactly as before, never seeing any of this.
 */
const CompleteProfile = ({ portal }: { portal: Extract<Portal, "seeker" | "recruiter"> }) => {
  const [value, setValue] = useState<IdentityValue>({ dob: "", phone: "", gender: "" });
  const [saving, setSaving] = useState(false);

  // The guardian stage's own state. Null while the identity step is current;
  // set once a minor's block has saved.
  const [guardianStage, setGuardianStage] = useState<"email" | "code" | null>(null);
  const [guardianEmail, setGuardianEmail] = useState("");
  const [code, setCode] = useState("");

  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const submitIdentity = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiClient.post<ProfileResponse>("/user/profile/complete", {
        dob: value.dob,
        // Both omitted entirely when blank rather than sent as "": neither is
        // clearable, and "" fails E.164 and the gender enum alike.
        ...(value.phone.trim() ? { phone: value.phone.trim() } : {}),
        ...(value.gender ? { gender: value.gender } : {}),
      });
      dispatch(setUser(res.data.profile.user));
      if (res.data.profile.minor && !res.data.profile.user.profileComplete) {
        // The gate's second exit: the DOB saved, but a minor is not done.
        // The stage replaces the redirect rather than stacking under it.
        setGuardianStage("email");
        return;
      }
      // `landingAfterAuth` rather than a literal: the session it just saved is
      // complete, so this resolves to the portal's home — and stays correct if a
      // later step is ever added ahead of it.
      navigate(landingAfterAuth(res.data.profile.user), { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save your details"));
    } finally {
      setSaving(false);
    }
  };

  const submitGuardianEmail = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiClient.post<{ success: true; message: string }>(
        "/user/guardian-consent",
        { email: guardianEmail },
      );
      toast.success(res.data.message);
      setGuardianStage("code");
      setCode("");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not send the code"));
    } finally {
      setSaving(false);
    }
  };

  const submitCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post<{ success: true; message: string }>("/user/guardian-consent/confirm", {
        code,
      });
      // Re-read the profile: the confirm response carries a sentence, not the
      // session, and the store's user is what every guard reads.
      const me = await apiClient.get<{ success: true; user: ProfileResponse["profile"]["user"] }>(
        `/${portal}/auth/me`,
      );
      dispatch(setUser(me.data.user));
      navigate(landingAfterAuth(me.data.user), { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "That code did not work"));
    } finally {
      setSaving(false);
    }
  };

  // The guardian stage renders in place of the identity form — same shell,
  // same rhythm, one step at a time.
  if (guardianStage === "email" || guardianStage === "code") {
    return (
      <PageShell density="compact" width="default">
        <div className="mx-auto max-w-md">
          <PageHeader
            title="One more step: your guardian's OK"
            description="Candidates under 18 join with a guardian's confirmation. Until you turn 18, your account can apply to internship roles only."
          />
          <div className="mb-6 flex items-start gap-3 rounded-surface border border-line bg-paper-raised p-4">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-signal-text" aria-hidden />
            <p className="text-sm leading-6 text-ink-muted">
              We email a 6-digit code to your guardian. Nothing changes on the account until they
              enter it here with you.
            </p>
          </div>
          {guardianStage === "email" ? (
            <form onSubmit={submitGuardianEmail} noValidate>
              <FormField
                label="Guardian's email address"
                htmlFor="guardian-email"
                required
                hint="The code goes to them; you enter it back on this screen."
              >
                <Input
                  id="guardian-email"
                  name="guardianEmail"
                  type="email"
                  autoComplete="email"
                  value={guardianEmail}
                  onChange={(e) => setGuardianEmail(e.target.value)}
                  disabled={saving}
                  placeholder="guardian@example.com"
                />
              </FormField>
              <Button type="submit" variant="signal" className="mt-2 w-full" disabled={saving || !guardianEmail.trim()}>
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {saving ? "Sending..." : "Send the code"}
              </Button>
            </form>
          ) : (
            <form onSubmit={submitCode} noValidate>
              <FormField
                label="Code from your guardian"
                htmlFor="guardian-code"
                required
                hint={`Enter the 6-digit code sent to ${guardianEmail}.`}
              >
                <Input
                  id="guardian-code"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  disabled={saving}
                  placeholder="6-digit code"
                />
              </FormField>
              <Button
                type="submit"
                variant="signal"
                className="mt-2 w-full"
                disabled={saving || !/^\d{6}$/.test(code)}
              >
                {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
                {saving ? "Checking..." : "Confirm"}
              </Button>
            </form>
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell density="compact" width="default">
      <div className="mx-auto max-w-md">
        <PageHeader
          title="A few details before you start"
          description={
            portal === "recruiter"
              ? "We ask every account for these once."
              : "We ask every candidate for these once."
          }
        />
        <form onSubmit={submitIdentity} noValidate>
          <IdentityFieldset value={value} onChange={setValue} disabled={saving} />
          <Button type="submit" variant="signal" className="mt-2 w-full" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {saving ? "Saving..." : "Continue"}
          </Button>
        </form>
      </div>
    </PageShell>
  );
};

export default CompleteProfile;
