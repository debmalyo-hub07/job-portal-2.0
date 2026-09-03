import HeroSection from "./HeroSection";
import CategoryCarousel from "./CategoryCarousel";
import LatestJobs from "./LatestJobs";
import { MOTION_VARS } from "@/components/layout/motionTiers";

const Home = () => {
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
    // `overflow-x-clip` — clip, not hidden: hidden computes the other axis to
    // `auto`, which makes this wrapper a scroll container — and the hero's
    // scroll-drift timeline resolves its subject's nearest ancestor scroller,
    // so a hidden here pins the drift at a constant progress no matter how
    // the page scrolls. Clip stops the same horizontal overflow without
    // becoming a scroller.
    <div
      data-density="spacious"
      data-motion="ambient"
      style={MOTION_VARS.ambient}
      className="overflow-x-clip"
    >
      <HeroSection />
      <CategoryCarousel />
      <LatestJobs />
    </div>
  );
};

export default Home;
