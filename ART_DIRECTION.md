Beyond: Overworld — Art Direction

Project: Beyond: Overworld
Universe: Beyond
Document Type: Visual Identity and Asset Standards
Status: Initial Visual Direction Specification

---

1. Artistic Vision

Beyond: Overworld must share the established visual identity of Beyond: Dungeons.

Although the two games have different environments and gameplay purposes, they must look like parts of the same universe.

Overworld is not an opportunity to independently reinvent Beyond's artistic direction.

All new visual content must complement the existing game's visual language.

2. Primary Visual Reference

Beyond: Dungeons is the primary visual reference for Beyond: Overworld.

Repository:

https://github.com/aleph01xr/Beyond-Dungeons

Gemini must inspect the existing repository's available visual assets and rendering implementation before creating new visual content.

Existing game assets take priority over generated replacements.

If the repository does not contain the necessary visual references, request screenshots or source assets from the Game Director.

Do not guess what an existing character or asset looks like.

3. Character Identity Preservation

Established character designs must remain visually consistent across both games.

Preserve:

- Character silhouettes.
- Body proportions.
- Head and body proportions.
- Clothing designs.
- Armor designs.
- Hairstyles.
- Color schemes.
- Class-specific visual identities.
- Distinctive character details.

A character must remain recognizable when appearing in either game.

Do not redesign established characters without explicit approval.

4. Class Visual Identity

Every established class must retain its recognizable visual identity.

This applies to:

- Character appearance.
- Class-specific equipment.
- Basic attack animations.
- Tactical Skill animations.
- Movement animations.
- Combat effects.
- Idle animations.

New class-related visuals must complement the existing class design.

Do not invent replacement appearances for established classes.

5. Sprite and Animation Standards

Existing sprite assets and animation conventions must be inspected before implementation.

Preserve existing conventions for:

- Sprite dimensions.
- Pixel density.
- Animation frame structure.
- Character proportions.
- Movement directions.
- Idle animations.
- Attack animations.
- Ability animations.
- Death and revive animations.

Do not resize, redraw, smooth, or reinterpret existing sprites without approval.

New animations may be introduced when gameplay requires them, but must maintain visual consistency with the established characters.

6. Equipment Design

Weapons and Vestments must belong to the Beyond universe.

New equipment should have distinct identities while respecting the existing artistic direction.

Preserve:

- Class compatibility.
- Visual readability.
- Pixel-art rendering conventions.
- Equipment silhouettes.
- Color and material consistency.

Equipment appearance must communicate its identity without making established characters unrecognizable.

7. Enemy and Creature Design

New enemies and creatures must fit the visual language of Beyond.

They should have recognizable silhouettes and readable animations.

Do not create enemies that visually clash with the established universe.

Existing enemy designs must not be replaced without approval.

8. Environment and World Design

Overworld may introduce new environments.

These environments must feel like they belong to the same world as Beyond: Dungeons.

Maintain consistency in:

- Pixel-art rendering.
- Environmental proportions.
- Tile dimensions.
- Lighting conventions.
- Terrain details.
- Architecture.
- Environmental objects.
- Color relationships.

New areas may have distinct themes without abandoning the universe's established visual identity.

9. User Interface

The Overworld interface must remain visually consistent with Beyond.

Preserve established conventions where applicable:

- Typography.
- UI proportions.
- Icon style.
- Button appearance.
- Panels.
- Health bars.
- Ability indicators.
- Equipment displays.
- Menus.
- Notifications.

New UI elements should look like natural extensions of the existing interface.

Do not independently redesign the entire UI.

10. Visual Effects

Combat and environmental effects must maintain the established rendering style.

This includes:

- Basic attack effects.
- Tactical Skill effects.
- Weapon effects.
- Vestment effects.
- Damage indicators.
- Status effects.
- Environmental effects.
- Event effects.

Effects must remain readable and must not unnecessarily obscure gameplay.

11. Asset Management

Organize visual assets consistently.

Recommended categories:

assets/
├── characters/
├── classes/
├── weapons/
├── vestments/
├── enemies/
├── environments/
├── tilesets/
├── animations/
├── effects/
├── ui/
├── icons/
└── audio/

This structure is a recommendation and should be adapted to the existing repository.

Maintain an asset manifest documenting:

- Asset identifier.
- File location.
- Asset category.
- Dimensions.
- Animation information, if applicable.
- Original or newly created status.
- Reference source.

Keep original reference assets unchanged.

12. AI-Generated Visual Content

AI-generated visual content must not replace established Beyond assets.

Before generating or introducing new visual assets:

1. Identify the visual requirement.
2. Inspect existing references.
3. Determine whether an existing asset can be reused.
4. Identify any missing reference.
5. Obtain approval when a new design affects established characters or visual identity.

New visual content must be reviewed for consistency before integration.

Do not treat an AI-generated interpretation as an authoritative character design.

13. Visual Quality Requirements

All visual content must be checked for:

- Consistent pixel scale.
- Consistent character proportions.
- Clear silhouettes.
- Animation consistency.
- Visual readability.
- Appropriate color relationships.
- Compatibility with existing assets.
- Correct rendering in the game.

Do not claim visual consistency has been verified without comparing the actual assets.

14. Visual Change Approval

The following changes require explicit Game Director approval:

- Redesigning established characters.
- Changing class appearances.
- Changing character proportions.
- Replacing existing sprite sheets.
- Changing established animation styles.
- Redesigning the overall UI.
- Changing the game's fundamental rendering style.
- Replacing original visual assets.

New environmental content and new equipment designs must also be reviewed when they introduce significant changes to the established visual language.

Final Visual Principle

Beyond: Overworld may expand the world of Beyond, but it must never lose the visual identity that makes Beyond recognizable.

New experiences. Same universe. Consistent identity.
