import HeroSection from "./HeroSection";
import CategoryCarousel from "./CategoryCarousel";
import LatestJobs from "./LatestJobs";
import useGetAllJobs from "@/hooks/useGetAllJobs";
import { MOTION_VARS } from "@/components/layout/motionTiers";

const Home = () => {
  useGetAllJobs();

  return (
    // Navbar and footer come from PublicLayout. data-density is set here so the
    // sections' --space-* tokens resolve; this page owns a full-bleed layout
    // rather than PageShell's container.
    //
    // data-motion is "ambient" because this is the marketing surface — Tier 1,
    // the only tier where the atmosphere runs at full amplitude. Without a
    // data-motion ancestor the tier resolver in lib/motion/dataset.ts defaults to
    // "response" and every ambient effect on the page correctly refuses to draw,
    // which is what happened before this attribute existed.
    <div
      data-density="spacious"
      data-motion="ambient"
      style={MOTION_VARS.ambient}
      className="overflow-x-hidden"
    >
      <HeroSection />
      <CategoryCarousel />
      <LatestJobs />
    </div>
  );
};

export default Home;
