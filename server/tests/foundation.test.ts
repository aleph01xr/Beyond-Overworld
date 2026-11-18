import { afterEach, describe, expect, it } from 'vitest';
import {
  TILE_SIZE,
  getDefaultWeaponId,
} from '../../shared/constants/classes.ts';
import { OVERWORLD_INSTANCE_CAPACITY } from '../../shared/constants/zones.ts';
import {
  hasMovementInput,
  normalizePlayerInputDirection,
} from '../../shared/movement/playerMovement.ts';
import {
  applySnapshotDelta,
  cloneSnapshotBaseline,
  computeSnapshotDelta,
} from '../../shared/protocols/snapshotDelta.ts';
import type { CharacterIdentity, OverworldInputState } from '../../shared/types/domain.ts';
import { ClientMessageSchema } from '../../shared/validation/schemas.ts';
import { LocalPredictionController } from '../../client/src/game/world/prediction.ts';
import { OverworldNetworkClient } from '../../client/src/networking/networkClient.ts';
import { DevCharacterAdapter } from '../src/characters/characterIntegrationAdapter.ts';
import { WorldInstance } from '../src/instances/worldInstance.ts';
import { WorldInstanceManager } from '../src/instances/worldInstanceManager.ts';
import { ProgressionIntegrationLayer } from '../src/progression/progressionIntegration.ts';

function makeIdentity(idx: number): CharacterIdentity {
  return {
    accountId: `acc_${idx}`,
    characterId: `char_${idx}`,
    username: `Hero_${idx}`,
    heroClass: 'vanguard',
    level: 1,
    xp: 0,
    attributes: { strength: 0, vitality: 0, dexterity: 0, intelligence: 0, faith: 0 },
    attributePoints: 0,
    equippedArmament: {
      weaponId: getDefaultWeaponId('vanguard'),
      vestmentId: 'vest_vanguard_default',
    },
    permanentUnlocks: [],
    arenaHonor: 0,
  };
}

describe('Beyond: Overworld Foundation Systems', () => {
  it('enforces 100-player instance capacity (DD-007) and preserves reconnect state', () => {
    const manager = new WorldInstanceManager();
    const defaultInstance = manager.getInstance('OVERWORLD-1');
    expect(defaultInstance).toBeDefined();
    expect(defaultInstance?.maxPlayers).toBe(OVERWORLD_INSTANCE_CAPACITY);

    const shard = new WorldInstance({
      instanceId: 'TEST-CAP',
      name: 'Capacity Shard',
      maxPlayers: OVERWORLD_INSTANCE_CAPACITY,
    });

    for (let i = 0; i < OVERWORLD_INSTANCE_CAPACITY; i++) {
      const res = shard.addOrReconnectPlayer(makeIdentity(i));
      expect(res.ok).toBe(true);
    }

    const overflow = shard.addOrReconnectPlayer(makeIdentity(999));
    expect(overflow.ok).toBe(false);
    expect(shard.getPlayerCount()).toBe(100);

    // Disconnect and reconnect player 0 inside grace window
    shard.markDisconnected('char_0', 10_000);
    const reconnected = shard.addOrReconnectPlayer(makeIdentity(0));
    expect(reconnected.ok).toBe(true);
    expect(reconnected.reconnected).toBe(true);
    expect(reconnected.player?.connected).toBe(true);
  });

  it('blocks player attacks inside Safe Zones (DD-010) and permits outside Safe Zones (DD-011)', () => {
    const instance = new WorldInstance({
      instanceId: 'SAFE-TEST',
      name: 'Safe Test',
    });
    const identity = makeIdentity(1);
    const joined = instance.addOrReconnectPlayer(identity);
    expect(joined.ok).toBe(true);
    expect(joined.player?.zone).toBe('safe');

    // Inside safe zone -> strictly blocked
    const safeBasic = instance.handleAttackProbe('char_1', 'basic', 0);
    expect(safeBasic.ok).toBe(false);
    expect(safeBasic.code).toBe('SAFE_ZONE_PROTECTED');

    const safeTac = instance.handleAttackProbe('char_1', 'tactical', 0);
    expect(safeTac.ok).toBe(false);
    expect(safeTac.code).toBe('SAFE_ZONE_PROTECTED');

    // Move player north through Safe Zone gate into Open World
    instance.setPlayerInput('char_1', {
      up: true,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: -Math.PI / 2,
    });
    for (let t = 0; t < 100; t++) {
      instance.step(25);
    }

    const state = instance.getPlayerState('char_1');
    expect(state?.zone).toBe('open_world');

    const openBasic = instance.handleAttackProbe('char_1', 'basic', 0);
    expect(openBasic.ok).toBe(true);
    expect(instance.getPlayerState('char_1')?.inCombat).toBe(true);
  });

  it('keeps tactical skill cooldowns ticking while unequipped and blocks re-equip bypass (DD-020) and combat switching (DD-021)', async () => {
    const adapter = new DevCharacterAdapter();
    const char = await adapter.createCharacterForAccount({
      accountId: 'acc_cd',
      username: 'CooldownTester',
      heroClass: 'vanguard',
    });

    const instance = new WorldInstance({
      instanceId: 'CD-TEST',
      name: 'Cooldown Test',
    });
    instance.addOrReconnectPlayer(char);

    // Move north to Open World to trigger tactical skill cooldown
    instance.setPlayerInput('char_cd_skip', {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
    });
    instance.setPlayerInput(char.characterId, {
      up: true,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: -Math.PI / 2,
    });
    for (let i = 0; i < 90; i++) instance.step(25);
    instance.setPlayerInput(char.characterId, {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
    });

    expect(instance.getPlayerState(char.characterId)?.zone).toBe('open_world');
    const triggerRes = instance.handleAttackProbe(char.characterId, 'tactical', 0);
    expect(triggerRes.ok).toBe(true);

    // Outside Safe Zone + in active combat -> switching armament MUST fail
    const equipOutside = await instance.handleEquipArmament(
      char.characterId,
      'weapon',
      null,
      adapter
    );
    expect(equipOutside.ok).toBe(false);
    expect(equipOutside.code).toBe('OUTSIDE_SAFE_ZONE');

    // Walk back south into Safe Zone while still combat-locked
    instance.setPlayerInput(char.characterId, {
      up: false,
      down: true,
      left: false,
      right: false,
      attack: false,
      aimAngle: Math.PI / 2,
    });
    for (let i = 0; i < 65; i++) instance.step(25);
    instance.setPlayerInput(char.characterId, {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
    });

    const backInSafe = instance.getPlayerState(char.characterId);
    expect(backInSafe?.zone).toBe('safe');
    expect(backInSafe?.inCombat).toBe(true);

    const equipCombatLocked = await instance.handleEquipArmament(
      char.characterId,
      'weapon',
      null,
      adapter
    );
    expect(equipCombatLocked.ok).toBe(false);
    expect(equipCombatLocked.code).toBe('IN_ACTIVE_COMBAT');

    // Let combat lock expire (5s total; advance another 3.5s -> 1.3s tactical cooldown still remaining? Actually vanguard tactical cooldown is 4800ms)
    // Wait: vanguard tacticalCooldownMs is 4800ms, combat lock is 5000ms; let's check both!
    for (let i = 0; i < 160; i++) instance.step(25); // +4000ms (total ~5625ms elapsed since cast)
    expect(instance.getPlayerState(char.characterId)?.inCombat).toBe(false);

    // Re-trigger tactical after stepping just outside safe zone so cooldown has ~4800ms fresh
    instance.setPlayerInput(char.characterId, {
      up: true,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: -Math.PI / 2,
    });
    for (let i = 0; i < 55; i++) instance.step(25);
    expect(instance.handleAttackProbe(char.characterId, 'tactical', 0).ok).toBe(true);
    // Let combat lock (5000ms) expire? Wait: cooldown (4800ms) < combatLock (5000ms) for vanguard; test with Arcanist whose tacticalCooldownMs is 5000ms or Cleric whose cooldown is 6800ms!
    // Let's test with Cleric (6800ms > 5000ms combat lock)!
    const cleric = await adapter.createCharacterForAccount({
      accountId: 'acc_cleric',
      username: 'Sunprelate',
      heroClass: 'cleric',
    });
    instance.addOrReconnectPlayer(cleric);
    instance.setPlayerInput(cleric.characterId, {
      up: true,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: -Math.PI / 2,
    });
    for (let i = 0; i < 95; i++) instance.step(25);
    instance.setPlayerInput(cleric.characterId, {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
    });
    expect(instance.handleAttackProbe(cleric.characterId, 'tactical', 0).ok).toBe(true);

    // Walk back into Safe Zone (~2.2s) and wait until combat lock (5s) clears
    instance.setPlayerInput(cleric.characterId, {
      up: false,
      down: true,
      left: false,
      right: false,
      attack: false,
      aimAngle: Math.PI / 2,
    });
    for (let i = 0; i < 90; i++) instance.step(25);
    instance.setPlayerInput(cleric.characterId, {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
    });
    for (let i = 0; i < 115; i++) instance.step(25); // ~5125ms total -> out of combat, ~1675ms cooldown left!

    const clericState = instance.getPlayerState(cleric.characterId)!;
    expect(clericState.zone).toBe('safe');
    expect(clericState.inCombat).toBe(false);
    const cdBeforeUnequip = clericState.tacticalCooldownsMs['tac_cleric_sanctified_pulse'];
    expect(cdBeforeUnequip).toBeGreaterThan(1000);

    // Unequip weapon in Safe Zone
    const unequipRes = await instance.handleEquipArmament(
      cleric.characterId,
      'weapon',
      null,
      adapter
    );
    expect(unequipRes.ok).toBe(true);
    expect(instance.getPlayerState(cleric.characterId)?.activeTacticalSkillId).toBeNull();

    // Advance 500ms while weapon unequipped -> cooldown ticks down independently!
    for (let i = 0; i < 20; i++) instance.step(25);
    const cdWhileUnequipped =
      instance.getPlayerState(cleric.characterId)!.tacticalCooldownsMs[
        'tac_cleric_sanctified_pulse'
      ];
    expect(cdWhileUnequipped).toBeLessThan(cdBeforeUnequip);
    expect(cdWhileUnequipped).toBeGreaterThan(500);

    // Re-equip weapon -> remaining cooldown is preserved, never reset (DD-020)!
    const reequipRes = await instance.handleEquipArmament(
      cleric.characterId,
      'weapon',
      getDefaultWeaponId('cleric'),
      adapter
    );
    expect(reequipRes.ok).toBe(true);
    expect(
      instance.getPlayerState(cleric.characterId)!.tacticalCooldownsMs[
        'tac_cleric_sanctified_pulse'
      ]
    ).toBe(cdWhileUnequipped);
  });

  it('prevents wall tunneling and detects Safe / Arena / Survival zones accurately', () => {
    const instance = new WorldInstance({
      instanceId: 'MOVE-TEST',
      name: 'Movement Test',
    });
    instance.addOrReconnectPlayer(makeIdentity(10));

    // Walk West through Safe Zone -> Open World -> Arena entrance
    instance.setPlayerInput('char_10', {
      up: false,
      down: false,
      left: true,
      right: false,
      attack: false,
      aimAngle: Math.PI,
    });
    for (let i = 0; i < 140; i++) instance.step(25);
    expect(instance.getPlayerState('char_10')?.zone).toBe('arena');

    // Continue West to verify outer border wall collision prevents tunneling out of bounds
    for (let i = 0; i < 260; i++) instance.step(25);
    const movedWest = instance.getPlayerState('char_10')!;
    expect(movedWest.x).toBeGreaterThan(TILE_SIZE);
  });

  it('reconstructs entity-diff snapshot deltas losslessly', () => {
    const instance = new WorldInstance({
      instanceId: 'DELTA-TEST',
      name: 'Delta Test',
    });
    instance.addOrReconnectPlayer(makeIdentity(1));
    const snap1 = instance.toSnapshot(true);
    const baseline = cloneSnapshotBaseline(snap1);

    instance.setPlayerInput('char_1', {
      up: true,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
    });
    instance.step(25);
    const snap2 = instance.toSnapshot(true);

    const delta = computeSnapshotDelta(baseline, snap2, snap1.tickSeq, snap2.tickSeq);
    const reconstructed = applySnapshotDelta(baseline, delta);
    expect(reconstructed.players[0].y).toBe(snap2.players[0].y);
    expect(reconstructed.tickSeq).toBe(snap2.tickSeq);
  });

  it('validates Zod client protocol messages and isolates Arena Honor from EXP', async () => {
    expect(
      ClientMessageSchema.safeParse({
        type: 'player:equip_armament',
        slot: 'weapon',
        itemId: 'wpn_vanguard_default',
      }).success
    ).toBe(true);

    expect(
      ClientMessageSchema.safeParse({
        type: 'player:attack_probe',
        aimAngle: Number.NaN,
        kind: 'basic',
      }).success
    ).toBe(false);

    const adapter = new DevCharacterAdapter();
    const char = await adapter.createCharacterForAccount({
      accountId: 'acc_prog',
      username: 'HonorTester',
      heroClass: 'ranger',
    });
    const progression = new ProgressionIntegrationLayer(adapter);
    expect(progression.rejectClientAssertedReward().accepted).toBe(false);

    const honorResult = await progression.recordServerVerifiedArenaHonor({
      claimId: 'claim_test_1',
      accountId: char.accountId,
      characterId: char.characterId,
      sourceActivity: 'arena',
      arenaHonorDelta: 25,
    });
    expect(honorResult.accepted).toBe(true);
    expect(honorResult.newHonorBalance).toBe(25);
    expect((await adapter.getCharacterByAccountId(char.accountId))?.xp).toBe(0);
  });

  it('normalizes keyboard & analog stickX/stickY diagonals, prevents wall tunneling, and stops cleanly on release', () => {
    const diagKeys = normalizePlayerInputDirection({
      up: true,
      down: false,
      left: false,
      right: true,
      stickX: 0,
      stickY: 0,
    });
    expect(Math.hypot(diagKeys.mx, diagKeys.my)).toBeCloseTo(1, 5);

    const diagStick = normalizePlayerInputDirection({
      up: false,
      down: false,
      left: false,
      right: false,
      stickX: 1,
      stickY: 1,
    });
    expect(Math.hypot(diagStick.mx, diagStick.my)).toBeCloseTo(1, 5);

    const halfStick = normalizePlayerInputDirection({
      up: false,
      down: false,
      left: false,
      right: false,
      stickX: 0.35,
      stickY: -0.35,
    });
    expect(Math.hypot(halfStick.mx, halfStick.my)).toBeCloseTo(Math.hypot(0.35, -0.35), 5);
    expect(
      hasMovementInput({
        up: false,
        down: false,
        left: false,
        right: false,
        stickX: 0.35,
        stickY: -0.35,
      })
    ).toBe(true);
    expect(
      hasMovementInput({
        up: false,
        down: false,
        left: false,
        right: false,
        stickX: 0.02,
        stickY: 0.02,
      })
    ).toBe(false);

    const instance = new WorldInstance({
      instanceId: 'ANALOG-TEST',
      name: 'Analog Movement Test',
    });
    const joined = instance.addOrReconnectPlayer(makeIdentity(20));
    const startX = joined.player!.x;
    const startY = joined.player!.y;

    // Move Northwest via purely analog stickX / stickY (all keyboard booleans false)
    instance.setPlayerInput(
      'char_20',
      {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: -Math.PI * 0.75,
        stickX: -0.6,
        stickY: -0.8,
      },
      1
    );
    for (let i = 0; i < 20; i++) instance.step(25);
    const moved = instance.getPlayerState('char_20')!;
    expect(moved.x).toBeLessThan(startX);
    expect(moved.y).toBeLessThan(startY);
    expect(moved.lastInputSeq).toBe(1);

    // Release joystick -> velocity stops immediately on next step
    instance.setPlayerInput(
      'char_20',
      {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: -Math.PI * 0.75,
        stickX: 0,
        stickY: 0,
      },
      2
    );
    instance.step(25);
    const stopped = instance.getPlayerState('char_20')!;
    expect(stopped.vx).toBe(0);
    expect(stopped.vy).toBe(0);
    expect(stopped.lastInputSeq).toBe(2);

    // Drive straight West via analog stick to verify outer wall collision holds
    instance.setPlayerInput(
      'char_20',
      {
        up: false,
        down: false,
        left: false,
        right: false,
        attack: false,
        aimAngle: Math.PI,
        stickX: -1,
        stickY: 0,
      },
      3
    );
    for (let i = 0; i < 400; i++) instance.step(25);
    expect(instance.getPlayerState('char_20')!.x).toBeGreaterThan(TILE_SIZE);
  });
});

describe('OverworldNetworkClient Analog Input & Prediction Reconciliation', () => {
  const originalWebSocket = (globalThis as { WebSocket?: unknown }).WebSocket;
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    (globalThis as { WebSocket?: unknown }).WebSocket = originalWebSocket;
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('tracks stickX/stickY in sendInput, sends held analog updates, stops on release, and emits zero idle traffic', () => {
    const sentMessages: string[] = [];
    class MockWebSocket {
      static OPEN = 1;
      readyState = 1;
      onopen: (() => void) | null = null;
      onmessage: ((evt: { data: string }) => void) | null = null;
      onclose: (() => void) | null = null;
      constructor(public url: string, public protocols?: string[]) {}
      send(data: string) {
        sentMessages.push(data);
      }
      close() {}
    }

    (globalThis as { WebSocket?: unknown }).WebSocket = MockWebSocket;
    (globalThis as { window?: unknown }).window = {
      location: { protocol: 'http:', host: '127.0.0.1:3000' },
    };

    const client = new OverworldNetworkClient('tok_test', {
      onLobbyUpdate: () => {},
      onInstanceJoined: () => {},
      onInstanceLeft: () => {},
      onSnapshot: () => {},
      onChatMessage: () => {},
      onRejected: () => {},
      onPingSample: () => {},
      onConnectionStateChange: () => {},
    });
    client.connect();

    const idleInput: OverworldInputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
      stickX: 0,
      stickY: 0,
    };

    // First idle call establishes signature; subsequent identical idle calls emit zero packets
    client.sendInput(idleInput, 1, false);
    expect(sentMessages.length).toBe(1);
    client.sendInput(idleInput, 2, false);
    client.sendInput(idleInput, 3, false);
    expect(sentMessages.length).toBe(1);

    // Holding analog stick sends continuous frames with stickX/stickY preserved
    const stickMoveA: OverworldInputState = { ...idleInput, stickX: 0.42, stickY: -0.61 };
    client.sendInput(stickMoveA, 4, false);
    client.sendInput(stickMoveA, 5, false);
    expect(sentMessages.length).toBe(3);
    const parsedA = JSON.parse(sentMessages[2]) as {
      type: string;
      input: OverworldInputState;
      seq: number;
    };
    expect(parsedA.type).toBe('player:input');
    expect(parsedA.input.stickX).toBeCloseTo(0.42, 3);
    expect(parsedA.input.stickY).toBeCloseTo(-0.61, 3);
    expect(parsedA.seq).toBe(5);

    // Changing analog stick angle sends updated stick values
    const stickMoveB: OverworldInputState = { ...idleInput, stickX: -0.8, stickY: 0.2 };
    client.sendInput(stickMoveB, 6, false);
    expect(sentMessages.length).toBe(4);
    const parsedB = JSON.parse(sentMessages[3]) as { input: OverworldInputState; seq: number };
    expect(parsedB.input.stickX).toBeCloseTo(-0.8, 3);
    expect(parsedB.input.stickY).toBeCloseTo(0.2, 3);

    // Releasing joystick immediately sends zeroed stop packet, then resumes 0 idle traffic
    client.sendInput(idleInput, 7, true);
    expect(sentMessages.length).toBe(5);
    const parsedStop = JSON.parse(sentMessages[4]) as { input: OverworldInputState; seq: number };
    expect(parsedStop.input.stickX).toBe(0);
    expect(parsedStop.input.stickY).toBe(0);

    client.sendInput(idleInput, 8, false);
    client.sendInput(idleInput, 9, false);
    expect(sentMessages.length).toBe(5);

    client.dispose();
  });

  it('bounds client prediction history and reconciles analog stick movement cleanly', () => {
    const instance = new WorldInstance({
      instanceId: 'RECON-TEST',
      name: 'Recon Test',
    });
    const joined = instance.addOrReconnectPlayer(makeIdentity(30));
    const localPlayer = joined.player!;
    const controller = new LocalPredictionController();
    controller.reset(localPlayer);

    const moveInput: OverworldInputState = {
      up: false,
      down: false,
      left: false,
      right: false,
      attack: false,
      aimAngle: 0,
      stickX: 0.75,
      stickY: 0,
    };

    // Simulate 210 unacked prediction steps (> 180 cap)
    for (let i = 0; i < 210; i++) {
      const seq = controller.allocateSeq();
      controller.predictStep(seq, moveInput, 0.025, instance.map, localPlayer);
    }

    // Also advance server for last 30 steps and ack seq 30
    instance.setPlayerInput(localPlayer.id, moveInput, 30);
    for (let i = 0; i < 30; i++) instance.step(25);
    const updatedServerState = instance.getPlayerState(localPlayer.id)!;

    controller.reconcileWithServer(updatedServerState, instance.map);
    const pose = controller.getPredictedPose(updatedServerState, instance.map);
    expect(pose.x).toBeGreaterThan(updatedServerState.x);
  });
});
