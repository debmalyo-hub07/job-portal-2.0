import { useEffect } from "react";
import { useNavigate } from "react-router";

import HeroSection from "./HeroSection";
import CategoryCarousel from "./CategoryCarousel";
import LatestJobs from "./LatestJobs";
import useGetAllJobs from "@/hooks/useGetAllJobs";
import { homePathFor } from "@/lib/portalHome";
import { useAppSelector } from "@/redux/store";

const Home = () => {
  useGetAllJobs();
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    // The board is the seeker's product; every other portal has a home of its
    // own. Written as "not a seeker" rather than "is a recruiter" so the admin
    // added in 3A does not fall through to the seeker board — which is exactly
    // how the post-login gap survived that phase.
    if (user && user.portal !== "seeker") {
      navigate(homePathFor(user.portal), { replace: true });
    }
  }, [user, navigate]);

  return (
    // Navbar and footer come from PublicLayout. data-density is set here so the
    // sections' --space-* tokens resolve; this page owns a full-bleed layout
    // rather than PageShell's container.
    <div data-density="spacious" className="mx-auto max-w-7xl px-6">
      <HeroSection />
      <CategoryCarousel />
      <LatestJobs />
    </div>
  );
};

export default Home;
