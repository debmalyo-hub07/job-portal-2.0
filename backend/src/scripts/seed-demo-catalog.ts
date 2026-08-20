import mongoose, { type HydratedDocument } from "mongoose";

import { mongoDatabaseName, env } from "../config/env.js";
import { Company, type CompanyDocument } from "../models/company.model.js";
import { Job } from "../models/job.model.js";
import { Recruiter } from "../models/recruiter.model.js";

const CATALOG_OWNER_EMAIL = "catalog@demo.invalid";
const COMPANY_LOGOS: Record<string, string> = {
  amazon: "/images/companies/amazon.png",
  flipkart: "/images/companies/flipkart.png",
  meta: "/images/companies/meta.png",
  ibm: "/images/companies/ibm.svg",
  microsoft: "/images/companies/microsoft.png",
  tcs: "/images/companies/tcs.png",
  cognizant: "/images/companies/cognizant.png",
  accenture: "/images/companies/accenture.png",
  infosys: "/images/companies/infosys.png",
};

type CompanyDefinition = {
  key: string;
  name: string;
  description: string;
  location: string;
};

type RoleTemplate = {
  title: string;
  department: string;
  description: string;
  requirements: string[];
  salary: number;
  experienceLevel: number;
  jobType?: "Full-time" | "Part-time" | "Internship" | "Contract";
  remote?: boolean;
};

const COMPANIES: CompanyDefinition[] = [
  { key: "amazon", name: "Amazon", description: "A global technology and commerce company building customer-first products, cloud infrastructure, logistics, and entertainment services.", location: "Bengaluru" },
  { key: "flipkart", name: "Flipkart", description: "India's digital commerce marketplace, helping millions of customers discover, buy, and receive products through a technology-led supply chain.", location: "Bengaluru" },
  { key: "meta", name: "Meta", description: "A product company building social platforms, creator tools, immersive experiences, and AI systems that help people connect.", location: "Hyderabad" },
  { key: "ibm", name: "IBM", description: "A technology and consulting company helping enterprises modernize applications, data, security, and hybrid cloud operations.", location: "Bengaluru" },
  { key: "microsoft", name: "Microsoft", description: "A global software and cloud company creating tools for productivity, intelligent applications, gaming, and responsible AI.", location: "Hyderabad" },
  { key: "tcs", name: "Tata Consultancy Services", description: "A global IT services and consulting organization partnering with enterprises on digital transformation, engineering, and operations.", location: "Pune" },
  { key: "cognizant", name: "Cognizant", description: "A professional services company helping businesses modernize technology, improve customer experiences, and run critical operations.", location: "Chennai" },
  { key: "accenture", name: "Accenture", description: "A global consulting and technology services network delivering strategy, cloud, data, design, and industry transformation.", location: "Mumbai" },
  { key: "infosys", name: "Infosys", description: "A global digital services and consulting company supporting clients with engineering, enterprise platforms, analytics, and managed services.", location: "Pune" },
];

const ROLES: RoleTemplate[] = [
  { title: "Software Development Engineer II", department: "Engineering", description: "Design and ship reliable customer-facing services, collaborate across product teams, and raise the bar for operational excellence.", requirements: ["Java", "Distributed systems", "AWS", "System design"], salary: 38, experienceLevel: 4 },
  { title: "Data Scientist", department: "Data & AI", description: "Turn ambiguous business questions into measurable models, experiments, and recommendations used by teams at scale.", requirements: ["Python", "SQL", "Experimentation", "Machine learning"], salary: 32, experienceLevel: 3 },
  { title: "Product Manager", department: "Product Management", description: "Set product direction with customers and engineering partners, balancing discovery, delivery, and measurable outcomes.", requirements: ["Product strategy", "Roadmapping", "User research", "Analytics"], salary: 36, experienceLevel: 5 },
  { title: "UX Designer", department: "Design & Research", description: "Shape clear, inclusive experiences from early concept through polished product, partnering closely with research and engineering.", requirements: ["Figma", "Interaction design", "Prototyping", "Accessibility"], salary: 26, experienceLevel: 3 },
  { title: "Solutions Consultant", department: "Consulting & Strategy", description: "Translate customer goals into practical technology plans and guide stakeholders through complex transformation decisions.", requirements: ["Client advisory", "Presentations", "Cloud", "Business analysis"], salary: 24, experienceLevel: 4 },
  { title: "Business Development Manager", department: "Sales & Business Development", description: "Build trusted relationships, discover new opportunities, and create partnerships that expand the reach of high-value products.", requirements: ["Enterprise sales", "Negotiation", "Pipeline management", "Market research"], salary: 22, experienceLevel: 4 },
  { title: "Content Marketing Manager", department: "Marketing & Communications", description: "Develop stories and campaigns that explain complex products clearly and move audiences from interest to action.", requirements: ["Content strategy", "SEO", "Editorial", "Campaign analytics"], salary: 18, experienceLevel: 3 },
  { title: "Financial Analyst", department: "Finance & Accounting", description: "Partner with business leaders on planning, forecasting, and decisions that make growth durable and transparent.", requirements: ["Financial modeling", "Excel", "Forecasting", "Business partnering"], salary: 16, experienceLevel: 2 },
  { title: "Talent Acquisition Partner", department: "Human Resources", description: "Build inclusive hiring pipelines, coach interview teams, and create a candidate experience worthy of ambitious teams.", requirements: ["Technical recruiting", "Stakeholder management", "Sourcing", "Interview design"], salary: 15, experienceLevel: 3 },
  { title: "Operations Program Manager", department: "Operations & Supply Chain", description: "Lead cross-functional programs that improve reliability, throughput, and the everyday experience for customers and teams.", requirements: ["Program management", "Process improvement", "Metrics", "Cross-functional leadership"], salary: 21, experienceLevel: 4 },
];

const seededJobs = COMPANIES.flatMap((company, companyIndex) =>
  ROLES.map((role, roleIndex) => ({
    companyKey: company.key,
    ...role,
    salary: role.salary + (companyIndex % 3) * 2,
    location: company.location,
    position: roleIndex % 3 === 0 ? "2 openings" : "1 opening",
    remote: roleIndex % 4 === 1 || roleIndex % 4 === 3,
    jobType: role.jobType ?? (roleIndex === 8 ? "Contract" : roleIndex === 9 ? "Part-time" : "Full-time"),
  })),
);

export type SeedDemoCatalogInput = { allowNonDemoJobs?: boolean };
export type SeedDemoCatalogResult = { recruiterCreated: boolean; companiesCreated: number; jobsCreated: number; companiesTotal: number; jobsTotal: number };

/** Creates a realistic, clearly labelled catalogue for an empty marketplace. */
export async function seedDemoCatalog(input: SeedDemoCatalogInput): Promise<SeedDemoCatalogResult> {
  const existingOwner = await Recruiter.findOne({ email: CATALOG_OWNER_EMAIL }).select("+passwordHash");
  if (existingOwner && (existingOwner.passwordHash || existingOwner.googleId)) throw new Error("The reserved demo catalog owner is attached to a login identity; refusing to use it.");

  const nonDemoJobs = await Job.countDocuments(existingOwner ? { created_by: mongoose.trusted({ $ne: existingOwner._id }) } : {});
  if (nonDemoJobs > 0 && !input.allowNonDemoJobs) throw new Error(`Refusing to seed demo jobs into a database that already contains ${nonDemoJobs} non-demo job(s).`);

  let owner = existingOwner;
  let recruiterCreated = false;
  if (!owner) {
    owner = await Recruiter.create({ email: CATALOG_OWNER_EMAIL, fullName: "Cairn Marketplace Catalogue", passwordHash: null, googleId: null, emailVerifiedAt: new Date(), status: "active", designation: "Seeded catalogue owner" });
    recruiterCreated = true;
  }

  // Replace the original preview catalogue when upgrading an existing local
  // database. The reserved owner is non-login and uniquely identifies seeded
  // content, so this cannot touch recruiter-owned listings.
  const legacyCompanies = await Company.find({ userId: owner._id, name: /\(Demo\)$/i }).select("_id");
  if (legacyCompanies.length > 0) {
    // `mongoose.trusted` is required on both: sanitizeFilter is global, so a
    // bare { $in } is compared as a literal and fails to cast against an
    // ObjectId path — the upgrade threw instead of cleaning up.
    const legacyIds = mongoose.trusted({ $in: legacyCompanies.map((company) => company._id) });
    await Job.deleteMany({ created_by: owner._id, company: legacyIds });
    await Company.deleteMany({ _id: legacyIds, userId: owner._id });
  }

  const companyByKey = new Map<string, HydratedDocument<CompanyDocument>>();
  let companiesCreated = 0;
  for (const definition of COMPANIES) {
    let company = await Company.findOne({ userId: owner._id, name: definition.name });
    if (!company) {
      company = await Company.create({ name: definition.name, description: definition.description, location: definition.location, logo: COMPANY_LOGOS[definition.key], userId: owner._id });
      companiesCreated += 1;
    } else {
      company.description = definition.description;
      company.location = definition.location;
      company.logo = COMPANY_LOGOS[definition.key];
      await company.save();
    }
    companyByKey.set(definition.key, company);
  }

  let jobsCreated = 0;
  for (const definition of seededJobs) {
    const company = companyByKey.get(definition.companyKey);
    if (!company) throw new Error(`Missing seeded company ${definition.companyKey}`);
    const exists = await Job.exists({ created_by: owner._id, company: company._id, title: definition.title });
    if (exists) continue;
    await Job.create({ title: definition.title, description: definition.description, requirements: [...definition.requirements], salary: definition.salary, experienceLevel: definition.experienceLevel, location: definition.location, jobType: definition.jobType, department: definition.department, position: definition.position, remote: definition.remote, company: company._id, created_by: owner._id });
    jobsCreated += 1;
  }

  return { recruiterCreated, companiesCreated, jobsCreated, companiesTotal: await Company.countDocuments({ userId: owner._id }), jobsTotal: await Job.countDocuments({ created_by: owner._id }) };
}

const invokedDirectly = /seed-demo-catalog\.(ts|js)$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  await import("dotenv/config");
  const config = env();
  const database = mongoDatabaseName(config.MONGO_URI) ?? "test";
  const confirmationIndex = process.argv.indexOf("--confirm-database");
  const confirmedDatabase = confirmationIndex === -1 ? undefined : process.argv[confirmationIndex + 1];
  if (confirmedDatabase !== database) { console.error(`Refusing to seed. Re-run with --confirm-database ${database} after verifying that database is the intended target.`); process.exit(1); }
  await mongoose.connect(config.MONGO_URI);
  try {
    const result = await seedDemoCatalog({ allowNonDemoJobs: process.argv.includes("--allow-nonempty") });
    console.log(`catalog ready: ${result.companiesTotal} companies, ${result.jobsTotal} jobs (${result.companiesCreated} companies and ${result.jobsCreated} jobs created)`);
  } finally { await mongoose.disconnect(); }
}
