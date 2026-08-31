import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProfileResponse, ProfileView } from "@jobportal/shared";

import IdentityCard from "@/components/identity/IdentityCard";
import { IdentityFieldset, type IdentityValue } from "@/components/identity/IdentityFieldset";
import { FormField } from "@/components/layout/FormField";
import PageShell from "@/components/layout/PageShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setUser } from "@/redux/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

/**
 * The admin's own account.
 *
 * Reads `/admin/profile`, not `/user/profile`. `authenticateAny` deliberately
 * excludes admin — ADR-0006: an admin cookie must never silently satisfy a route
 * that meant "some signed-in user" — so the console has its own mount of the same
 * two controller functions.
 *
 * No completion gate: admin is ungated by decision, so this page is where an
 * admin fills in a date of birth whenever they choose rather than being made to.
 * Nothing in the platform reads it, and the account that can unblock every other
 * account must not sit behind a new gate.
 *
 * JSON, not multipart, unlike the other two profile forms: the admin mount carries
 * no multer, because there is no file path into an admin row.
 */
const AdminProfile = () => {
  const { bootstrapped } = useAppSelector((state) => state.auth);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState<IdentityValue>({ dob: "", phone: "", gender: "" });
  const [fullname, setFullname] = useState("");
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Wait for /me: firing before bootstrap races the refresh interceptor for the
    // same 401 and produces two refreshes on a cold load.
    if (!bootstrapped) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<ProfileResponse>("/admin/profile")
      .then((res) => {
        if (cancelled) return;
        const view = res.data.profile;
        setProfile(view ?? null);
        if (!view) return;
        setIdentity({
          dob: view.dob ?? "",
          phone: view.phone ?? "",
          gender: view.gender ?? "",
        });
        setFullname(view.user.fullName);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapped]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiClient.post<ProfileResponse>("/admin/profile/update", {
        fullname,
        phone: identity.phone,
        // Omitted when blank rather than sent as "": neither is clearable, so a
        // blank would 400 an edit to the name beside it.
        ...(identity.dob ? { dob: identity.dob } : {}),
        ...(identity.gender ? { gender: identity.gender } : {}),
      });
      setProfile(res.data.profile);
      dispatch(setUser(res.data.profile.user));
      toast.success(res.data.message ?? "Profile updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save your details"));
    } finally {
      setSaving(false);
    }
  };

  return (
    /* An account page, not a console section — the same treatment the seeker's
       and the recruiter's profiles get. It used to render AdminShell, whose
       section nav (Dashboard/Recruiters/Candidates/…) has nothing to do with
       this page and does not even list it; below `lg` that nav is a horizontal
       band between the navbar and the form, which read as a stray panel rather
       than chrome. The route mounts this inside PublicLayout, which owns the
       navbar — the wordmark still returns to /admin, and the navbar's session
       links still carry Dashboard. */
    <PageShell density="compact" motion="response">
      <PageHeader title="Your account" description="The details Cairn holds for you." />
      <div className="grid gap-(--space-card) lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="rounded-surface border border-line bg-paper-raised p-(--space-card)">
          <h2 className="font-display text-xl font-semibold text-ink">Details</h2>
          <div className="mt-(--space-card)">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : profile ? (
              <IdentityCard profile={profile} />
            ) : (
              <p className="text-sm text-ink-muted">Could not load your account.</p>
            )}
          </div>
        </section>

        <section className="rounded-surface border border-line bg-paper-raised p-(--space-card)">
          <h2 className="font-display text-xl font-semibold text-ink">Edit</h2>
          <form onSubmit={submit} className="mt-(--space-card)" noValidate>
            <FormField label="Full name" htmlFor="fullname">
              <Input
                id="fullname"
                name="fullname"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                disabled={saving}
              />
            </FormField>

            {/* `dobRequired={false}`: nothing gates an admin on it, and absent
                means "leave alone" on every edit form. */}
            <IdentityFieldset
              value={identity}
              onChange={setIdentity}
              dobRequired={false}
              disabled={saving}
            />

            <Button type="submit" variant="signal" disabled={saving || loading}>
              {saving ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </section>
      </div>
    </PageShell>
  );
};

export default AdminProfile;
