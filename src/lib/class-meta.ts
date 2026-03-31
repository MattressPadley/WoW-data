const CLASS_ARMOR: Record<string, string> = {
  Warrior: "Plate",
  Paladin: "Plate",
  "Death Knight": "Plate",
  Hunter: "Mail",
  Shaman: "Mail",
  Evoker: "Mail",
  Rogue: "Leather",
  Monk: "Leather",
  "Demon Hunter": "Leather",
  Druid: "Leather",
  Mage: "Cloth",
  Warlock: "Cloth",
  Priest: "Cloth",
};

const UNIVERSAL_SLOTS = new Set([
  "Finger",
  "Trinket",
  "Neck",
  "Back",
]);

export function getArmorType(className: string): string {
  const type = CLASS_ARMOR[className];
  if (!type) throw new Error(`Unknown class: ${className}`);
  return type;
}

export function isUniversalSlot(slot: string): boolean {
  return UNIVERSAL_SLOTS.has(slot);
}
