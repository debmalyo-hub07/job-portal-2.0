import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProfileResponse, ProfileView } from "@jobportal/shared";

import { FormField } from "@/components/layout/FormField";
import { apiClient } from "@/lib/apiClient";
import { getApiErrorMessage } from "@/lib/apiError";
import { setUser } from "@/redux/authSlice";
import { useAppDispatch } from "@/redux/store";

type UpdateProfileDialogProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  profile: ProfileView | null;
  onUpdated: (profile: ProfileView) => void;
};

/** `null` → "", any number (including 0) → its digits. */
const numText = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

/**
 * The three answers to "would you work remotely?".
 *
 * Not a checkbox. `remoteFit` returns 1 for an unknown — "the seeker never said,
 * don't fault the job" — and 0 for an explicit `false` against a remote role, so
 * collapsing the two costs every remote listing the factor's full 12 points for
 * anyone who ever saved their profile without ticking a box. The explicit "No
 * preference" is the same reasoning `FilterCard` uses for its ceilings: a value
 * you can only reach by *not* interacting is a value a keyboard cannot express.
 */
const REMOTE_CHOICES = [
  { value: "", label: "No preference", id: "openToRemote-any" },
  { value: "true", label: "Open to remote", id: "openToRemote-yes" },
  { value: "false", label: "Prefer on-site", id: "openToRemote-no" },
] as const;

const UpdateProfileDialog = ({
  open,
  setOpen,
  profile,
  onUpdated,
}: UpdateProfileDialogProps) => {
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();

  // Every value is the string the form posts, including the numeric ones: the
  // endpoint reads multipart fields, and "" is how it is told to clear one.
  const [input, setInput] = useState({
    fullname: "",
    phoneNumber: "",
    bio: "",
    skills: "",
    experienceYears: "",
    location: "",
    salaryMin: "",
    salaryMax: "",
    openToRemote: "",
    file: null as File | null,
  });

  // Prefilled in an effect, not in useState's initialiser: the parent fetches
  // the profile after this component has already mounted, and an initialiser
  // runs once against the `null` it saw first.
  useEffect(() => {
    if (!profile) return;
    setInput({
      fullname: profile.user.fullName,
      phoneNumber: profile.phone ?? "",
      bio: profile.seeker?.bio ?? "",
      skills: profile.seeker?.skills.join(", ") ?? "",
      experienceYears: numText(profile.seeker?.experienceYears),
      location: profile.seeker?.location ?? "",
      salaryMin: numText(profile.seeker?.salaryMin),
      salaryMax: numText(profile.seeker?.salaryMax),
      // null is "no preference", which is a real answer and not the same as
      // "prefer on-site" — so it maps to "" rather than "false".
      openToRemote:
        profile.seeker?.openToRemote === null || profile.seeker?.openToRemote === undefined
          ? ""
          : String(profile.seeker.openToRemote),
      file: null,
    });
  }, [profile]);

  /**
   * An inverted band scores every job at 0 on salary, and nothing downstream can
   * tell it from a deliberate one: `salaryFit` sees `lo > hi` and no real salary
   * is ever inside. The schema cannot catch it either — a partial update sees one
   * bound and not the other — so the form, which holds both, is the only place
   * it can be refused.
   */
  const bandError = useMemo(() => {
    const lo = Number(input.salaryMin);
    const hi = Number(input.salaryMax);
    if (input.salaryMin === "" || input.salaryMax === "") return undefined;
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return undefined;
    return lo > hi ? "Your minimum is above your maximum." : undefined;
  }, [input.salaryMin, input.salaryMax]);

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const fileChangeHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, file: e.target.files?.[0] ?? null });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (bandError) return;
    const formData = new FormData();
    // Every text field is posted whether or not it changed, blank included: the
    // dialog renders each one seeded from the stored value, so it is
    // authoritative for all of them and a blank box is the user saying "clear
    // it". `clearableInt` in the schema is what turns that into `null` rather
    // than `Number("")`, which is `0`.
    formData.append("fullname", input.fullname);
    formData.append("phoneNumber", input.phoneNumber);
    formData.append("bio", input.bio);
    formData.append("skills", input.skills);
    formData.append("experienceYears", input.experienceYears);
    formData.append("location", input.location);
    formData.append("salaryMin", input.salaryMin);
    formData.append("salaryMax", input.salaryMax);
    formData.append("openToRemote", input.openToRemote);
    if (input.file) {
      formData.append("file", input.file);
    }
    try {
      setLoading(true);
      const res = await apiClient.post<ProfileResponse>("/user/profile/update", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      // The name and avatar in the navbar come from the session user, so that
      // has to be refreshed too — the rest goes back to the page.
      dispatch(setUser(res.data.profile.user));
      onUpdated(res.data.profile);
      toast.success(res.data.message ?? "Profile updated successfully.");
      setOpen(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not update profile"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* `data-density="compact"` rather than hand-tuned margins: the fields read
          `--space-field`, and a modal is a dense surface by its nature. Nine
          fields exceed a short viewport, so the body scrolls rather than the
          footer leaving the screen. */}
      <DialogContent
        data-density="compact"
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        onInteractOutside={() => setOpen(false)}
      >
        <DialogHeader>
          <DialogTitle>Update profile</DialogTitle>
        </DialogHeader>
        <form onSubmit={submitHandler}>
          <div className="py-2">
            <FormField label="Name" htmlFor="fullname">
              <Input
                id="fullname"
                name="fullname"
                type="text"
                value={input.fullname}
                onChange={changeEventHandler}
              />
            </FormField>

            {/* Read-only: the update endpoint dropped `email` from the mutable
                set, so an editable field here would silently discard whatever
                the user typed. The hint is `FormField`'s, so it is announced —
                as a loose <p> it was associated with nothing. */}
            <FormField
              label="Email"
              htmlFor="email"
              hint="Your email address cannot be changed here."
            >
              <Input id="email" name="email" type="email" value={profile?.user.email ?? ""} readOnly disabled />
            </FormField>

            <FormField label="Phone" htmlFor="phoneNumber">
              <Input
                id="phoneNumber"
                name="phoneNumber"
                value={input.phoneNumber}
                onChange={changeEventHandler}
              />
            </FormField>

            <FormField label="Bio" htmlFor="bio">
              <Input id="bio" name="bio" value={input.bio} onChange={changeEventHandler} />
            </FormField>

            <FormField label="Skills" htmlFor="skills" hint="Comma separated, e.g. React, Node, MongoDB.">
              <Input id="skills" name="skills" value={input.skills} onChange={changeEventHandler} />
            </FormField>

            <FormField label="Resume" htmlFor="file" hint="PDF only.">
              <Input
                id="file"
                name="file"
                type="file"
                accept="application/pdf"
                onChange={fileChangeHandler}
              />
            </FormField>

            <Separator className="mb-(--space-field)" />

            {/* Named, because five inputs that look like more form-filling are
                the five the fit score on every job card is computed from. Saying
                so is what makes the badge legible later. */}
            <h3 className="text-sm font-medium text-ink">How you want to be matched</h3>
            <p className="mt-1 mb-(--space-field) text-xs text-ink-muted">
              These five answers are what the fit score on each job is worked out from. Leave
              anything blank and it simply stops counting against a role.
            </p>

            <FormField label="Years of experience" htmlFor="experienceYears" hint="0–60.">
              <Input
                id="experienceYears"
                name="experienceYears"
                type="number"
                min={0}
                max={60}
                inputMode="numeric"
                value={input.experienceYears}
                onChange={changeEventHandler}
              />
            </FormField>

            <FormField
              label="Preferred location"
              htmlFor="location"
              hint="One city. A role elsewhere still shows, it just scores lower."
            >
              <Input
                id="location"
                name="location"
                value={input.location}
                onChange={changeEventHandler}
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Salary from (LPA)" htmlFor="salaryMin">
                <Input
                  id="salaryMin"
                  name="salaryMin"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={input.salaryMin}
                  onChange={changeEventHandler}
                />
              </FormField>
              <FormField label="Salary to (LPA)" htmlFor="salaryMax" error={bandError}>
                <Input
                  id="salaryMax"
                  name="salaryMax"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={input.salaryMax}
                  onChange={changeEventHandler}
                />
              </FormField>
            </div>

            <fieldset className="mb-(--space-field)">
              <legend className="mb-1.5 text-sm leading-none font-medium text-ink">
                Remote work
              </legend>
              <div className="flex flex-col gap-1.5">
                {REMOTE_CHOICES.map((choice) => (
                  <div key={choice.id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      id={choice.id}
                      name="openToRemote"
                      value={choice.value}
                      checked={input.openToRemote === choice.value}
                      onChange={changeEventHandler}
                      className="size-4 border-line accent-[var(--signal-text)]"
                    />
                    <Label htmlFor={choice.id} className="cursor-pointer font-normal text-ink-muted">
                      {choice.label}
                    </Label>
                  </div>
                ))}
              </div>
            </fieldset>
          </div>
          <DialogFooter>
            <Button type="submit" className="my-2 w-full" disabled={loading || Boolean(bandError)}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" /> Please wait
                </>
              ) : (
                "Update"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UpdateProfileDialog;
