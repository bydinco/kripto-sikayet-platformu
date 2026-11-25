// Swagger (/api/docs) documents every route, including admin/moderation
// DTOs — attack-surface reconnaissance a real deployment shouldn't hand
// out for free. Enabled by default outside production; SWAGGER_ENABLED is
// an explicit opt-in if docs are genuinely needed in production.
export function isSwaggerEnabled(nodeEnv: string | undefined, swaggerEnabledFlag: string | undefined): boolean {
  return nodeEnv !== 'production' || swaggerEnabledFlag === 'true';
}
