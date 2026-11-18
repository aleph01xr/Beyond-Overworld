export type ExternalIdentityConfigMode =
  | 'unconfigured'
  | 'partial_or_invalid'
  | 'configured';

export interface ResolvedIdentityConfig {
  mode: ExternalIdentityConfigMode;
  dungeonsApiUrl: string | null;
  identitySecret: string | null;
  hasIdentitySecret: boolean;
  localFallbackActive: boolean;
  diagnosticMessage: string;
}

export interface PublicIdentityConfigStatus {
  mode: ExternalIdentityConfigMode;
  dungeonsApiConfigured: boolean;
  identitySecretConfigured: boolean;
  localFallbackActive: boolean;
  diagnosticMessage: string;
}

function normalizeHttpUrl(raw: string | undefined): { valid: boolean; value: string | null; reason?: string } {
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
    // Strip trailing slash for deterministic endpoint joining later
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
 * Never expose BEYOND_IDENTITY_SECRET or raw internal secrets to frontend code.
 */
export function resolveIdentityConfig(
  env: Record<string, string | undefined> = process.env
): ResolvedIdentityConfig {
  const rawUrl = env.DUNGEONS_API_URL?.trim() || '';
  const rawSecret = env.BEYOND_IDENTITY_SECRET?.trim() || '';

  if (!rawUrl && !rawSecret) {
    return {
      mode: 'unconfigured',
      dungeonsApiUrl: null,
      identitySecret: null,
      hasIdentitySecret: false,
      localFallbackActive: true,
      diagnosticMessage:
        'External Beyond: Dungeons identity provider is not configured (DUNGEONS_API_URL and BEYOND_IDENTITY_SECRET unset). Using local development identity provider.',
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
      mode: 'partial_or_invalid',
      dungeonsApiUrl: urlCheck.valid ? urlCheck.value : null,
      identitySecret: rawSecret || null,
      hasIdentitySecret: Boolean(rawSecret),
      localFallbackActive: true,
      diagnosticMessage: `External Beyond: Dungeons identity configuration incomplete (${issues.join('; ')}). Local development identity provider remains active.`,
    };
  }

  return {
    mode: 'configured',
    dungeonsApiUrl: urlCheck.value,
    identitySecret: rawSecret,
    hasIdentitySecret: true,
    localFallbackActive: true,
    diagnosticMessage:
      'Beyond: Dungeons external identity adapter is configured (awaiting live Dungeons backend connection). Local development authentication remains safely available.',
  };
}

/**
 * Strips BEYOND_IDENTITY_SECRET before returning diagnostic/health information.
 */
export function toPublicIdentityConfigStatus(
  config: ResolvedIdentityConfig
): PublicIdentityConfigStatus {
  return {
    mode: config.mode,
    dungeonsApiConfigured: Boolean(config.dungeonsApiUrl),
    identitySecretConfigured: config.hasIdentitySecret,
    localFallbackActive: config.localFallbackActive,
    diagnosticMessage: config.diagnosticMessage,
  };
}
