import { z } from 'zod';
import { PROTOCOL_VERSION } from '../constants/zones.ts';

export const HeroClassSchema = z.enum(['vanguard', 'ranger', 'arcanist', 'cleric']);

export const AuthLoginSchema = z.object({
  username: z.string().trim().min(2).max(20),
  password: z.string().min(8).max(128),
});

export const AuthRegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_-]{2,20}$/, 'Username must be 2–20 letters, numbers, underscores, or hyphens.'),
  password: z.string().min(8).max(128),
  heroClass: HeroClassSchema.default('vanguard'),
});

export const PlayerInputSchema = z.object({
  up: z.boolean(),
  down: z.boolean(),
  left: z.boolean(),
  right: z.boolean(),
  attack: z.boolean(),
  aimAngle: z.number().finite(),
  stickX: z.number().finite().min(-1.1).max(1.1).optional(),
  stickY: z.number().finite().min(-1.1).max(1.1).optional(),
});

export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('lobby:subscribe'),
    protocolVersion: z.number().int().min(1).max(PROTOCOL_VERSION).default(PROTOCOL_VERSION),
  }),
  z.object({
    type: z.literal('instance:create'),
    name: z.string().trim().min(2).max(40),
  }),
  z.object({
    type: z.literal('instance:join'),
    instanceId: z.string().trim().min(1).max(48),
  }),
  z.object({
    type: z.literal('instance:leave'),
  }),
  z.object({
    type: z.literal('instance:resync'),
  }),
  z.object({
    type: z.literal('player:input'),
    input: PlayerInputSchema,
    seq: z.number().int().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('player:attack_probe'),
    aimAngle: z.number().finite(),
    kind: z.enum(['basic', 'tactical']),
  }),
  z.object({
    type: z.literal('player:equip_armament'),
    slot: z.enum(['weapon', 'vestment']),
    itemId: z.string().trim().min(1).max(64).nullable(),
  }),
  z.object({
    type: z.literal('chat:send'),
    text: z.string().trim().min(1).max(240),
  }),
  z.object({
    type: z.literal('ping'),
    t: z.number().finite(),
  }),
]);
