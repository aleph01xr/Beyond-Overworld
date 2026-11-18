export type ExternalIdentityConfigMode =
  | 'unconfigured'
  | 'partial_or_invalid'
  | 'configured';

export interface ResolvedIdentityConfig {
  isProduction: boolean;
  mode: ExternalIdentityConfigMode;
  dungeonsApiUrl: string | null;
  identitySecret: string | null;
  hasIdentitySecret: boolean;
  localFallbackActive: boolean;
  devLoginEnabled: boolean;
  localRegistrationEnabled: boolean;
  diagnosticMessage: string;
}

export interface PublicIdentityConfigStatus {
  isProduction: boolean;
  mode: ExternalIdentityConfigMode;
  dungeonsApiConfigured: boolean;
  identitySecretConfigured: boolean;
  localFallbackActive: boolean;
  devLoginEnabled: boolean;
  localRegistrationEnabled: boolean;
  diagnosticMessage: string;
}

function normalizeHttpUrl(
  raw: string | undefined
): { valid: boolean; value: string | null; reason?: string } {
  const trimmed = raw?.trim();
  if (!trimmed) return { valid: false, value: null };
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        value: null,
        reason: 'DUNGEONS_API_URL must use http:// or https://.',
      };
    }
    return { valid: true, value: parsed.toString().replace(/\/+$/, '') };
  } catch {
    return {
      valid: false,
      value: null,
      reason: 'DUNGEONS_API_URL is not a valid URL.',
    };
  }
}

/**
 * Resolves backend-only configuration for Beyond: Dungeons shared identity integration.
 * In production (NODE_ENV=production), Dev Login and local authentication fallback are
 * strictly disabled so Beyond: Dungeons is the sole authoritative identity provider.
 * Never expose BEYOND_IDENTITY_SECRET or internal URLs to frontend code.
 */
export function resolveIdentityConfig(
  env: Record<string, string | undefined> = process.env,
  options?: { isProduction?: boolean }
): ResolvedIdentityConfig {
  const isProduction = options?.isProduction ?? env.NODE_ENV === 'production';
  const localFallbackActive = !isProduction;
  const devLoginEnabled = !isProduction;
  const localRegistrationEnabled = !isProduction;

  const rawUrl = env.DUNGEONS_API_URL?.trim() || '';
  const rawSecret = env.BEYOND_IDENTITY_SECRET?.trim() || '';

  if (!rawUrl && !rawSecret) {
    return {
      isProduction,
      mode: 'unconfigured',
      dungeonsApiUrl: null,
      identitySecret: null,
      hasIdentitySecret: false,
      localFallbackActive,
      devLoginEnabled,
      localRegistrationEnabled,
      diagnosticMessage: isProduction
        ? 'Production mode requires DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET; local fallback and Dev Login are disabled.'
        : 'External Beyond: Dungeons identity provider is not configured (DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET unset). Using local development identity provider.',
    };
  }

  const urlCheck = normalizeHttpUrl(rawUrl);
  const issues: string[] = [];

  if (!rawUrl) {
    issues.push('DUNGEONS_API_URL is missing');
  } else if (!urlCheck.valid) {
    issues.push(urlCheck.reason ?? 'DUNGEONS_API_URL is invalid');
  }

  if (!rawSecret) {
    issues.push('BEYOND_IDENTITY_SECRET is missing');
  } else if (rawSecret.length < 16) {
    issues.push('BEYOND_IDENTITY_SECRET should be at least 16 characters');
  }

  if (issues.length > 0) {
    return {
      isProduction,
      mode: 'partial_or_invalid',
      dungeonsApiUrl: urlCheck.valid ? urlCheck.value : null,
      identitySecret: rawSecret || null,
      hasIdentitySecret: Boolean(rawSecret),
      localFallbackActive,
      devLoginEnabled,
      localRegistrationEnabled,
      diagnosticMessage: isProduction
        ? `Production Beyond: Dungeons identity configuration invalid (${issues.join('; ')}). Local authentication fallback is disabled.`
        : `External Beyond: Dungeons identity configuration incomplete (${issues.join('; ')}). Local development identity provider remains active.`,
    };
  }

  return {
    isProduction,
    mode: 'configured',
    dungeonsApiUrl: urlCheck.value,
    identitySecret: rawSecret,
    hasIdentitySecret: true,
    localFallbackActive,
    devLoginEnabled,
    localRegistrationEnabled,
    diagnosticMessage: isProduction
      ? 'Production authentication is configured to use Beyond: Dungeons as the authoritative identity provider (Dev Login and local fallback disabled).'
      : 'Beyond: Dungeons external identity adapter is configured alongside local development authentication.',
  };
}

/**
 * Strips BEYOND_IDENTITY_SECRET and internal URLs before returning diagnostic/health state.
 */
export function toPublicIdentityConfigStatus(
  config: ResolvedIdentityConfig
): PublicIdentityConfigStatus {
  return {
    isProduction: config.isProduction,
    mode: config.mode,
    dungeonsApiConfigured: Boolean(config.dungeonsApiUrl),
    identitySecretConfigured: config.hasIdentitySecret,
    localFallbackActive: config.localFallbackActive,
    devLoginEnabled: config.devLoginEnabled,
    localRegistrationEnabled: config.localRegistrationEnabled,
    diagnosticMessage: config.diagnosticMessage,
  };
}
