import { Search } from "lucide-react";
import React, {useState} from "react";
import { Button } from "./ui/button";
import { useDispatch } from "react-redux";
import { setSearchedQuery } from "@/redux/jobSlice";
import { useNavigate } from "react-router-dom";

function HeroSection() {
  const [query, setQuery] = useState("");
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const searchJobHandler = () => {
    dispatch(setSearchedQuery(query));
    navigate("/browse");
  }
  return (
    <div className="text-center">
      <div className="flex flex-col gap-5 my-10">
        <span className="mx-auto px-4 py-2 rounded-full bg-signal-muted text-signal-text font-medium">
          No. 1 Job Hunt Website
        </span>
        <h1 className="font-display text-display-lg font-bold text-ink">
          Search, Apply & <br />
          Get Your <span className="text-signal-text">Dream Job</span>
        </h1>
        <p className="text-ink-muted text-lg">
          Find the best jobs, internships, and freelance opportunities
          tailored to your skills and interests.
        </p>
        <div className="flex w-[40%] border border-line bg-paper-raised pl-3 rounded-full items-center gap-4 mx-auto">
            <input
            type="text"
            placeholder="Search for jobs, companies, or skills"
            onChange={(e) => setQuery(e.target.value)}
            className="outline-none border-none w-full bg-transparent text-ink placeholder:text-ink-muted"
            />
            <Button onClick={searchJobHandler} variant="signal" className="rounded-r-full">
                <Search className="h-5 w-5"/>
            </Button>
        </div>
      </div>
    </div>
  );
}

export default HeroSection;
