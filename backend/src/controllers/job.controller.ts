import type { Request, Response } from "express";
import { Job } from "../models/job.model.js";
import { AppError } from "../lib/AppError.js";

// admin post krega job
export const postJob = async (req: Request, res: Response): Promise<void> => {
  const {
    title,
    description,
    requirements,
    salary,
    location,
    jobType,
    experience,
    position,
    companyId,
  } = req.body;
  const userId = req.id;

  if (
    !title ||
    !description ||
    !requirements ||
    !salary ||
    !location ||
    !jobType ||
    !experience ||
    !position ||
    !companyId
  ) {
    throw AppError.badRequest("MISSING_FIELDS", "Something is missing.");
  }
  const job = await Job.create({
    title,
    description,
    requirements: requirements.split(","),
    salary: Number(salary),
    location,
    jobType,
    experienceLevel: experience,
    position,
    company: companyId,
    created_by: userId,
  });
  res.status(201).json({
    message: "New job created successfully.",
    job,
    success: true,
  });
};

// student k liye
export const getAllJobs = async (req: Request, res: Response): Promise<void> => {
  const keyword = (req.query.keyword as string) || "";
  const query = {
    $or: [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
    ],
  };
  const jobs = await Job.find(query)
    .populate({
      path: "company",
    })
    .sort({ createdAt: -1 });
  res.status(200).json({
    jobs,
    success: true,
  });
};

// Public: the job board renders for anonymous visitors.
export const getJobById = async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;
  // `applications` is excluded at the query, not stripped afterwards. It used to
  // be *populated* here, and the client read it to decide whether to show
  // "Already Applied" — which meant every visitor to a job page received that
  // job's entire applicant list. The client now asks the seeker-scoped
  // /application/get about its own applications, which is the only question it
  // ever actually needed answered.
  const job = await Job.findById(jobId)
    .select("-applications")
    .populate({ path: "company" })
    .lean();
  if (!job) {
    throw AppError.notFound("JOB_NOT_FOUND", "Jobs not found.");
  }

  res.status(200).json({ job, success: true });
};

// admin kitne job create kra hai abhi tk
export const getAdminJobs = async (req: Request, res: Response): Promise<void> => {
  const adminId = req.id;
  const jobs = await Job.find({ created_by: adminId }).populate({
    path: "company",
    createdAt: -1,
  } as never);
  res.status(200).json({
    jobs,
    success: true,
  });
};
