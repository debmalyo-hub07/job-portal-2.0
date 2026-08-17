import mongoose, { type HydratedDocument } from "mongoose";

import { mongoDatabaseName, env } from "../config/env.js";
import { Company, type CompanyDocument } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Recruiter } from "../models/recruiter.model.js";

const CATALOG_OWNER_EMAIL = "catalog@demo.invalid";

const COMPANIES = [
  {
    key: "northstar",
    name: "Northstar Labs (Demo)",
    description: "A product engineering studio building dependable tools for distributed teams.",
    location: "Bengaluru",
    logoPath: "/images/companies/demo-northstar.svg",
  },
  {
    key: "common-thread",
    name: "Common Thread (Demo)",
    description: "A design and research practice helping complex services feel coherent.",
    location: "Mumbai",
    logoPath: "/images/companies/demo-common-thread.svg",
  },
  {
    key: "fieldwork",
    name: "Fieldwork Data (Demo)",
    description: "A data platform team turning operational signals into practical decisions.",
    location: "Pune",
    logoPath: "/images/companies/demo-fieldwork.svg",
  },
] as const;

const JOBS = [
  {
    companyKey: "northstar",
    title: "Senior Product Engineer",
    description:
      "Own customer-facing product work from discovery through delivery with a small cross-functional team. You will shape technical direction, pair closely with design, and leave the product easier to change than you found it.",
    requirements: ["React", "TypeScript", "Node.js", "Product thinking"],
    salary: 34,
    experienceLevel: 5,
    location: "Bengaluru",
    jobType: "Full-time",
    position: "2 openings",
    remote: true,
  },
  {
    companyKey: "northstar",
    title: "Platform Reliability Engineer",
    description:
      "Improve the systems that keep product teams shipping calmly. Build observability, strengthen deployment paths, and turn recurring operational work into clear, reliable automation.",
    requirements: ["AWS", "Kubernetes", "Observability", "Infrastructure as code"],
    salary: 31,
    experienceLevel: 4,
    location: "Bengaluru",
    jobType: "Full-time",
    position: "1 opening",
    remote: true,
  },
  {
    companyKey: "common-thread",
    title: "Design Systems Lead",
    description:
      "Build the foundations, tools, and working agreements that help multiple product teams ship coherent interfaces. The role balances hands-on craft with facilitation and long-term system stewardship.",
    requirements: ["Design systems", "Figma", "Accessibility", "Facilitation"],
    salary: 29,
    experienceLevel: 6,
    location: "Mumbai",
    jobType: "Full-time",
    position: "1 opening",
    remote: false,
  },
  {
    companyKey: "common-thread",
    title: "Senior UX Researcher",
    description:
      "Plan and run mixed-method research for services used in high-stakes, everyday work. Turn evidence into decisions teams can act on and help partners build a durable research practice.",
    requirements: ["Qualitative research", "Survey design", "Synthesis", "Stakeholder alignment"],
    salary: 25,
    experienceLevel: 5,
    location: "Mumbai",
    jobType: "Contract",
    position: "1 opening",
    remote: true,
  },
  {
    companyKey: "fieldwork",
    title: "Data Platform Engineer",
    description:
      "Shape reliable data products, improve observability, and make analytics faster for teams across the business. You will own pipelines end to end and improve the developer experience around them.",
    requirements: ["Python", "SQL", "Data pipelines", "Cloud warehouses"],
    salary: 31,
    experienceLevel: 4,
    location: "Pune",
    jobType: "Full-time",
    position: "3 openings",
    remote: true,
  },
  {
    companyKey: "fieldwork",
    title: "Machine Learning Product Analyst",
    description:
      "Work between product, operations, and machine learning teams to define useful model outcomes, evaluate performance in context, and turn ambiguous questions into measurable experiments.",
    requirements: ["Product analytics", "SQL", "Experiment design", "ML evaluation"],
    salary: 22,
    experienceLevel: 3,
    location: "Pune",
    jobType: "Full-time",
    position: "2 openings",
    remote: false,
  },
] as const;

export type SeedDemoCatalogInput = {
  allowNonDemoJobs?: boolean;
};

export type SeedDemoCatalogResult = {
  recruiterCreated: boolean;
  companiesCreated: number;
  jobsCreated: number;
  companiesTotal: number;
  jobsTotal: number;
};

/**
 * Creates a clearly-labelled preview catalog for an otherwise empty database.
 * The synthetic owner has no password or Google identity and therefore cannot
 * sign in. Existing real jobs block the operation unless the caller explicitly
 * opts in; rerunning against this catalog is idempotent.
 */
export async function seedDemoCatalog(
  input: SeedDemoCatalogInput,
): Promise<SeedDemoCatalogResult> {
  const existingOwner = await Recruiter.findOne({ email: CATALOG_OWNER_EMAIL }).select(
    "+passwordHash",
  );

  if (existingOwner && (existingOwner.passwordHash || existingOwner.googleId)) {
    throw new Error("The reserved demo catalog owner is attached to a login identity; refusing to use it.");
  }

  const nonDemoFilter = existingOwner
    ? { created_by: mongoose.trusted({ $ne: existingOwner._id }) }
    : {};
  const nonDemoJobs = await Job.countDocuments(nonDemoFilter);
  if (nonDemoJobs > 0 && !input.allowNonDemoJobs) {
    throw new Error(
      `Refusing to seed demo jobs into a database that already contains ${nonDemoJobs} non-demo job(s).`,
    );
  }

  let owner = existingOwner;
  let recruiterCreated = false;
  if (!owner) {
    owner = await Recruiter.create({
      email: CATALOG_OWNER_EMAIL,
      fullName: "Cairn Demo Catalog",
      passwordHash: null,
      googleId: null,
      emailVerifiedAt: new Date(),
      status: "active",
      designation: "Sample marketplace owner",
    });
    recruiterCreated = true;
  }

  const companyByKey = new Map<string, HydratedDocument<CompanyDocument>>();
  let companiesCreated = 0;

  for (const definition of COMPANIES) {
    let company = await Company.findOne({ userId: owner._id, name: definition.name });
    /**
     * Stored relative, not absolute. These three files ship inside the web app's
     * own `public/`, so a path resolves against whatever origin is serving the
     * page and the logo works in every environment at once. An absolute URL
     * built from WEB_BASE_URL only works while the browser happens to be on that
     * exact origin: from `localhost:5173` it is cross-origin, and the production
     * CSP allows images from `'self'`, Cloudinary and Google only — so the day a
     * custom domain is attached, every demo logo would fail the policy and drop
     * to initials with nothing in the API to explain it.
     *
     * Recruiter-uploaded logos stay absolute, because they really do live on
     * another origin (`res.cloudinary.com`, allowlisted for that reason).
     */
    const logo = definition.logoPath;
    if (!company) {
      company = await Company.create({
        name: definition.name,
        description: definition.description,
        location: definition.location,
        logo,
        userId: owner._id,
      });
      companiesCreated += 1;
    } else {
      company.description = definition.description;
      company.location = definition.location;
      company.logo = logo;
      await company.save();
    }
    companyByKey.set(definition.key, company);
  }

  let jobsCreated = 0;
  for (const definition of JOBS) {
    const company = companyByKey.get(definition.companyKey);
    if (!company) throw new Error(`Missing demo company ${definition.companyKey}`);

    const exists = await Job.exists({
      created_by: owner._id,
      company: company._id,
      title: definition.title,
    });
    if (exists) continue;

    await Job.create({
      title: definition.title,
      description: definition.description,
      requirements: [...definition.requirements],
      salary: definition.salary,
      experienceLevel: definition.experienceLevel,
      location: definition.location,
      jobType: definition.jobType,
      position: definition.position,
      remote: definition.remote,
      company: company._id,
      created_by: owner._id,
    });
    jobsCreated += 1;
  }

  return {
    recruiterCreated,
    companiesCreated,
    jobsCreated,
    companiesTotal: await Company.countDocuments({ userId: owner._id }),
    jobsTotal: await Job.countDocuments({ created_by: owner._id }),
  };
}

const invokedDirectly = /seed-demo-catalog\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await import("dotenv/config");
  const config = env();
  const database = mongoDatabaseName(config.MONGO_URI) ?? "test";
  const confirmationIndex = process.argv.indexOf("--confirm-database");
  const confirmedDatabase =
    confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1];

  if (confirmedDatabase !== database) {
    console.error(
      `Refusing to seed. Re-run with --confirm-database ${database} after verifying that database is the intended target.`,
    );
    process.exit(1);
  }

  await mongoose.connect(config.MONGO_URI);
  try {
    const result = await seedDemoCatalog({
      allowNonDemoJobs: process.argv.includes("--allow-nonempty"),
    });
    console.log(
      `demo catalog ready: ${result.companiesTotal} companies, ${result.jobsTotal} jobs (${result.companiesCreated} companies and ${result.jobsCreated} jobs created)`,
    );
  } finally {
    await mongoose.disconnect();
  }
}
