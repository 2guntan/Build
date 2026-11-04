import type { ErrorCode } from './index.js';

/** Default bilingual messages and HTTP status for each stable error code. */
export const PROBLEM_DEFAULTS: Record<ErrorCode, { status: number; fr: string; en: string }> = {
  UNAUTHENTICATED: { status: 401, fr: 'Connexion requise.', en: 'Sign-in required.' },
  FORBIDDEN: { status: 403, fr: 'Accès refusé.', en: 'Access denied.' },
  NOT_FOUND: { status: 404, fr: 'Ressource introuvable.', en: 'Resource not found.' },
  VALIDATION_FAILED: { status: 400, fr: 'Requête invalide.', en: 'Invalid request.' },
  PLOT_INVALID: { status: 422, fr: 'La parcelle est invalide.', en: 'The plot is invalid.' },
  RULESET_NOT_PUBLISHED: { status: 409, fr: "Le jeu de règles n'est pas publié.", en: 'The rule set is not published.' },
  RECIPE_SCHEMA_INVALID: { status: 422, fr: 'La recette ne respecte pas le schéma.', en: 'The recipe does not match the schema.' },
  RECIPE_REJECTED: { status: 422, fr: 'La recette a été refusée par le validateur.', en: 'The recipe was rejected by the validator.' },
  AGENT_BUDGET_EXCEEDED: { status: 429, fr: "Budget de l'assistant dépassé pour aujourd'hui.", en: 'Assistant budget exceeded for today.' },
  AGENT_UNAVAILABLE: { status: 503, fr: "L'assistant n'est pas configuré (clé API manquante).", en: 'The assistant is not configured (missing API key).' },
  IFC_SERVICE_UNAVAILABLE: { status: 503, fr: 'Le service IFC est indisponible.', en: 'The IFC service is unavailable.' },
  UPLOAD_TOO_LARGE: { status: 413, fr: 'Fichier trop volumineux (5 Mo max).', en: 'File too large (5 MB max).' },
  CONFLICT: { status: 409, fr: 'Conflit de version.', en: 'Version conflict.' },
  INTERNAL: { status: 500, fr: 'Erreur interne.', en: 'Internal error.' },
};
