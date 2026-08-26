import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, Clock, Loader2, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import type { AccountStatus, ProfileResponse, ProfileView } from "@jobportal/shared";

import HireShell from "./HireShell";
import IdentityCard from "@/components/identity/IdentityCard";
import { IdentityFieldset, type IdentityValue } from "@/components/identity/IdentityFieldset";
import { FormField } from "@/components/layout/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setUser } from "@/redux/authSlice";
import { useAppDispatch, useAppSelector } from "@/redux/store";

/**
 * What the account's status actually means for the person reading it.
 *
 * `toSessionUser` has carried `status` since 3A precisely so "the client has a
 * session it can explain" — and until this page, nothing explained it. A pending
 * recruiter saw an approval screen instead of the workspace and had nowhere to
 * read their own account state.
 */
const APPROVAL_COPY: Record<AccountStatus, { icon: typeof Clock; title: string; body: string }> = {
  pending: {
    icon: Clock,
    title: "Awaiting approval",
    body: "An admin is reviewing your account. You'll get an email as soon as it's approved, and you can post roles then.",
  },
  active: {
    icon: CheckCircle2,
    title: "Approved",
    body: "You can post roles and read applicants.",
  },
  suspended: {
    icon: ShieldOff,
    title: "Suspended",
    body: "This account cannot post roles. Contact support if you think this is a mistake.",
  },
};

const RecruiterProfile = () => {
  const { bootstrapped } = useAppSelector((state) => state.auth);
  const [profile, setProfile] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [identity, setIdentity] = useState<IdentityValue>({ dob: "", phone: "", gender: "" });
  const [designation, setDesignation] = useState("");
  const [fullname, setFullname] = useState("");
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Wait for /me: firing before bootstrap races the refresh interceptor for the
    // same 401 and produces two refreshes on a cold load. Same rule as Profile.
    if (!bootstrapped) return;
    let cancelled = false;
    setLoading(true);
    apiClient
      .get<ProfileResponse>("/user/profile")
      .then((res) => {
        if (cancelled) return;
        const view = res.data.profile;
        setProfile(view);
        setIdentity({
          dob: view.dob ?? "",
          phone: view.phone ?? "",
          gender: view.gender ?? "",
        });
        setDesignation(view.recruiter?.designation ?? "");
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
    // Multipart, matching `/user/profile/update`'s other caller: the endpoint
    // carries `resumeUpload`, so a JSON body would not be parsed at all.
    const body = new FormData();
    body.append("fullname", fullname);
    body.append("designation", designation);
    body.append("phone", identity.phone);
    // Omitted when blank rather than sent as "": neither is clearable, so a blank
    // would 400 an edit to the designation beside it.
    if (identity.dob) body.append("dob", identity.dob);
    if (identity.gender) body.append("gender", identity.gender);
    try {
      const res = await apiClient.post<ProfileResponse>("/user/profile/update", body, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setProfile(res.data.profile);
      // The navbar's name comes from the session user, so that has to be
      // refreshed too — the rest stays on the page.
      dispatch(setUser(res.data.profile.user));
      toast.success(res.data.message ?? "Profile updated.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save your details"));
    } finally {
      setSaving(false);
    }
  };

  const approval = APPROVAL_COPY[profile?.user.status ?? "pending"];
  const ApprovalIcon = approval.icon;

  return (
    <HireShell
      title="Your account"
      description="The details Cairn holds for you, and what your account can currently do."
    >
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

          <div className="mt-(--space-card) border-t border-line pt-(--space-card)">
            <div className="flex items-start gap-2">
              <ApprovalIcon className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{approval.title}</p>
                <p className="mt-1 text-sm text-ink-muted">{approval.body}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-surface border border-line bg-paper-raised p-(--space-card)">
          <h2 className="font-display text-xl font-semibold text-ink">Edit</h2>
          <form onSubmit={submit} className="mt-(--space-card)" noValidate>
            {/* The other half of the public byline: `POSTER_FIELDS` sends
                `fullName designation` to every job detail page. A recruiter had no
                way to correct either. */}
            <FormField label="Full name" htmlFor="fullname" hint="Your name as candidates see it.">
              <Input
                id="fullname"
                name="fullname"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                disabled={saving}
              />
            </FormField>

            <FormField
              label="Designation"
              htmlFor="designation"
              hint="Shown on every role you post."
            >
              <Input
                id="designation"
                name="designation"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                disabled={saving}
                placeholder="Talent Lead"
              />
            </FormField>

            {/* `dobRequired={false}`: correctable here, but absent means "leave
                alone" — a required marker would imply this form refuses to save
                without re-entering a date already stored. */}
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
    </HireShell>
  );
};

export default RecruiterProfile;
