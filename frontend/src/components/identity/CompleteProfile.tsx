import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Portal, ProfileResponse } from "@jobportal/shared";

import { PageShell } from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { IdentityFieldset, type IdentityValue } from "./IdentityFieldset";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { landingAfterAuth } from "@/lib/portalHome";
import { setUser } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

/**
 * The identity gate's only exit.
 *
 * The route lives under `PublicLayout`, which supplies the one shared Navbar.
 * The user already holds a session, so this remains outside `AuthLayout`.
 */
const CompleteProfile = ({ portal }: { portal: Extract<Portal, "seeker" | "recruiter"> }) => {
  const [value, setValue] = useState<IdentityValue>({ dob: "", phone: "", gender: "" });
  const [saving, setSaving] = useState(false);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
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
        <form onSubmit={submit} noValidate>
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
