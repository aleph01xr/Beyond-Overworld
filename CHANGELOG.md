Beyond: Overworld — Changelog

All notable changes to Beyond: Overworld must be documented here.

This changelog records implemented changes, approved design changes, bug fixes, architectural modifications, and known limitations.

Documentation alone does not mean a feature has been implemented.

---

[Unreleased]

Project Status

- Initial project documentation and architecture planning.
- Core gameplay specifications established.
- Technical architecture proposed.
- Integration with Beyond: Dungeons planned.

Planned

- [ ] Initial client and server foundation.
- [ ] Database foundation.
- [ ] Authentication foundation.
- [ ] Character integration adapter.
- [ ] Multiplayer WebSocket foundation.
- [ ] World instance manager.
- [ ] Server-authoritative movement.
- [ ] Safe-zone protection.
- [ ] Open-world PvP foundation.
- [ ] Arena system.
- [ ] PvPvE Survival system.
- [ ] Public event system.
- [ ] Shared Beyond Universe integration.

Visual Development

- [ ] Audit Beyond: Dungeons visual assets.
- [ ] Establish Overworld art direction.
- [ ] Establish reusable character asset references.
- [ ] Establish environment and tileset references.
- [ ] Establish animation and visual effect standards.
- [ ] Establish UI visual standards.

---

Changelog Rules

Every meaningful implementation change must include:

- Date.
- Version or commit reference, when available.
- Category.
- Description.
- Affected systems.
- Testing status.

Categories

- "Added" — New functionality.
- "Changed" — Modifications to existing functionality.
- "Fixed" — Bug fixes.
- "Removed" — Removed functionality.
- "Security" — Security-related changes.
- "Performance" — Performance improvements.
- "Visual" — Art, animation, UI, and visual changes.
- "Architecture" — Structural or technical changes.
- "Documentation" — Documentation changes.

Entry Requirements

1. Only document changes that were actually made.
2. Never describe planned features as completed.
3. Identify incomplete or partially tested features.
4. Record changes that affect established gameplay mechanics.
5. Record changes that affect character appearance or visual assets.
6. Identify any deviation from approved documentation.
7. Reference relevant commits when possible.
8. Do not silently overwrite historical entries.

Example Entry

[0.1.0] — YYYY-MM-DD

Added

- Initial multiplayer connection system.

Architecture

- Established server-authoritative player movement.

Visual

- Integrated approved character sprite assets.

Testing

- Basic connection test completed.
- 100-player capacity not yet verified.

---

Versioning Guidelines

Use semantic-style versioning where appropriate:

- "0.x.x" — Early development and foundational systems.
- "1.0.0" — First stable release.
- Minor increments — Significant feature additions.
- Patch increments — Fixes and small improvements.

Version numbers must reflect actual development progress.

---

Development principle: The changelog is a historical record of what happened, not a list of promises about what will happen.
