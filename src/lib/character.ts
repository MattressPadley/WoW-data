/**
 * Character resolution — loads character identity from YAML files or CLI flags.
 *
 * Resolution order:
 *   1. --realm + --name flags (backward compatible)
 *   2. --character <slug> flag → user/characters/<slug>.yaml
 *   3. No flags → user/active.yaml → user/characters/<slug>.yaml
 */

import yaml from "js-yaml";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { getArg } from "../utils.ts";

const USER_DIR = "user";
const CHARACTERS_DIR = `${USER_DIR}/characters`;
const ACTIVE_FILE = `${USER_DIR}/active.yaml`;

export interface CharacterIdentity {
  name: string;
  realm: string;
  class?: string;
  spec?: string;
  region: string;
}

interface CharacterYaml {
  name: string;
  realm: string;
  class?: string;
  spec?: string;
  region?: string;
}

interface ActiveYaml {
  character: string;
}

async function loadCharacterYaml(slug: string): Promise<CharacterYaml> {
  const path = `${CHARACTERS_DIR}/${slug}.yaml`;
  try {
    const content = await readFile(path, "utf-8");
    return yaml.load(content) as CharacterYaml;
  } catch {
    throw new Error(`Character file not found: ${path}`);
  }
}

async function loadActiveSlug(): Promise<string> {
  try {
    const content = await readFile(ACTIVE_FILE, "utf-8");
    const data = yaml.load(content) as ActiveYaml;
    if (!data?.character) throw new Error("No character set in active.yaml");
    return data.character;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      throw new Error(
        "No active character set. Use --realm + --name, --character <slug>, or create user/active.yaml",
      );
    }
    throw err;
  }
}

/**
 * Resolve character identity from CLI flags or YAML files.
 * The --spec flag always takes priority over YAML spec.
 */
export async function resolveCharacter(): Promise<CharacterIdentity> {
  const realm = getArg("--realm");
  const name = getArg("--name");
  const specOverride = getArg("--spec");
  const regionOverride = getArg("--region");

  // 1. Explicit --realm + --name
  if (realm && name) {
    return {
      name,
      realm,
      spec: specOverride,
      region: regionOverride ?? "us",
    };
  }

  // 2. --character <slug>
  const charSlug = getArg("--character");
  let charData: CharacterYaml;

  if (charSlug) {
    charData = await loadCharacterYaml(charSlug);
  } else {
    // 3. Active character
    const activeSlug = await loadActiveSlug();
    charData = await loadCharacterYaml(activeSlug);
  }

  return {
    name: charData.name.toLowerCase(),
    realm: charData.realm.toLowerCase(),
    class: charData.class,
    spec: specOverride ?? charData.spec,
    region: regionOverride ?? charData.region ?? "us",
  };
}

/**
 * List all saved character slugs.
 */
export async function listCharacters(): Promise<string[]> {
  try {
    const files = await readdir(CHARACTERS_DIR);
    return files
      .filter((f) => f.endsWith(".yaml"))
      .map((f) => f.replace(/\.yaml$/, ""));
  } catch {
    return [];
  }
}

/**
 * Get the active character slug.
 */
export async function getActiveCharacter(): Promise<string | null> {
  try {
    return await loadActiveSlug();
  } catch {
    return null;
  }
}

/**
 * Save a character YAML file and optionally set as active.
 */
export async function saveCharacter(
  slug: string,
  data: { name: string; realm: string; class?: string; spec?: string; region?: string },
  setActive = true,
): Promise<void> {
  await mkdir(CHARACTERS_DIR, { recursive: true });

  const yamlContent: Record<string, string> = {
    name: data.name,
    realm: data.realm,
  };
  if (data.class) yamlContent.class = data.class;
  if (data.spec) yamlContent.spec = data.spec;
  if (data.region && data.region !== "us") yamlContent.region = data.region;

  await writeFile(`${CHARACTERS_DIR}/${slug}.yaml`, yaml.dump(yamlContent));

  if (setActive) {
    await mkdir(USER_DIR, { recursive: true });
    await writeFile(ACTIVE_FILE, yaml.dump({ character: slug }));
  }
}

/**
 * Set the active character by slug.
 */
export async function setActiveCharacter(slug: string): Promise<void> {
  // Verify the character exists
  await loadCharacterYaml(slug);
  await mkdir(USER_DIR, { recursive: true });
  await writeFile(ACTIVE_FILE, yaml.dump({ character: slug }));
}
