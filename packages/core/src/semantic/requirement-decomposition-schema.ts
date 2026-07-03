import { z } from "zod";
import { semanticClaimSchema, semanticRequirementSchema } from "./schema.js";

export const requirementDecompositionOutputSchema = z.object({
  assumptions: z.array(z.string().trim().min(1)).default([]),
  clarifyingQuestions: z.array(z.string().trim().min(1)).default([]),
  claims: z.array(semanticClaimSchema).default([]),
  confidence: z.number().min(0).max(1).optional(),
  requirements: z.array(semanticRequirementSchema).min(1),
  warnings: z.array(z.string().trim().min(1)).default([]),
});

export type RequirementDecompositionOutput = z.infer<typeof requirementDecompositionOutputSchema>;
