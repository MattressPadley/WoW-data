import { getCredentials } from "./connection.ts";

// Global rate limiter — Blizzard allows 100 req/s, we target ~50 req/s for safety
const RATE_LIMIT_INTERVAL_MS = 20; // 50 req/s
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

let lastRequestTime = 0;

async function rateLimitWait(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < RATE_LIMIT_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

export class WoWAPI {
  private accessToken: string;
  private region: string;
  private baseUrl: string;

  constructor(region = "us") {
    const creds = getCredentials();
    this.accessToken = creds.accessToken;
    this.region = region;
    this.baseUrl = `https://${region}.api.blizzard.com`;
  }

  private async makeRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      await rateLimitWait();

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });

      if (response.status === 429) {
        if (attempt < MAX_RETRIES) {
          const delay = RETRY_DELAY_MS * (attempt + 1);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      return response.json();
    }
  }

  private ns(type: "static" | "dynamic" | "profile" = "static") {
    return `${type}-${this.region}`;
  }

  private charPath(realm: string, name: string) {
    return `/profile/wow/character/${realm}/${name.toLowerCase()}`;
  }

  private getData(endpoint: string, namespace?: string, locale = "en_US", extra: Record<string, string> = {}): Promise<any> {
    return this.makeRequest(endpoint, { namespace: namespace ?? this.ns(), locale, ...extra });
  }

  // Auction House
  getAHCommodities() {
    return this.getData("/data/wow/auctions/commodities", this.ns("dynamic"));
  }

  getAHRealmAuctions(connectedRealmId: number) {
    return this.getData(`/data/wow/connected-realm/${connectedRealmId}/auctions`, this.ns("dynamic"));
  }

  // Professions
  getProfessionsIndex() {
    return this.getData("/data/wow/profession/index");
  }

  getProfession(professionId: number) {
    return this.getData(`/data/wow/profession/${professionId}`);
  }

  getProfessionMedia(professionId: number) {
    return this.getData(`/data/wow/media/profession/${professionId}`);
  }

  getProfessionSkillTier(professionId: number, skillTierId: number) {
    return this.getData(`/data/wow/profession/${professionId}/skill-tier/${skillTierId}`);
  }

  // Recipes
  getRecipe(recipeId: number) {
    return this.getData(`/data/wow/recipe/${recipeId}`);
  }

  getRecipeMedia(recipeId: number) {
    return this.getData(`/data/wow/media/recipe/${recipeId}`);
  }

  // Item Classes
  getItemClassesIndex() {
    return this.getData("/data/wow/item-class/index");
  }

  getItemClass(itemClassId: number) {
    return this.getData(`/data/wow/item-class/${itemClassId}`);
  }

  getItemSubclass(itemClassId: number, itemSubclassId: number) {
    return this.getData(`/data/wow/item-class/${itemClassId}/item-subclass/${itemSubclassId}`);
  }

  // Item Sets
  getItemSetsIndex() {
    return this.getData("/data/wow/item-set/index");
  }

  getItemSet(itemSetId: number) {
    return this.getData(`/data/wow/item-set/${itemSetId}`);
  }

  // Items
  searchItems(searchTerm: string, pageSize = 100, page = 1) {
    return this.makeRequest("/data/wow/search/item", {
      namespace: `static-${this.region}`,
      "name.en_US": searchTerm,
      _pageSize: String(pageSize),
      _page: String(page),
    });
  }

  getItem(itemId: number) {
    return this.getData(`/data/wow/item/${itemId}`);
  }

  getItemMedia(itemId: number) {
    return this.getData(`/data/wow/media/item/${itemId}`);
  }

  // Modified Crafting
  getModifiedCraftingIndex() {
    return this.getData("/data/wow/modified-crafting/index");
  }

  getModifiedCraftingCategoryIndex() {
    return this.getData("/data/wow/modified-crafting/category/index");
  }

  getModifiedCraftingCategory(categoryId: number) {
    return this.getData(`/data/wow/modified-crafting/category/${categoryId}`);
  }

  getModifiedCraftingReagentSlotTypeIndex() {
    return this.getData("/data/wow/modified-crafting/reagent-slot-type/index");
  }

  getModifiedCraftingReagentSlotType(slotTypeId: number) {
    return this.getData(`/data/wow/modified-crafting/reagent-slot-type/${slotTypeId}`);
  }

  // Achievement
  getAchievementCategoryIndex() {
    return this.getData("/data/wow/achievement-category/index");
  }

  getAchievementCategory(id: number) {
    return this.getData(`/data/wow/achievement-category/${id}`);
  }

  getAchievementIndex() {
    return this.getData("/data/wow/achievement/index");
  }

  getAchievement(id: number) {
    return this.getData(`/data/wow/achievement/${id}`);
  }

  getAchievementMedia(id: number) {
    return this.getData(`/data/wow/media/achievement/${id}`);
  }

  // Azerite Essence
  getAzeriteEssenceIndex() {
    return this.getData("/data/wow/azerite-essence/index");
  }

  getAzeriteEssence(id: number) {
    return this.getData(`/data/wow/azerite-essence/${id}`);
  }

  getAzeriteEssenceMedia(id: number) {
    return this.getData(`/data/wow/media/azerite-essence/${id}`);
  }

  // Connected Realm
  getConnectedRealmIndex() {
    return this.getData("/data/wow/connected-realm/index", this.ns("dynamic"));
  }

  getConnectedRealm(id: number) {
    return this.getData(`/data/wow/connected-realm/${id}`, this.ns("dynamic"));
  }

  // Covenant
  getCovenantIndex() {
    return this.getData("/data/wow/covenant/index");
  }

  getCovenant(id: number) {
    return this.getData(`/data/wow/covenant/${id}`);
  }

  getCovenantMedia(id: number) {
    return this.getData(`/data/wow/media/covenant/${id}`);
  }

  getSoulbindIndex() {
    return this.getData("/data/wow/covenant/soulbind/index");
  }

  getSoulbind(id: number) {
    return this.getData(`/data/wow/covenant/soulbind/${id}`);
  }

  getConduitIndex() {
    return this.getData("/data/wow/covenant/conduit/index");
  }

  getConduit(id: number) {
    return this.getData(`/data/wow/covenant/conduit/${id}`);
  }

  // Creature
  getCreatureFamilyIndex() {
    return this.getData("/data/wow/creature-family/index");
  }

  getCreatureFamily(id: number) {
    return this.getData(`/data/wow/creature-family/${id}`);
  }

  getCreatureTypeIndex() {
    return this.getData("/data/wow/creature-type/index");
  }

  getCreatureType(id: number) {
    return this.getData(`/data/wow/creature-type/${id}`);
  }

  getCreature(id: number) {
    return this.getData(`/data/wow/creature/${id}`);
  }

  getCreatureDisplayMedia(id: number) {
    return this.getData(`/data/wow/media/creature-display/${id}`);
  }

  getCreatureFamilyMedia(id: number) {
    return this.getData(`/data/wow/media/creature-family/${id}`);
  }

  // Guild Crest
  getGuildCrestIndex() {
    return this.getData("/data/wow/guild-crest/index");
  }

  getGuildCrestBorderMedia(id: number) {
    return this.getData(`/data/wow/media/guild-crest/border/${id}`);
  }

  getGuildCrestEmblemMedia(id: number) {
    return this.getData(`/data/wow/media/guild-crest/emblem/${id}`);
  }

  // Heirloom
  getHeirloomIndex() {
    return this.getData("/data/wow/heirloom/index");
  }

  getHeirloom(id: number) {
    return this.getData(`/data/wow/heirloom/${id}`);
  }

  // Journal
  getJournalExpansionIndex() {
    return this.getData("/data/wow/journal-expansion/index");
  }

  getJournalExpansion(id: number) {
    return this.getData(`/data/wow/journal-expansion/${id}`);
  }

  getJournalEncounterIndex() {
    return this.getData("/data/wow/journal-encounter/index");
  }

  getJournalEncounter(id: number) {
    return this.getData(`/data/wow/journal-encounter/${id}`);
  }

  getJournalInstanceIndex() {
    return this.getData("/data/wow/journal-instance/index");
  }

  getJournalInstance(id: number) {
    return this.getData(`/data/wow/journal-instance/${id}`);
  }

  getJournalInstanceMedia(id: number) {
    return this.getData(`/data/wow/media/journal-instance/${id}`);
  }

  // Mythic Keystone Affix
  getKeystoneAffixIndex() {
    return this.getData("/data/wow/keystone-affix/index");
  }

  getKeystoneAffix(id: number) {
    return this.getData(`/data/wow/keystone-affix/${id}`);
  }

  getKeystoneAffixMedia(id: number) {
    return this.getData(`/data/wow/media/keystone-affix/${id}`);
  }

  // Mount
  getMountIndex() {
    return this.getData("/data/wow/mount/index");
  }

  getMount(id: number) {
    return this.getData(`/data/wow/mount/${id}`);
  }

  // Mythic Keystone Dungeon
  getMythicKeystoneDungeonIndex() {
    return this.getData("/data/wow/mythic-keystone/dungeon/index", this.ns("dynamic"));
  }

  getMythicKeystoneDungeon(id: number) {
    return this.getData(`/data/wow/mythic-keystone/dungeon/${id}`, this.ns("dynamic"));
  }

  getMythicKeystoneIndex() {
    return this.getData("/data/wow/mythic-keystone/index", this.ns("dynamic"));
  }

  getMythicKeystonePeriodIndex() {
    return this.getData("/data/wow/mythic-keystone/period/index", this.ns("dynamic"));
  }

  getMythicKeystonePeriod(id: number) {
    return this.getData(`/data/wow/mythic-keystone/period/${id}`, this.ns("dynamic"));
  }

  getMythicKeystoneSeasonIndex() {
    return this.getData("/data/wow/mythic-keystone/season/index", this.ns("dynamic"));
  }

  getMythicKeystoneSeason(id: number) {
    return this.getData(`/data/wow/mythic-keystone/season/${id}`, this.ns("dynamic"));
  }

  // Mythic Keystone Leaderboard
  getMythicLeaderboardIndex(connectedRealmId: number) {
    return this.getData(`/data/wow/connected-realm/${connectedRealmId}/mythic-leaderboard/index`, this.ns("dynamic"));
  }

  getMythicLeaderboard(connectedRealmId: number, dungeonId: number, period: number) {
    return this.getData(`/data/wow/connected-realm/${connectedRealmId}/mythic-leaderboard/${dungeonId}/period/${period}`, this.ns("dynamic"));
  }

  // Mythic Raid Leaderboard
  getMythicRaidLeaderboard(raid: string, faction: string) {
    return this.getData(`/data/wow/leaderboard/hall-of-fame/${raid}/${faction}`, this.ns("dynamic"));
  }

  // Pet
  getPetIndex() {
    return this.getData("/data/wow/pet/index");
  }

  getPet(id: number) {
    return this.getData(`/data/wow/pet/${id}`);
  }

  getPetMedia(id: number) {
    return this.getData(`/data/wow/media/pet/${id}`);
  }

  getPetAbilityIndex() {
    return this.getData("/data/wow/pet-ability/index");
  }

  getPetAbility(id: number) {
    return this.getData(`/data/wow/pet-ability/${id}`);
  }

  getPetAbilityMedia(id: number) {
    return this.getData(`/data/wow/media/pet-ability/${id}`);
  }

  // Playable Class
  getPlayableClassIndex() {
    return this.getData("/data/wow/playable-class/index");
  }

  getPlayableClass(id: number) {
    return this.getData(`/data/wow/playable-class/${id}`);
  }

  getPlayableClassMedia(id: number) {
    return this.getData(`/data/wow/media/playable-class/${id}`);
  }

  getPlayableClassPvpTalentSlots(id: number) {
    return this.getData(`/data/wow/playable-class/${id}/pvp-talent-slots`);
  }

  // Playable Race
  getPlayableRaceIndex() {
    return this.getData("/data/wow/playable-race/index");
  }

  getPlayableRace(id: number) {
    return this.getData(`/data/wow/playable-race/${id}`);
  }

  // Playable Specialization
  getPlayableSpecializationIndex() {
    return this.getData("/data/wow/playable-specialization/index");
  }

  getPlayableSpecialization(id: number) {
    return this.getData(`/data/wow/playable-specialization/${id}`);
  }

  getPlayableSpecializationMedia(id: number) {
    return this.getData(`/data/wow/media/playable-specialization/${id}`);
  }

  // Power Type
  getPowerTypeIndex() {
    return this.getData("/data/wow/power-type/index");
  }

  getPowerType(id: number) {
    return this.getData(`/data/wow/power-type/${id}`);
  }

  // PvP Season
  getPvpSeasonIndex() {
    return this.getData("/data/wow/pvp-season/index", this.ns("dynamic"));
  }

  getPvpSeason(id: number) {
    return this.getData(`/data/wow/pvp-season/${id}`, this.ns("dynamic"));
  }

  getPvpLeaderboardIndex(seasonId: number) {
    return this.getData(`/data/wow/pvp-season/${seasonId}/pvp-leaderboard/index`, this.ns("dynamic"));
  }

  getPvpLeaderboard(seasonId: number, bracket: string) {
    return this.getData(`/data/wow/pvp-season/${seasonId}/pvp-leaderboard/${bracket}`, this.ns("dynamic"));
  }

  getPvpRewardIndex(seasonId: number) {
    return this.getData(`/data/wow/pvp-season/${seasonId}/pvp-reward/index`, this.ns("dynamic"));
  }

  // PvP Tier
  getPvpTierIndex() {
    return this.getData("/data/wow/pvp-tier/index");
  }

  getPvpTier(id: number) {
    return this.getData(`/data/wow/pvp-tier/${id}`);
  }

  getPvpTierMedia(id: number) {
    return this.getData(`/data/wow/media/pvp-tier/${id}`);
  }

  // Quest
  getQuestIndex() {
    return this.getData("/data/wow/quest/index");
  }

  getQuest(id: number) {
    return this.getData(`/data/wow/quest/${id}`);
  }

  getQuestCategoryIndex() {
    return this.getData("/data/wow/quest/category/index");
  }

  getQuestCategory(id: number) {
    return this.getData(`/data/wow/quest/category/${id}`);
  }

  getQuestAreaIndex() {
    return this.getData("/data/wow/quest/area/index");
  }

  getQuestArea(id: number) {
    return this.getData(`/data/wow/quest/area/${id}`);
  }

  getQuestTypeIndex() {
    return this.getData("/data/wow/quest/type/index");
  }

  getQuestType(id: number) {
    return this.getData(`/data/wow/quest/type/${id}`);
  }

  // Realm
  getRealmIndex() {
    return this.getData("/data/wow/realm/index", this.ns("dynamic"));
  }

  getRealm(slug: string) {
    return this.getData(`/data/wow/realm/${slug}`, this.ns("dynamic"));
  }

  // Region
  getRegionIndex() {
    return this.getData("/data/wow/region/index", this.ns("dynamic"));
  }

  getRegion(id: number) {
    return this.getData(`/data/wow/region/${id}`, this.ns("dynamic"));
  }

  // Reputation
  getReputationFactionIndex() {
    return this.getData("/data/wow/reputation-faction/index");
  }

  getReputationFaction(id: number) {
    return this.getData(`/data/wow/reputation-faction/${id}`);
  }

  getReputationTiersIndex() {
    return this.getData("/data/wow/reputation-tiers/index");
  }

  getReputationTiers(id: number) {
    return this.getData(`/data/wow/reputation-tiers/${id}`);
  }

  // Spell
  getSpell(id: number) {
    return this.getData(`/data/wow/spell/${id}`);
  }

  getSpellMedia(id: number) {
    return this.getData(`/data/wow/media/spell/${id}`);
  }

  // Talent
  getTalentTreeIndex() {
    return this.getData("/data/wow/talent-tree/index");
  }

  getTalentTree(treeId: number, specId: number) {
    return this.getData(`/data/wow/talent-tree/${treeId}/playable-specialization/${specId}`);
  }

  getTalentTreeNodes(treeId: number) {
    return this.getData(`/data/wow/talent-tree/${treeId}`);
  }

  getTalentIndex() {
    return this.getData("/data/wow/talent/index");
  }

  getTalent(id: number) {
    return this.getData(`/data/wow/talent/${id}`);
  }

  getPvpTalentIndex() {
    return this.getData("/data/wow/pvp-talent/index");
  }

  getPvpTalent(id: number) {
    return this.getData(`/data/wow/pvp-talent/${id}`);
  }

  // Tech Talent
  getTechTalentTreeIndex() {
    return this.getData("/data/wow/tech-talent-tree/index");
  }

  getTechTalentTree(id: number) {
    return this.getData(`/data/wow/tech-talent-tree/${id}`);
  }

  getTechTalentIndex() {
    return this.getData("/data/wow/tech-talent/index");
  }

  getTechTalent(id: number) {
    return this.getData(`/data/wow/tech-talent/${id}`);
  }

  getTechTalentMedia(id: number) {
    return this.getData(`/data/wow/media/tech-talent/${id}`);
  }

  // Title
  getTitleIndex() {
    return this.getData("/data/wow/title/index");
  }

  getTitle(id: number) {
    return this.getData(`/data/wow/title/${id}`);
  }

  // Toy
  getToyIndex() {
    return this.getData("/data/wow/toy/index");
  }

  getToy(id: number) {
    return this.getData(`/data/wow/toy/${id}`);
  }

  // WoW Token
  getWoWTokenIndex() {
    return this.getData("/data/wow/token/index", this.ns("dynamic"));
  }

  // Character Profile
  getCharacterProfile(realm: string, name: string) {
    return this.getData(this.charPath(realm, name), this.ns("profile"));
  }

  getCharacterProfileStatus(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/status`, this.ns("profile"));
  }

  // Character Achievements
  getCharacterAchievements(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/achievements`, this.ns("profile"));
  }

  getCharacterAchievementStatistics(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/achievements/statistics`, this.ns("profile"));
  }

  // Character Appearance
  getCharacterAppearance(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/appearance`, this.ns("profile"));
  }

  // Character Collections
  getCharacterCollections(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/collections`, this.ns("profile"));
  }

  getCharacterMountsCollection(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/collections/mounts`, this.ns("profile"));
  }

  getCharacterPetsCollection(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/collections/pets`, this.ns("profile"));
  }

  getCharacterToysCollection(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/collections/toys`, this.ns("profile"));
  }

  getCharacterHeirloomsCollection(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/collections/heirlooms`, this.ns("profile"));
  }

  getCharacterTransmogCollection(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/collections/transmogs`, this.ns("profile"));
  }

  // Character Encounters
  getCharacterEncounters(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/encounters`, this.ns("profile"));
  }

  getCharacterDungeons(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/encounters/dungeons`, this.ns("profile"));
  }

  getCharacterRaids(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/encounters/raids`, this.ns("profile"));
  }

  // Character Equipment
  getCharacterEquipment(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/equipment`, this.ns("profile"));
  }

  // Character Hunter Pets
  getCharacterHunterPets(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/hunter-pets`, this.ns("profile"));
  }

  // Character Media
  getCharacterMedia(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/character-media`, this.ns("profile"));
  }

  // Character Mythic Keystone Profile
  getCharacterMythicKeystoneProfile(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/mythic-keystone-profile`, this.ns("profile"));
  }

  getCharacterMythicKeystoneSeason(realm: string, name: string, seasonId: number) {
    return this.getData(`${this.charPath(realm, name)}/mythic-keystone-profile/season/${seasonId}`, this.ns("profile"));
  }

  // Character Professions
  getCharacterProfessions(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/professions`, this.ns("profile"));
  }

  // Character PvP
  getCharacterPvpSummary(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/pvp-summary`, this.ns("profile"));
  }

  getCharacterPvpBracket(realm: string, name: string, bracket: string) {
    return this.getData(`${this.charPath(realm, name)}/pvp-bracket/${bracket}`, this.ns("profile"));
  }

  // Character Quests
  getCharacterQuests(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/quests`, this.ns("profile"));
  }

  getCharacterCompletedQuests(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/quests/completed`, this.ns("profile"));
  }

  // Character Reputations
  getCharacterReputations(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/reputations`, this.ns("profile"));
  }

  // Character Soulbinds
  getCharacterSoulbinds(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/soulbinds`, this.ns("profile"));
  }

  // Character Specializations
  getCharacterSpecializations(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/specializations`, this.ns("profile"));
  }

  // Character Statistics
  getCharacterStatistics(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/statistics`, this.ns("profile"));
  }

  // Character Titles
  getCharacterTitles(realm: string, name: string) {
    return this.getData(`${this.charPath(realm, name)}/titles`, this.ns("profile"));
  }

  // Account Profile (protected — requires authorization code token)
  getAccountProfile() {
    return this.getData("/profile/user/wow", this.ns("profile"));
  }

  getProtectedCharacter(realmId: number, characterId: number) {
    return this.getData(`/profile/user/wow/protected-character/${realmId}-${characterId}`, this.ns("profile"));
  }
}
