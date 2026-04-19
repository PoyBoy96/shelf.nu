import { z } from "zod";

export const CreateBookingTemplateFormSchema = z.object({
  intent: z.literal("create-template"),
  name: z.string().min(1, "Name is required").max(60, "Name too long"),
});

export const ApplyBookingTemplateFormSchema = z.object({
  intent: z.literal("apply-template"),
  templateId: z.string().min(1, "Template ID is required"),
});
