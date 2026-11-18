import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { HeroClassId } from '../../../shared/constants/classes.ts';
import type { CharacterIdentity } from '../../../shared/types/domain.ts';
import type { CharacterIntegrationLayer } from '../characters/characterIntegrationAdapter.ts';

interface AccountRecord {
  accountId: string;
  username: string;
  usernameLower: string;
  passwordHash: string;
  createdAt: number;
}

export interface AuthSession {
  token: string;
  accountId: string;
  username: string;
  expiresAt: number;
}

export interface AuthResult {
  ok: boolean;
  token?: string;
  character?: CharacterIdentity;
  error?: string;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return timingSafeEqual(keyBuf, derivedBuf);
}

export class AuthService {
  private readonly accountsByLower = new Map<string, AccountRecord>();
  private readonly sessionsByToken = new Map<string, AuthSession>();

  constructor(private readonly characterAdapter: CharacterIntegrationLayer) {
    if (process.env.NODE_ENV !== 'production') {
      void this.seedDevAccount();
    }
  }

  private async seedDevAccount(): Promise<void> {
    if (this.accountsByLower.has('wanderer')) return;
    const accountId = 'acc_dev_wanderer';
    this.accountsByLower.set('wanderer', {
      accountId,
      username: 'wanderer',
      usernameLower: 'wanderer',
      passwordHash: hashPassword('wanderer123'),
      createdAt: Date.now(),
    });
    await this.characterAdapter.createCharacterForAccount({
      accountId,
      username: 'wanderer',
      heroClass: 'vanguard',
    });
  }

  async register(
    usernameRaw: string,
    password: string,
    heroClass: HeroClassId
  ): Promise<AuthResult> {
    const username = usernameRaw.trim();
    const usernameLower = username.toLowerCase();
    if (this.accountsByLower.has(usernameLower)) {
      return { ok: false, error: 'That account name is already claimed.' };
    }

    const accountId = `acc_${randomUUID()}`;
    const record: AccountRecord = {
      accountId,
      username,
      usernameLower,
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    };
    this.accountsByLower.set(usernameLower, record);

    const character = await this.characterAdapter.createCharacterForAccount({
      accountId,
      username,
      heroClass,
    });

    const token = this.issueSession(record);
    return { ok: true, token, character };
  }

  async login(usernameRaw: string, password: string): Promise<AuthResult> {
    const usernameLower = usernameRaw.trim().toLowerCase();
    const account = this.accountsByLower.get(usernameLower);
    if (!account || !verifyPassword(password, account.passwordHash)) {
      return { ok: false, error: 'Invalid username or password.' };
    }

    let character = await this.characterAdapter.getCharacterByAccountId(account.accountId);
    if (!character) {
      character = await this.characterAdapter.createCharacterForAccount({
        accountId: account.accountId,
        username: account.username,
        heroClass: 'vanguard',
      });
    }

    const token = this.issueSession(account);
    return { ok: true, token, character };
  }

  async getSessionCharacter(token: string): Promise<{
    session: AuthSession;
    character: CharacterIdentity;
  } | null> {
    const session = this.validateSessionToken(token);
    if (!session) return null;
    const character = await this.characterAdapter.getCharacterByAccountId(session.accountId);
    if (!character) return null;
    return { session, character };
  }

  validateSessionToken(token: string): AuthSession | null {
    if (!token) return null;
    const session = this.sessionsByToken.get(token);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessionsByToken.delete(token);
      return null;
    }
    return session;
  }

  logout(token: string): void {
    this.sessionsByToken.delete(token);
  }

  private issueSession(account: AccountRecord): string {
    const token = randomBytes(32).toString('hex');
    this.sessionsByToken.set(token, {
      token,
      accountId: account.accountId,
      username: account.username,
      expiresAt: Date.now() + SESSION_TTL_MS,
    });
    return token;
  }
}
