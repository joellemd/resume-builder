// Resume data model: a practical subset of the JSON Resume schema (https://jsonresume.org/schema).
import { z } from "zod";

const date = z
  .string()
  .describe('Date as "YYYY-MM", "YYYY" or "YYYY-MM-DD"');

export const basicsSchema = z.object({
  name: z.string().describe("Full name"),
  label: z.string().optional().describe("Headline, e.g. 'Senior Software Engineer'"),
  email: z.string().optional(),
  phone: z.string().optional(),
  url: z.string().optional().describe("Personal website or portfolio"),
  location: z.string().optional().describe("City, Country"),
  summary: z.string().optional().describe("Professional summary paragraph"),
  profiles: z
    .array(
      z.object({
        network: z.string().describe("e.g. LinkedIn, GitHub"),
        username: z.string().optional(),
        url: z.string().optional(),
      })
    )
    .optional(),
});

export const workSchema = z.object({
  name: z.string().describe("Company / organization name"),
  position: z.string().optional().describe("Job title"),
  location: z.string().optional(),
  url: z.string().optional(),
  startDate: date.optional(),
  endDate: date.optional().describe("Omit if this is the current role"),
  summary: z.string().optional().describe("One-line description of the role or company"),
  highlights: z.array(z.string()).optional().describe("Achievement bullets"),
});

export const educationSchema = z.object({
  institution: z.string(),
  studyType: z.string().optional().describe("Degree, e.g. 'MS' or 'Bachelor of Science'"),
  area: z.string().optional().describe("Field of study"),
  score: z.string().optional().describe("GPA or honors, e.g. 'With distinction'"),
  location: z.string().optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  courses: z.array(z.string()).optional(),
  highlights: z.array(z.string()).optional(),
});

export const skillSchema = z.object({
  name: z.string().describe("Skill group, e.g. 'Languages', 'Mobile', 'Cloud'"),
  keywords: z.array(z.string()).optional(),
});

export const volunteerSchema = z.object({
  organization: z.string(),
  position: z.string().optional().describe("Role, e.g. 'Hackathon Mentor'"),
  location: z.string().optional(),
  url: z.string().optional(),
  startDate: date.optional(),
  endDate: date.optional().describe("Omit if ongoing. For a one-off event, set it equal to startDate."),
  summary: z.string().optional(),
  highlights: z.array(z.string()).optional(),
});

export const projectSchema = z.object({
  name: z.string(),
  type: z
    .string()
    .optional()
    .describe('Set to "open source" for contributions to projects owned by others (e.g. a merged PR to Babel); omit for the user\'s own projects'),
  description: z.string().optional(),
  url: z.string().optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  highlights: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional().describe("Technologies used"),
});

export const certificateSchema = z.object({
  name: z.string(),
  issuer: z.string().optional(),
  date: date.optional(),
  url: z.string().optional(),
});

export const awardSchema = z.object({
  title: z.string(),
  awarder: z.string().optional(),
  date: date.optional(),
  summary: z.string().optional(),
});

export const languageSchema = z.object({
  language: z.string(),
  fluency: z.string().optional(),
});

/** Raw shape (not wrapped) so it can be spread into tool input schemas. */
export const resumeShape = {
  basics: basicsSchema,
  work: z.array(workSchema).optional(),
  education: z.array(educationSchema).optional(),
  skills: z.array(skillSchema).optional(),
  projects: z.array(projectSchema).optional(),
  volunteer: z.array(volunteerSchema).optional().describe("Volunteering, mentoring and community roles"),
  certificates: z.array(certificateSchema).optional(),
  awards: z.array(awardSchema).optional().describe("Awards, honors and scholarships"),
  languages: z.array(languageSchema).optional(),
};

export const resumeSchema = z.object(resumeShape);

export const SECTION_KEYS = [
  "summary",
  "work",
  "projects",
  "volunteer",
  "skills",
  "education",
  "certificates",
  "awards",
  "languages",
];
