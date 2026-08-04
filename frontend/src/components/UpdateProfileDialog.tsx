import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ProfileResponse, ProfileView } from "@jobportal/shared";

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

const UpdateProfileDialog = ({
  open,
  setOpen,
  profile,
  onUpdated,
}: UpdateProfileDialogProps) => {
  const [loading, setLoading] = useState(false);
  const dispatch = useAppDispatch();

  const [input, setInput] = useState({
    fullname: "",
    phoneNumber: "",
    bio: "",
    skills: "",
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
      file: null,
    });
  }, [profile]);

  const changeEventHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, [e.target.name]: e.target.value });
  };

  const fileChangeHandler = (e: ChangeEvent<HTMLInputElement>) => {
    setInput({ ...input, file: e.target.files?.[0] ?? null });
  };

  const submitHandler = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append("fullname", input.fullname);
    formData.append("phoneNumber", input.phoneNumber);
    formData.append("bio", input.bio);
    formData.append("skills", input.skills);
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
    <div>
      <Dialog open={open}>
        <DialogContent className="sm:max-w-[425px]" onInteractOutside={() => setOpen(false)}>
          <DialogHeader>
            <DialogTitle>Update Profile</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitHandler}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="fullname" className="text-right">
                  Name
                </Label>
                <Input
                  id="fullname"
                  name="fullname"
                  type="text"
                  value={input.fullname}
                  onChange={changeEventHandler}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email" className="text-right">
                  Email
                </Label>
                {/* Read-only: the update endpoint dropped `email` from the
                    mutable set, so an editable field here would silently
                    discard whatever the user typed. */}
                <div className="col-span-3">
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={profile?.user.email ?? ""}
                    readOnly
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your email address cannot be changed here.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phoneNumber" className="text-right">
                  Number
                </Label>
                <Input
                  id="phoneNumber"
                  name="phoneNumber"
                  value={input.phoneNumber}
                  onChange={changeEventHandler}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="bio" className="text-right">
                  Bio
                </Label>
                <Input
                  id="bio"
                  name="bio"
                  value={input.bio}
                  onChange={changeEventHandler}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="skills" className="text-right">
                  Skills
                </Label>
                <Input
                  id="skills"
                  name="skills"
                  value={input.skills}
                  onChange={changeEventHandler}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="file" className="text-right">
                  Resume
                </Label>
                <Input
                  id="file"
                  name="file"
                  type="file"
                  accept="application/pdf"
                  onChange={fileChangeHandler}
                  className="col-span-3"
                />
              </div>
            </div>
            <DialogFooter>
              {loading ? (
                <Button className="w-full my-4">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Please wait
                </Button>
              ) : (
                <Button type="submit" className="w-full my-4">
                  Update
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UpdateProfileDialog;
