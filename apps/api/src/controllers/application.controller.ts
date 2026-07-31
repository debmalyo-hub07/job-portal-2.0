import type { Request, Response } from "express";
import { Application } from "../models/application.model.js";
import { Job } from "../models/job.model.js";
import { AppError } from "../lib/AppError.js";

export const applyJob = async (req: Request, res: Response): Promise<void> => {
  const userId = req.id;
  const jobId = req.params.id;
  if (!jobId) {
    throw AppError.badRequest("MISSING_FIELDS", "Job id is required.");
  }
  // check if the user has already applied for the job
  const existingApplication = await Application.findOne({ job: jobId, applicant: userId });

  if (existingApplication) {
    throw AppError.conflict("ALREADY_APPLIED", "You have already applied for this jobs");
  }

  // check if the jobs exists
  const job = await Job.findById(jobId);
  if (!job) {
    throw AppError.notFound("JOB_NOT_FOUND", "Job not found");
  }
  // create a new application
  const newApplication = await Application.create({
    job: jobId,
    applicant: userId,
  });

  job.applications.push(newApplication._id);
  await job.save();
  res.status(201).json({
    message: "Job applied successfully.",
    success: true,
  });
};

export const getAppliedJobs = async (req: Request, res: Response): Promise<void> => {
  const userId = req.id;
  const application = await Application.find({ applicant: userId })
    .sort({ createdAt: -1 })
    .populate({
      path: "job",
      options: { sort: { createdAt: -1 } },
      populate: {
        path: "company",
        options: { sort: { createdAt: -1 } },
      },
    });
  res.status(200).json({
    application,
    success: true,
  });
};

// admin dekhega kitna user ne apply kiya hai
export const getApplicants = async (req: Request, res: Response): Promise<void> => {
  const jobId = req.params.id;
  const job = await Job.findById(jobId).populate({
    path: "applications",
    options: { sort: { createdAt: -1 } },
    populate: {
      path: "applicant",
    },
  });
  if (!job) {
    throw AppError.notFound("JOB_NOT_FOUND", "Job not found.");
  }
  res.status(200).json({
    job,
    success: true,
  });
};

export const updateStatus = async (req: Request, res: Response): Promise<void> => {
  const { status } = req.body;
  const applicationId = req.params.id;
  if (!status) {
    throw AppError.badRequest("MISSING_FIELDS", "status is required");
  }

  // find the application by applicantion id
  const application = await Application.findOne({ _id: applicationId });
  if (!application) {
    throw AppError.notFound("APPLICATION_NOT_FOUND", "Application not found.");
  }

  // update the status
  application.status = status.toLowerCase();
  await application.save();

  res.status(200).json({
    message: "Status updated successfully.",
    success: true,
  });
};
