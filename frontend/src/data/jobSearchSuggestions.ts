import { CATALOGUE_CITIES, CATALOGUE_COMPANY_NAMES, JOB_DEPARTMENTS } from "@jobportal/shared";

export type JobSearchSuggestion = {
  label: string;
  group: "Roles" | "Companies" | "Skills" | "Locations" | "Departments";
  hint: string;
};

/**
 * What the search box offers before the user has typed anything specific.
 *
 * Companies, locations and departments are derived, not listed: a suggestion for
 * an employer the catalogue does not contain, or a city no employer posts from,
 * searches for something that cannot be found. Roles and skills stay curated —
 * they are the shortlist worth suggesting out of 62 seeded titles, and a test
 * pins every one of them to a title the catalogue actually posts.
 */
export const JOB_SEARCH_SUGGESTIONS: JobSearchSuggestion[] = [
  ...["Software Development Engineer", "Data Scientist", "Product Manager", "Full Stack Engineer", "UX Designer", "Solutions Consultant", "Data Engineer", "Site Reliability Engineer", "Enterprise Account Executive", "Operations Program Manager"].map((label) => ({ label, group: "Roles" as const, hint: "Role" })),
  ...CATALOGUE_COMPANY_NAMES.map((label) => ({ label, group: "Companies" as const, hint: "Verified employer" })),
  ...["React", "TypeScript", "Java", "Python", "SQL", "AWS", "Kubernetes", "Machine learning", "Figma", "Program management"].map((label) => ({ label, group: "Skills" as const, hint: "Skill" })),
  ...[...CATALOGUE_CITIES, "Remote"].map((label) => ({ label, group: "Locations" as const, hint: "Location" })),
  ...JOB_DEPARTMENTS.filter((label) => label !== "Other").map((label) => ({ label, group: "Departments" as const, hint: "Department" })),
];
