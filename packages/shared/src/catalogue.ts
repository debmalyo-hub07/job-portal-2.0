import type { JobDepartment, JobType } from "./enums.js";

/**
 * The seeded marketplace catalogue: who the demo employers are and what they post.
 *
 * One roster, three readers. The company list used to be written out three times
 * — the seed script, the landing search suggestions, and the board's company
 * facet — and the facet's failure mode is silent: the API matches `company.name`
 * anchored and case-insensitively, so a name that drifts from the seeded spelling
 * returns an empty board rather than an error. Everything derives from here.
 *
 * Facts were checked against each company's own site and Wikipedia in August
 * 2026. Descriptions deliberately carry no headcounts, valuations or rankings:
 * those date within a quarter, and nothing here is worth re-verifying that often.
 */

/**
 * The cities the board's location facet offers.
 *
 * `location` is filtered by exact equality server-side, so this list is the whole
 * reachable vocabulary — a job seeded in "Gurugram" or "Noida" cannot be found
 * from the rail at all. Both are written "Delhi NCR".
 */
export const JOB_LOCATIONS = [
  "Delhi NCR",
  "Mumbai",
  "Bengaluru",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Remote",
] as const;

export type JobLocation = (typeof JOB_LOCATIONS)[number];

/** Where an employer actually sits. "Remote" is a way of working, not an office. */
export type CatalogueCity = Exclude<JobLocation, "Remote">;

/**
 * What kind of employer this is.
 *
 * Not decoration: the roster is meant to span all three, because a board of
 * nothing but global product companies misrepresents where candidates here
 * actually apply. A test asserts every kind is present.
 */
export type CatalogueCompanyKind = "product" | "services" | "newEconomy";

export type CatalogueRole = {
  key: string;
  title: string;
  department: JobDepartment;
  description: string;
  requirements: string[];
  /** Base band in rupees lakh per annum, before the employer's factor. */
  salary: number;
  experienceLevel: number;
  jobType?: JobType;
  /** Roles on a site, a shop floor or a shift rota, which are never remote. */
  onsite?: true;
};

export type CatalogueCompany = {
  key: string;
  name: string;
  description: string;
  location: CatalogueCity;
  logo: string;
  /** The employer's public site, seeded onto the company row. */
  website: string;
  kind: CatalogueCompanyKind;
  /** Multiplies each role's base band, rounded to whole lakh. */
  salaryFactor: number;
  /** Keys into `CATALOGUE_ROLES`. Curated per employer, never the whole pool. */
  roles: string[];
};

/**
 * The role pool.
 *
 * Every employer draws a curated subset. The previous catalogue gave all nine
 * companies the same ten roles, so the board showed the same ten titles and the
 * same ten descriptions nine times over — the clearest tell that the data was
 * synthetic. A test fails on any role no employer posts.
 */
export const CATALOGUE_ROLES: CatalogueRole[] = [
  // Roles any employer might post.
  { key: "sde2", title: "Software Development Engineer II", department: "Engineering", description: "Design and ship reliable customer-facing services, collaborate across product teams, and raise the bar for operational excellence.", requirements: ["Java", "Distributed systems", "AWS", "System design"], salary: 38, experienceLevel: 4 },
  { key: "frontend", title: "Frontend Engineer", department: "Engineering", description: "Build interfaces that stay fast and legible on the devices and networks real customers use, working closely with design.", requirements: ["React", "TypeScript", "CSS architecture", "Accessibility"], salary: 26, experienceLevel: 3 },
  { key: "backend", title: "Backend Engineer", department: "Engineering", description: "Own services end to end, from schema and API design through to the dashboards that prove they behave in production.", requirements: ["Node.js", "PostgreSQL", "API design", "Caching"], salary: 30, experienceLevel: 3 },
  { key: "qa-automation", title: "QA Automation Engineer", department: "Engineering", description: "Turn the regression suite into something teams trust, and make a failing build say clearly what broke.", requirements: ["Selenium", "Playwright", "Test strategy", "CI pipelines"], salary: 18, experienceLevel: 3 },
  { key: "devops", title: "DevOps Engineer", department: "Engineering", description: "Make deployments boring: reproducible environments, short feedback loops, and infrastructure described in code.", requirements: ["Kubernetes", "Terraform", "CI/CD", "Observability"], salary: 28, experienceLevel: 4 },
  { key: "data-scientist", title: "Data Scientist", department: "Data & AI", description: "Turn ambiguous business questions into measurable models, experiments, and recommendations used by teams at scale.", requirements: ["Python", "SQL", "Experimentation", "Machine learning"], salary: 32, experienceLevel: 3 },
  { key: "data-analyst", title: "Data Analyst", department: "Data & AI", description: "Answer the questions the business is actually asking, and build the reporting that stops them being asked twice.", requirements: ["SQL", "Dashboards", "Excel", "Storytelling with data"], salary: 16, experienceLevel: 2 },
  { key: "product-manager", title: "Product Manager", department: "Product Management", description: "Set product direction with customers and engineering partners, balancing discovery, delivery, and measurable outcomes.", requirements: ["Product strategy", "Roadmapping", "User research", "Analytics"], salary: 36, experienceLevel: 5 },
  { key: "ux-designer", title: "UX Designer", department: "Design & Research", description: "Shape clear, inclusive experiences from early concept through polished product, partnering closely with research and engineering.", requirements: ["Figma", "Interaction design", "Prototyping", "Accessibility"], salary: 26, experienceLevel: 3 },
  { key: "financial-analyst", title: "Financial Analyst", department: "Finance & Accounting", description: "Partner with business leaders on planning, forecasting, and decisions that make growth durable and transparent.", requirements: ["Financial modeling", "Excel", "Forecasting", "Business partnering"], salary: 16, experienceLevel: 2 },
  { key: "talent-partner", title: "Talent Acquisition Partner", department: "Human Resources", description: "Build inclusive hiring pipelines, coach interview teams, and create a candidate experience worthy of ambitious teams.", requirements: ["Technical recruiting", "Stakeholder management", "Sourcing", "Interview design"], salary: 15, experienceLevel: 3 },
  { key: "support-specialist", title: "Customer Support Specialist", department: "Customer Service", description: "Resolve customer problems properly the first time, and feed the patterns you see back to the product teams.", requirements: ["Ticket triage", "Written communication", "Product troubleshooting", "Empathy"], salary: 9, experienceLevel: 1 },

  // Services and consulting.
  { key: "solutions-consultant", title: "Solutions Consultant", department: "Consulting & Strategy", description: "Translate customer goals into practical technology plans and guide stakeholders through complex transformation decisions.", requirements: ["Client advisory", "Presentations", "Cloud", "Business analysis"], salary: 24, experienceLevel: 4 },
  { key: "sap-consultant", title: "SAP Functional Consultant", department: "Consulting & Strategy", description: "Map client processes onto SAP, run the requirement workshops, and stay with the rollout through user acceptance.", requirements: ["SAP S/4HANA", "Business process mapping", "Requirement workshops", "UAT"], salary: 22, experienceLevel: 5 },
  { key: "salesforce-developer", title: "Salesforce Developer", department: "Engineering", description: "Extend the CRM platform with customisation that survives an upgrade, and integrate it with the systems around it.", requirements: ["Apex", "Lightning Web Components", "Salesforce administration", "Integrations"], salary: 20, experienceLevel: 3 },
  { key: "java-fullstack", title: "Java Full Stack Developer", department: "Engineering", description: "Deliver enterprise features across the stack on client programmes, from the database through to the screens users see.", requirements: ["Java", "Spring Boot", "Angular", "REST APIs"], salary: 17, experienceLevel: 3 },
  { key: "dotnet-developer", title: ".NET Developer", department: "Engineering", description: "Build and maintain business applications on the Microsoft stack, with an eye on cost and supportability.", requirements: ["C#", ".NET Core", "SQL Server", "Azure"], salary: 16, experienceLevel: 3 },
  { key: "mainframe-modernisation", title: "Mainframe Modernisation Engineer", department: "Engineering", description: "Read decades-old batch systems accurately, then move them without losing the business rules buried in them.", requirements: ["COBOL", "JCL", "DB2", "Migration planning"], salary: 19, experienceLevel: 6 },
  { key: "test-lead", title: "Test Engineering Lead", department: "Engineering", description: "Own quality across a client programme: the strategy, the automation investment, and the team doing the work.", requirements: ["Test management", "Automation frameworks", "Defect governance", "Team leadership"], salary: 24, experienceLevel: 7 },
  { key: "delivery-manager", title: "Delivery Manager", department: "Consulting & Strategy", description: "Hold a multi-team engagement together: commitments, commercials, escalations, and the client relationship behind them.", requirements: ["Programme governance", "Client communication", "Estimation", "Risk management"], salary: 34, experienceLevel: 9 },
  { key: "cloud-architect", title: "Cloud Solution Architect", department: "Engineering", description: "Set the target architecture for migrations, and defend the trade-offs to both engineers and client executives.", requirements: ["Azure", "AWS", "Migration strategy", "Well-architected reviews"], salary: 40, experienceLevel: 8 },
  { key: "sre", title: "Site Reliability Engineer", department: "Engineering", description: "Keep production honest with error budgets, real incident review, and automation that removes the repeat work.", requirements: ["Linux", "Incident response", "SLOs", "Automation"], salary: 30, experienceLevel: 4 },
  { key: "infra-support", title: "Infrastructure Support Analyst", department: "Operations & Supply Chain", description: "Hold the shift rota for client infrastructure, triage what arrives, and hand over cleanly to the next team.", requirements: ["Windows Server", "Networking basics", "Ticketing", "Shift handover"], salary: 11, experienceLevel: 2, onsite: true },
  { key: "process-excellence", title: "Process Excellence Lead", department: "Operations & Supply Chain", description: "Measure how work actually flows through a delivery centre, then remove the steps that only add waiting.", requirements: ["Lean Six Sigma", "Process mapping", "Metrics", "Change management"], salary: 18, experienceLevel: 5 },
  { key: "graduate-trainee", title: "Graduate Engineer Trainee", department: "Engineering", description: "A structured first job: classroom training, a mentor, and a real project team once you are through it.", requirements: ["Programming fundamentals", "Data structures", "SQL", "Willingness to learn"], salary: 4, experienceLevel: 0, onsite: true },
  { key: "engineering-intern", title: "Software Engineering Intern", department: "Engineering", description: "Six months on a shipping team with a scoped project of your own and someone senior reviewing your code.", requirements: ["Programming fundamentals", "Git", "Debugging", "Curiosity"], salary: 3, experienceLevel: 0, jobType: "Internship", onsite: true },
  { key: "bid-manager", title: "Bid and Proposal Manager", department: "Sales & Business Development", description: "Run competitive pursuits end to end: the solution story, the commercial model, and every deadline in between.", requirements: ["RFP response", "Commercial modelling", "Solution storytelling", "Stakeholder co-ordination"], salary: 22, experienceLevel: 6 },
  { key: "contracts-analyst", title: "Contracts and Compliance Analyst", department: "Legal & Compliance", description: "Review client paper, track the obligations that follow from it, and keep audits from becoming fire drills.", requirements: ["Contract review", "Data protection", "Audit support", "Documentation"], salary: 14, experienceLevel: 3 },

  // Global product companies.
  { key: "senior-swe", title: "Senior Software Engineer", department: "Engineering", description: "Take the ambiguous, load-bearing problems, and leave the codebase and the engineers around you better for it.", requirements: ["System design", "Go", "Distributed systems", "Mentoring"], salary: 52, experienceLevel: 7 },
  { key: "ml-engineer", title: "Machine Learning Engineer", department: "Data & AI", description: "Move models from a notebook into serving infrastructure that holds its latency budget under real traffic.", requirements: ["PyTorch", "Feature engineering", "Model serving", "Python"], salary: 42, experienceLevel: 4 },
  { key: "applied-scientist", title: "Applied Scientist", department: "Data & AI", description: "Frame open research questions against product constraints, and publish what generalises beyond one launch.", requirements: ["Statistics", "Deep learning", "Research design", "Publication"], salary: 48, experienceLevel: 5 },
  { key: "data-engineer", title: "Data Engineer", department: "Data & AI", description: "Build the pipelines and models the rest of the company reports on, including the ones that must not be late.", requirements: ["Spark", "Airflow", "Data modelling", "SQL"], salary: 34, experienceLevel: 4 },
  { key: "security-engineer", title: "Security Engineer", department: "Engineering", description: "Threat-model real systems, fix classes of bug rather than instances, and be useful during an incident.", requirements: ["Threat modelling", "AppSec", "Cryptography basics", "Incident response"], salary: 36, experienceLevel: 4 },
  { key: "tpm", title: "Technical Program Manager", department: "Product Management", description: "Drive programmes that cross many teams, and keep the dependencies and the risks visible in writing.", requirements: ["Programme management", "Technical depth", "Dependency tracking", "Written communication"], salary: 40, experienceLevel: 6 },
  { key: "senior-pm", title: "Senior Product Manager", department: "Product Management", description: "Own a business-critical surface: the strategy, the pricing, the experiments, and the case you make to leadership.", requirements: ["Product strategy", "Pricing", "Experimentation", "Executive communication"], salary: 50, experienceLevel: 7 },
  { key: "design-systems", title: "Design Systems Designer", department: "Design & Research", description: "Build the foundations, tools, and working agreements that help many product teams ship coherent interfaces.", requirements: ["Design tokens", "Component libraries", "Figma", "Documentation"], salary: 32, experienceLevel: 4 },
  { key: "ux-researcher", title: "UX Researcher", department: "Design & Research", description: "Plan and run the studies that settle arguments, then make the findings impossible for teams to ignore.", requirements: ["Usability testing", "Interview technique", "Synthesis", "Survey design"], salary: 28, experienceLevel: 4 },
  { key: "developer-advocate", title: "Developer Advocate", department: "Marketing & Communications", description: "Teach the platform honestly through talks, docs, and sample code, and carry what developers tell you back inside.", requirements: ["Public speaking", "Technical writing", "Sample apps", "Community building"], salary: 30, experienceLevel: 4 },
  { key: "enterprise-ae", title: "Enterprise Account Executive", department: "Sales & Business Development", description: "Own complex enterprise cycles from qualification to signature, with the technical depth to be taken seriously.", requirements: ["Enterprise sales", "Negotiation", "Pipeline management", "Value selling"], salary: 34, experienceLevel: 6 },
  { key: "partnerships", title: "Partnerships Manager", department: "Sales & Business Development", description: "Find and build the partnerships that open new distribution, then make the joint motion actually work.", requirements: ["Partner strategy", "Commercial terms", "Joint go-to-market", "Relationship building"], salary: 28, experienceLevel: 5 },
  { key: "fpna", title: "FP&A Manager", department: "Finance & Accounting", description: "Run the planning cycle, explain the variances plainly, and give leadership numbers it can act on.", requirements: ["Budgeting", "Variance analysis", "Board reporting", "Business partnering"], salary: 30, experienceLevel: 6 },
  { key: "corporate-counsel", title: "Corporate Counsel", department: "Legal & Compliance", description: "Advise product and commercial teams on real decisions, and negotiate the agreements those decisions need.", requirements: ["Commercial contracts", "Regulatory research", "Risk advisory", "Negotiation"], salary: 34, experienceLevel: 5 },

  // Consumer internet, fintech and SaaS.
  { key: "fullstack", title: "Full Stack Engineer", department: "Engineering", description: "Ship whole features alone when you have to — schema, API, screen — on a team that deploys most days.", requirements: ["React", "Node.js", "PostgreSQL", "AWS"], salary: 28, experienceLevel: 3 },
  { key: "android-engineer", title: "Android Engineer", department: "Engineering", description: "Build for the phones and connections most customers actually have, and measure the difference your work makes.", requirements: ["Kotlin", "Jetpack Compose", "Offline-first design", "Performance profiling"], salary: 26, experienceLevel: 3 },
  { key: "ios-engineer", title: "iOS Engineer", department: "Engineering", description: "Own the iOS app's craft and its release train, from interaction detail through to crash-free sessions.", requirements: ["Swift", "SwiftUI", "App performance", "Release management"], salary: 26, experienceLevel: 3 },
  { key: "platform-engineer", title: "Platform Engineer", department: "Engineering", description: "Build the internal platform other engineers ship on, and treat their productivity as your product metric.", requirements: ["Kubernetes", "Golang", "Internal tooling", "Reliability"], salary: 32, experienceLevel: 4 },
  { key: "analytics-engineer", title: "Analytics Engineer", department: "Data & AI", description: "Own the metric layer: definitions everyone agrees on, tested transformations, and a warehouse people trust.", requirements: ["dbt", "SQL", "Warehouse modelling", "Metric definitions"], salary: 26, experienceLevel: 3 },
  { key: "growth-pm", title: "Growth Product Manager", department: "Product Management", description: "Work the funnel from acquisition through retention, and be honest about which experiments failed.", requirements: ["Funnel analysis", "A/B testing", "Retention", "Lifecycle messaging"], salary: 34, experienceLevel: 4 },
  { key: "product-designer", title: "Product Designer", department: "Design & Research", description: "Take problems from framing to shipped detail, and hold the quality bar on flows millions of people use.", requirements: ["Figma", "End-to-end product design", "Design critique", "Mobile patterns"], salary: 24, experienceLevel: 3 },
  { key: "performance-marketing", title: "Performance Marketing Manager", department: "Marketing & Communications", description: "Run paid acquisition against a real payback target, and cut the channels that cannot defend their numbers.", requirements: ["Paid acquisition", "Attribution", "Creative testing", "Budget planning"], salary: 22, experienceLevel: 3 },
  { key: "content-marketing", title: "Content Marketing Manager", department: "Marketing & Communications", description: "Develop stories and campaigns that explain complex products clearly and move audiences from interest to action.", requirements: ["Content strategy", "SEO", "Editorial", "Campaign analytics"], salary: 18, experienceLevel: 3 },
  { key: "brand-communications", title: "Brand Communications Manager", department: "Marketing & Communications", description: "Keep one recognisable voice across campaigns, press and partnerships, including when the news is difficult.", requirements: ["Brand campaigns", "PR", "Copy direction", "Agency management"], salary: 20, experienceLevel: 4 },
  { key: "city-operations", title: "City Operations Manager", department: "Operations & Supply Chain", description: "Run a city as its own business: partner supply, delivery reliability, and the unit economics underneath both.", requirements: ["Field operations", "Partner management", "Unit economics", "Hiring at scale"], salary: 14, experienceLevel: 3, onsite: true },
  { key: "supply-growth", title: "Supply Growth Manager", department: "Operations & Supply Chain", description: "Bring sellers and partners onto the platform, and keep the good ones active after the first month.", requirements: ["Merchant onboarding", "Negotiation", "Territory planning", "Retention"], salary: 16, experienceLevel: 3, onsite: true },
  { key: "category-manager", title: "Category Manager", department: "Operations & Supply Chain", description: "Own a category's assortment, pricing and margin, and forecast demand well enough to keep it in stock.", requirements: ["Assortment planning", "Pricing", "Vendor management", "Demand forecasting"], salary: 22, experienceLevel: 4 },
  { key: "operations-program", title: "Operations Program Manager", department: "Operations & Supply Chain", description: "Lead cross-functional programs that improve reliability, throughput, and the everyday experience for customers and teams.", requirements: ["Program management", "Process improvement", "Metrics", "Cross-functional leadership"], salary: 21, experienceLevel: 4 },
  { key: "risk-fraud", title: "Risk and Fraud Analyst", department: "Finance & Accounting", description: "Find the fraud patterns in transaction data and tune the rules without punishing legitimate customers.", requirements: ["Fraud patterns", "SQL", "Rule tuning", "Chargeback operations"], salary: 18, experienceLevel: 3 },
  { key: "regulatory-compliance", title: "Regulatory Compliance Manager", department: "Legal & Compliance", description: "Keep a regulated product inside its rules — KYC, AML, audit readiness — while it keeps shipping.", requirements: ["RBI regulations", "KYC and AML", "Audit readiness", "Policy drafting"], salary: 24, experienceLevel: 5 },
  { key: "cx-lead", title: "Customer Experience Lead", department: "Customer Service", description: "Run a support team properly: quality frameworks, escalation paths, and coaching that reduces repeat contacts.", requirements: ["Support operations", "Quality frameworks", "Escalation handling", "Team coaching"], salary: 14, experienceLevel: 4 },
  { key: "weekend-support", title: "Weekend Support Associate", department: "Customer Service", description: "Cover Saturday and Sunday chat queues, the shifts when customers need help and most teams are offline.", requirements: ["Chat support", "Product knowledge", "Time management", "Written English"], salary: 7, experienceLevel: 1, jobType: "Part-time", onsite: true },
  { key: "motion-designer", title: "Motion Designer", department: "Design & Research", description: "A six-month engagement building the motion system for a brand refresh, and the assets that ship with it.", requirements: ["After Effects", "Motion systems", "Brand animation", "Asset delivery"], salary: 18, experienceLevel: 3, jobType: "Contract" },
  { key: "product-intern", title: "Product Management Intern", department: "Product Management", description: "One real problem, one squad, six months: talk to users, size the opportunity, and help ship the answer.", requirements: ["Analytical thinking", "User interviews", "Spreadsheets", "Communication"], salary: 3, experienceLevel: 0, jobType: "Internship" },
];

/**
 * The employer roster.
 *
 * Nine global product companies and IT majors, nine Indian services firms, and
 * nine consumer-internet, fintech and SaaS companies. `location` is the India
 * office the listings sit in, not the global head office — Accenture is
 * Dublin-registered and Freshworks is San Mateo-headquartered, but candidates
 * here apply to Mumbai and to Chennai.
 */
export const CATALOGUE_COMPANIES: CatalogueCompany[] = [
  // --- Global product companies and IT majors ---
  { key: "amazon", name: "Amazon", kind: "product", location: "Bengaluru", logo: "/images/companies/amazon.png", website: "https://www.amazon.in", salaryFactor: 1.3,
    description: "A global technology and commerce company building customer-first products, cloud infrastructure, logistics, and entertainment services.",
    roles: ["sde2", "senior-swe", "applied-scientist", "data-engineer", "tpm", "senior-pm", "operations-program", "enterprise-ae", "corporate-counsel"] },
  { key: "flipkart", name: "Flipkart", kind: "product", location: "Bengaluru", logo: "/images/companies/flipkart.png", website: "https://www.flipkart.com", salaryFactor: 1.15,
    description: "India's digital commerce marketplace, helping millions of customers discover, buy, and receive products through a technology-led supply chain.",
    roles: ["sde2", "fullstack", "data-scientist", "product-manager", "growth-pm", "product-designer", "category-manager", "supply-growth", "risk-fraud"] },
  { key: "meta", name: "Meta", kind: "product", location: "Hyderabad", logo: "/images/companies/meta.png", website: "https://about.meta.com", salaryFactor: 1.45,
    description: "A product company building social platforms, creator tools, immersive experiences, and AI systems that help people connect.",
    roles: ["senior-swe", "ml-engineer", "security-engineer", "design-systems", "ux-researcher", "senior-pm", "developer-advocate"] },
  { key: "ibm", name: "IBM", kind: "services", location: "Bengaluru", logo: "/images/companies/ibm.svg", website: "https://www.ibm.com/in-en", salaryFactor: 1.05,
    description: "A technology and consulting company helping enterprises modernize applications, data, security, and hybrid cloud operations.",
    roles: ["cloud-architect", "sre", "solutions-consultant", "data-engineer", "security-engineer", "sap-consultant", "contracts-analyst"] },
  { key: "microsoft", name: "Microsoft", kind: "product", location: "Hyderabad", logo: "/images/companies/microsoft.png", website: "https://www.microsoft.com/en-in", salaryFactor: 1.4,
    description: "A global software and cloud company creating tools for productivity, intelligent applications, gaming, and responsible AI.",
    roles: ["sde2", "senior-swe", "ml-engineer", "tpm", "ux-designer", "developer-advocate", "security-engineer", "fpna"] },
  { key: "tcs", name: "Tata Consultancy Services", kind: "services", location: "Pune", logo: "/images/companies/tcs.png", website: "https://www.tcs.com", salaryFactor: 0.85,
    description: "A global IT services and consulting organization partnering with enterprises on digital transformation, engineering, and operations.",
    roles: ["java-fullstack", "graduate-trainee", "test-lead", "sap-consultant", "delivery-manager", "infra-support", "engineering-intern", "support-specialist"] },
  { key: "cognizant", name: "Cognizant", kind: "services", location: "Chennai", logo: "/images/companies/cognizant.png", website: "https://www.cognizant.com/in/en", salaryFactor: 0.9,
    description: "A professional services company helping businesses modernize technology, improve customer experiences, and run critical operations.",
    roles: ["dotnet-developer", "qa-automation", "salesforce-developer", "solutions-consultant", "process-excellence", "data-analyst", "talent-partner"] },
  { key: "accenture", name: "Accenture", kind: "services", location: "Mumbai", logo: "/images/companies/accenture.png", website: "https://www.accenture.com/in-en", salaryFactor: 1.0,
    description: "A global consulting and technology services network delivering strategy, cloud, data, design, and industry transformation.",
    roles: ["solutions-consultant", "cloud-architect", "delivery-manager", "sap-consultant", "bid-manager", "ux-designer", "contracts-analyst", "financial-analyst"] },
  { key: "infosys", name: "Infosys", kind: "services", location: "Pune", logo: "/images/companies/infosys.png", website: "https://www.infosys.com", salaryFactor: 0.9,
    description: "A global digital services and consulting company supporting clients with engineering, enterprise platforms, analytics, and managed services.",
    roles: ["java-fullstack", "graduate-trainee", "devops", "data-engineer", "test-lead", "bid-manager", "support-specialist"] },

  // --- Indian IT services firms ---
  { key: "wipro", name: "Wipro", kind: "services", location: "Bengaluru", logo: "/images/companies/wipro.svg", website: "https://www.wipro.com", salaryFactor: 0.9,
    description: "An Indian technology services and consulting company founded in 1945, running cloud, data, engineering, and cybersecurity programmes for enterprises from its Bengaluru headquarters.",
    roles: ["java-fullstack", "cloud-architect", "sre", "mainframe-modernisation", "delivery-manager", "infra-support", "engineering-intern"] },
  { key: "hcltech", name: "HCLTech", kind: "services", location: "Delhi NCR", logo: "/images/companies/hcltech.svg", website: "https://www.hcltech.com", salaryFactor: 0.95,
    description: "The flagship technology company of the HCL Group, working across IT and business services, engineering and R&D, and its own software products from Noida.",
    roles: ["devops", "sre", "security-engineer", "dotnet-developer", "test-lead", "infra-support", "graduate-trainee"] },
  { key: "techmahindra", name: "Tech Mahindra", kind: "services", location: "Pune", logo: "/images/companies/techmahindra.svg", website: "https://www.techmahindra.com", salaryFactor: 0.85,
    description: "A Mahindra Group technology company that began in 1986 as a Mahindra and British Telecom joint venture, serving communications, manufacturing, and financial services clients.",
    roles: ["java-fullstack", "qa-automation", "solutions-consultant", "process-excellence", "data-analyst", "support-specialist", "contracts-analyst"] },
  { key: "ltm", name: "LTM Limited", kind: "services", location: "Mumbai", logo: "/images/companies/ltm.png", website: "https://www.ltimindtree.com", salaryFactor: 0.95,
    description: "The Larsen and Toubro technology arm formed by the 2022 merger of L&T Infotech and Mindtree, renamed from LTIMindtree to LTM Limited in 2026, delivering consulting and digital engineering from Mumbai.",
    roles: ["sap-consultant", "salesforce-developer", "cloud-architect", "delivery-manager", "data-engineer", "bid-manager"] },
  { key: "capgemini", name: "Capgemini", kind: "services", location: "Mumbai", logo: "/images/companies/capgemini.svg", website: "https://www.capgemini.com/in-en", salaryFactor: 1.0,
    description: "A Paris-headquartered consulting and technology group with one of its largest delivery footprints in India, covering strategy, cloud, data, and industry transformation.",
    roles: ["solutions-consultant", "sap-consultant", "devops", "data-scientist", "ux-designer", "financial-analyst", "contracts-analyst"] },
  { key: "mphasis", name: "Mphasis", kind: "services", location: "Bengaluru", logo: "/images/companies/mphasis.png", website: "https://www.mphasis.com", salaryFactor: 0.95,
    description: "A Bengaluru-based IT services company, majority-backed by Blackstone, specialising in applications and infrastructure work for banking, telecom, and logistics clients.",
    roles: ["dotnet-developer", "java-fullstack", "qa-automation", "cloud-architect", "risk-fraud", "infra-support"] },
  { key: "persistent", name: "Persistent Systems", kind: "services", location: "Pune", logo: "/images/companies/persistent.svg", website: "https://www.persistentsys.com", salaryFactor: 1.0,
    description: "A Pune software engineering company founded in 1990, building products and platforms with clients across healthcare, financial services, and software.",
    roles: ["backend", "frontend", "devops", "data-engineer", "ml-engineer", "test-lead"] },
  { key: "coforge", name: "Coforge", kind: "services", location: "Delhi NCR", logo: "/images/companies/coforge.png", website: "https://www.coforge.com", salaryFactor: 0.9,
    description: "Formerly NIIT Technologies, a Noida-headquartered IT company concentrating on banking, insurance, travel, and public-sector transformation.",
    roles: ["salesforce-developer", "java-fullstack", "qa-automation", "solutions-consultant", "process-excellence", "talent-partner"] },
  { key: "zensar", name: "Zensar Technologies", kind: "services", location: "Pune", logo: "/images/companies/zensar.svg", website: "https://www.zensar.com", salaryFactor: 0.85,
    description: "An RPG Group technology company headquartered in Pune, working on digital supply chain, cloud infrastructure, data, and enterprise applications.",
    roles: ["dotnet-developer", "frontend", "qa-automation", "data-analyst", "infra-support", "support-specialist", "partnerships"] },

  // --- Consumer internet, fintech and SaaS ---
  { key: "zerodha", name: "Zerodha", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/zerodha.svg", website: "https://zerodha.com", salaryFactor: 1.15,
    description: "A Bengaluru stockbroker bootstrapped by the Kamath brothers in 2010, whose flat-fee platform covers equities, derivatives, mutual funds, and bonds with no outside investors.",
    roles: ["fullstack", "backend", "platform-engineer", "product-designer", "risk-fraud", "regulatory-compliance", "cx-lead", "support-specialist"] },
  { key: "razorpay", name: "Razorpay", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/razorpay.svg", website: "https://razorpay.com", salaryFactor: 1.25,
    description: "A Bengaluru payments company offering an RBI-authorised payment gateway alongside business banking, payroll, and lending products built on developer-first APIs.",
    roles: ["backend", "fullstack", "platform-engineer", "analytics-engineer", "growth-pm", "risk-fraud", "regulatory-compliance", "developer-advocate"] },
  { key: "phonepe", name: "PhonePe", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/phonepe.svg", website: "https://www.phonepe.com", salaryFactor: 1.3,
    description: "A Bengaluru fintech, majority-owned by Walmart, behind one of India's largest UPI payment apps and extending into stock broking, insurance, and the Indus Appstore.",
    roles: ["sde2", "backend", "android-engineer", "data-engineer", "growth-pm", "risk-fraud", "regulatory-compliance"] },
  { key: "groww", name: "Groww", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/groww.png", website: "https://groww.in", salaryFactor: 1.2,
    description: "A Bengaluru investing platform for stocks, derivatives, mutual funds, and bonds, built for first-time retail investors.",
    roles: ["fullstack", "ios-engineer", "analytics-engineer", "product-designer", "performance-marketing", "regulatory-compliance", "cx-lead"] },
  { key: "swiggy", name: "Swiggy", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/swiggy.png", website: "https://www.swiggy.com", salaryFactor: 1.2,
    description: "A Bengaluru company founded in 2013, running food ordering and delivery across hundreds of Indian cities alongside its Instamart quick-commerce service.",
    roles: ["sde2", "data-scientist", "android-engineer", "growth-pm", "city-operations", "supply-growth", "weekend-support", "category-manager"] },
  { key: "eternal", name: "Eternal", kind: "newEconomy", location: "Delhi NCR", logo: "/images/companies/eternal.svg", website: "https://www.zomato.com", salaryFactor: 1.2,
    description: "Formerly Zomato, the Gurugram-headquartered parent of Zomato food delivery, Blinkit quick commerce, Hyperpure restaurant supply, and the District going-out platform.",
    roles: ["fullstack", "data-scientist", "product-designer", "city-operations", "category-manager", "brand-communications", "operations-program", "motion-designer"] },
  { key: "meesho", name: "Meesho", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/meesho.png", website: "https://www.meesho.com", salaryFactor: 1.15,
    description: "A Bengaluru e-commerce marketplace started in 2015, selling fashion, home, beauty, and everyday categories to value-conscious buyers across India.",
    roles: ["backend", "analytics-engineer", "growth-pm", "product-designer", "category-manager", "supply-growth", "performance-marketing", "product-intern"] },
  { key: "zepto", name: "Zepto", kind: "newEconomy", location: "Bengaluru", logo: "/images/companies/zepto.svg", website: "https://www.zeptonow.com", salaryFactor: 1.15,
    description: "A quick-commerce company founded in 2021, delivering groceries and essentials from a network of dark stores, headquartered in Bengaluru since 2024.",
    roles: ["fullstack", "android-engineer", "data-analyst", "city-operations", "supply-growth", "operations-program", "weekend-support"] },
  { key: "freshworks", name: "Freshworks", kind: "newEconomy", location: "Chennai", logo: "/images/companies/freshworks.svg", website: "https://www.freshworks.com", salaryFactor: 1.1,
    description: "A software company started in Chennai in 2010 as Freshdesk, selling cloud CRM, IT service management, and marketing tools, with its largest engineering base still in Chennai.",
    roles: ["backend", "frontend", "qa-automation", "product-designer", "developer-advocate", "enterprise-ae", "content-marketing", "cx-lead"] },
];

/** Every employer name, in roster order. The company facet and the search suggestions both read this. */
export const CATALOGUE_COMPANY_NAMES: string[] = CATALOGUE_COMPANIES.map((company) => company.name);

/** Every city an employer actually posts from, deduplicated, in roster order. */
export const CATALOGUE_CITIES: CatalogueCity[] = [
  ...new Set(CATALOGUE_COMPANIES.map((company) => company.location)),
];

export type CatalogueListing = {
  companyKey: string;
  title: string;
  department: JobDepartment;
  description: string;
  requirements: string[];
  salary: number;
  experienceLevel: number;
  location: CatalogueCity;
  jobType: JobType;
  position: string;
  remote: boolean;
  /**
   * How long ago this listing was posted, in hours.
   *
   * The board sorts by `createdAt` descending, so without this every listing
   * shares one timestamp and "latest openings" degenerates into "whichever
   * employer the seed happened to reach last" — the landing page showed six
   * cards from a single company. Ranked so consecutive positions belong to
   * different employers: each employer's first role occupies one of the newest
   * slots before any employer's second role appears.
   */
  postedHoursAgo: number;
};

/**
 * Expands the roster into the listings the seed script writes.
 *
 * The varying parts — band, openings, whether the role is offered remotely — are
 * derived rather than authored, so they stay consistent across 27 employers and,
 * critically, stay *deterministic*: the seed's idempotency check matches on
 * (owner, company, title), so a listing that changed shape between runs would
 * quietly accumulate duplicates instead of updating.
 */
export function catalogueListings(): CatalogueListing[] {
  // Built here rather than at module scope on purpose. A top-level
  // `new Map(CATALOGUE_ROLES...)` is an import-time side effect that references
  // the pool, so no bundler can drop it — and the client, which only needs the
  // company names, was shipping all 62 role descriptions to every visitor.
  const roleByKey = new Map(CATALOGUE_ROLES.map((role) => [role.key, role]));
  return CATALOGUE_COMPANIES.flatMap((company, companyIndex) => {
    // Each employer's list is rotated by its position in the roster before the
    // posting dates are assigned. Without it the newest slot for every employer
    // is its *first* role, and since many rosters open with an engineering role
    // the top of the board came back as the same title and the same description
    // several cards running — the exact repetition the curated sets exist to
    // avoid, in the most visible place on the site.
    const offset = companyIndex % company.roles.length;
    const rotated = [...company.roles.slice(offset), ...company.roles.slice(0, offset)];
    return rotated.map((roleKey, roleIndex) => {
      const role = roleByKey.get(roleKey);
      if (!role) throw new Error(`Unknown catalogue role "${roleKey}" on company "${company.key}"`);
      const spread = companyIndex + roleIndex;
      return {
        companyKey: company.key,
        title: role.title,
        department: role.department,
        description: role.description,
        requirements: [...role.requirements],
        salary: Math.max(1, Math.round(role.salary * company.salaryFactor)),
        experienceLevel: role.experienceLevel,
        location: company.location,
        jobType: role.jobType ?? "Full-time",
        position: spread % 4 === 0 ? "2 openings" : spread % 7 === 3 ? "3 openings" : "1 opening",
        remote: role.onsite ? false : spread % 3 === 1,
        postedHoursAgo: (roleIndex * CATALOGUE_COMPANIES.length + companyIndex) * 6,
      };
    });
  });
}
