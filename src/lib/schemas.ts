import { z } from 'zod'
import { CONTACT_STATUSES, MAX_PHONES_PER_CONTACT, PHONE_LABELS } from '@/types/models'
import { safeHttpsUrl, safeLinkedinUrl } from '@/lib/text'

export const accountFormSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis').max(120, '120 caractères maximum'),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || safeHttpsUrl(v) !== null, 'Site web invalide'),
  industry: z.string().trim().max(100),
  headcount: z.string().trim().max(40, '40 caractères maximum'),
  description: z.string().trim().max(2000),
  country: z.string(),
  city: z.string().trim().max(80),
  timezone: z.string(),
})
export type AccountFormValues = z.infer<typeof accountFormSchema>

export const phoneFormSchema = z.object({
  number: z.string().trim().max(30),
  label: z.enum(PHONE_LABELS),
  isPrimary: z.boolean(),
  id: z.string().optional(),
})

export const contactFormSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis').max(80),
  lastName: z.string().trim().min(1, 'Nom requis').max(80),
  title: z.string().trim().max(120),
  // Plusieurs emails possibles, séparés par ; , espace ou :. Validés à l'enregistrement.
  email: z.string().trim().max(1000, '1000 caractères maximum'),
  linkedinUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => v === '' || safeLinkedinUrl(v) !== null, 'URL LinkedIn invalide (linkedin.com uniquement)'),
  description: z.string().trim().max(2000),
  source: z.string().trim().max(120),
  accountId: z.string(),
  status: z.enum(CONTACT_STATUSES),
  country: z.string(),
  city: z.string().trim().max(80),
  timezone: z.string(),
  phones: z.array(phoneFormSchema).max(MAX_PHONES_PER_CONTACT, `Maximum ${MAX_PHONES_PER_CONTACT} numéros`),
})
export type ContactFormValues = z.infer<typeof contactFormSchema>
