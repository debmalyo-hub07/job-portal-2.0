import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import Navbar from "./shared/Navbar";
import HeroSection from "./HeroSection";
import CategoryCarousel from "./CategoryCarousel";
import LatestJobs from "./LatestJobs";
import Footer from "./Footer";
import useGetAllJobs from "@/hooks/useGetAllJobs";
import { useAppSelector } from "@/redux/store";

const Home = () => {
  useGetAllJobs();
  const { user } = useAppSelector((state) => state.auth);
  const navigate = useNavigate();

  useEffect(() => {
    if (user?.portal === "recruiter") {
      navigate("/admin/companies", { replace: true });
    }
  }, [user?.portal, navigate]);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />
      {/*
        Not PageShell: this page owns a full-bleed navbar and footer, so the
        container lives inside rather than wrapping everything. data-density is
        set here so the sections' --space-* tokens resolve.
      */}
      <div data-density="spacious" className="mx-auto max-w-7xl px-6">
        <HeroSection />
        <CategoryCarousel />
        <LatestJobs />
      </div>
      <Footer />
    </div>
  );
};

export default Home;
