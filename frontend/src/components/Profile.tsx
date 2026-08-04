import { useEffect, useState } from "react";
import { Contact, Mail, Pen } from "lucide-react";
import type { ProfileResponse, ProfileView } from "@jobportal/shared";

import Navbar from "./shared/Navbar";
import { Avatar, AvatarImage } from "./ui/avatar";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import AppliedJobTable from "./AppliedJobTable";
import UpdateProfileDialog from "./UpdateProfileDialog";
import useGetAppliedJobs from "@/hooks/useGetAppliedJobs";
import { apiClient } from "@/lib/apiClient";
import { useAppSelector } from "@/redux/store";

const Profile = () => {
  useGetAppliedJobs();
  const [open, setOpen] = useState(false);
  const { bootstrapped } = useAppSelector((state) => state.auth);
  /**
   * Page data, held locally rather than in redux. `SessionUser` deliberately
   * carries no profile fields, and the profile is not session state — putting
   * it in the store would make every consumer of `state.auth.user` re-render
   * on a bio edit.
   */
  const [profile, setProfile] = useState<ProfileView | null>(null);

  useEffect(() => {
    // Wait for /me: firing this before bootstrap races the refresh interceptor
    // for the same 401 and produces two refreshes on a cold load.
    if (!bootstrapped) return;
    let cancelled = false;
    apiClient
      .get<ProfileResponse>("/user/profile")
      .then((res) => {
        if (!cancelled) setProfile(res.data.profile);
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapped]);

  const skills = profile?.seeker?.skills ?? [];
  const resumeUrl = profile?.seeker?.resumeUrl;

  return (
    <div>
      <Navbar />
      <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-2xl my-5 p-8">
        <div className="flex justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarImage
                src={profile?.user.avatarUrl ?? undefined}
                alt={profile?.user.fullName}
              />
            </Avatar>
            <div>
              <h1 className="font-medium text-xl">{profile?.user.fullName}</h1>
              <p>{profile?.seeker?.bio}</p>
            </div>
          </div>
          <Button onClick={() => setOpen(true)} className="text-right" variant="outline">
            <Pen />
          </Button>
        </div>
        <div className="my-5">
          <div className="flex items-center gap-3 my-2">
            <Mail />
            <span>{profile?.user.email}</span>
          </div>
          <div className="flex items-center gap-3 my-2">
            <Contact />
            <span>{profile?.phone}</span>
          </div>
        </div>
        <div className="my-5">
          <h1>Skills</h1>
          <div className="flex items-center gap-1">
            {skills.length > 0 ? (
              skills.map((item) => <Badge key={item}>{item}</Badge>)
            ) : (
              <span>No skills listed</span>
            )}
          </div>
        </div>
        <div className="grid w-full max-w-sm items-center gap-1.5">
          <Label className="text-md font-bold">Resume</Label>
          {/* Previously gated on a hardcoded `const isResume = true`, so the
              link rendered even when no resume existed. */}
          {resumeUrl ? (
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={resumeUrl}
              className="text-blue-500 w-full hover:underline cursor-pointer"
            >
              {profile?.seeker?.resumeName ?? "Download resume"}
            </a>
          ) : (
            <span>No resume available</span>
          )}
        </div>
      </div>
      <div className="max-w-4xl mx-auto bg-white rounded-2xl">
        <h1 className="font-bold text-lg my-5">Applied Jobs</h1>
        <AppliedJobTable />
      </div>
      <UpdateProfileDialog
        open={open}
        setOpen={setOpen}
        profile={profile}
        onUpdated={setProfile}
      />
    </div>
  );
};

export default Profile;
