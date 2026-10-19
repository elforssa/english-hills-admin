// Validation for the anonymous /api/public/inscription form. It accepts exactly the
// public programmes (PUBLIC_SESSION_TYPES): online courses are reception-only (Q15 = A).
import { z } from 'zod';
import { ALL_LEVELS, PUBLIC_SESSION_TYPES, getLevelsForSession } from './programCatalog.mjs';

export const AGE_CATEGORIES = ['Young Learners (6-12)', 'Teens (13-17)', 'Adults (18+)', 'Corporate'];

export const InscriptionSchema = z.object({
  full_name:     z.string().trim().min(2).max(120),
  date_naissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
  telephone:     z.string().trim().min(6).max(30),
  email:         z.string().trim().email().optional().or(z.literal('')),
  parent_email:  z.string().trim().email().optional().or(z.literal('')),
  age_category:  z.enum(AGE_CATEGORIES).optional().or(z.literal('')),
  session_type:  z.enum(PUBLIC_SESSION_TYPES).optional().or(z.literal('')),
  niveau_cefr:   z.enum(ALL_LEVELS).optional().or(z.literal('')),
  notes:         z.string().max(2000).optional().or(z.literal('')),
  // Batch 4A: public uploads are unsupported; never accept unverified URLs.
  documents_urls: z.array(z.string()).max(0).optional(),
  // CNDP (Loi 09-08) requires an explicit consent record. The client form
  // gates submission on a checkbox, but we re-enforce here so a direct POST
  // can't bypass it.
  consent:       z.literal(true, {
    errorMap: () => ({ message: 'Consentement requis pour soumettre le formulaire.' }),
  }),
  // Cloudflare Turnstile token; required when TURNSTILE_SECRET_KEY is set.
  turnstileToken: z.string().min(1).max(2048).optional(),
  idempotency_key: z.string().uuid(),
}).refine(
  (data) => Boolean(data.email) || Boolean(data.parent_email),
  {
    message: 'Au moins un email (apprenant ou parent) est requis.',
    path: ['email'],
  },
).refine(
  (data) => !data.niveau_cefr || getLevelsForSession(data.session_type || 'Yearly').includes(data.niveau_cefr),
  {
    message: 'Le niveau ne correspond pas à la session sélectionnée.',
    path: ['niveau_cefr'],
  },
);
