export type JobSearchSuggestion = {
  label: string;
  group: "Roles" | "Companies" | "Skills" | "Locations" | "Departments";
  hint: string;
};

export const JOB_SEARCH_SUGGESTIONS: JobSearchSuggestion[] = [
  ...["Software Development Engineer", "Data Scientist", "Product Manager", "UX Designer", "Solutions Consultant", "Business Development Manager", "Content Marketing Manager", "Financial Analyst", "Talent Acquisition Partner", "Operations Program Manager"].map((label) => ({ label, group: "Roles" as const, hint: "Role" })),
  ...["Amazon", "Flipkart", "Meta", "IBM", "Microsoft", "Tata Consultancy Services", "Cognizant", "Accenture", "Infosys"].map((label) => ({ label, group: "Companies" as const, hint: "Verified employer" })),
  ...["React", "TypeScript", "Java", "Python", "SQL", "AWS", "Machine learning", "Figma", "Financial modeling", "Program management"].map((label) => ({ label, group: "Skills" as const, hint: "Skill" })),
  ...["Bengaluru", "Hyderabad", "Pune", "Chennai", "Mumbai", "Remote"].map((label) => ({ label, group: "Locations" as const, hint: "Location" })),
  ...["Engineering", "Data & AI", "Product Management", "Design & Research", "Consulting & Strategy", "Sales & Business Development", "Marketing & Communications", "Finance & Accounting", "Human Resources", "Operations & Supply Chain"].map((label) => ({ label, group: "Departments" as const, hint: "Department" })),
];
