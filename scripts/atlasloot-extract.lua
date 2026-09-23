-- Offline extractor for AtlasLootClassic loot tables.
--
-- Loads the addon's data module under a stub of the AtlasLoot module API and
-- emits JSON on stdout. Evaluating the real Lua avoids the fragility of
-- regexing addon source; nothing here runs at query time.
--
-- Usage: luajit scripts/atlasloot-extract.lua <addon-root> <true|false is_forever> <area-names.tsv>
--
-- <area-names.tsv> is `<AreaTable.ID>\t<AreaName_lang>` from the Forever build's
-- own AreaTable, so C_Map.GetAreaInfo returns real names rather than a stub.

local addonRoot = assert(..., "addon root required")
local args = { ... }
local isForever = args[2] == "true"
local areaNamesPath = args[3]

local areaNames = {}
if areaNamesPath then
  for line in io.lines(areaNamesPath) do
    local id, name = line:match("^(%d+)\t(.*)$")
    if id then areaNames[tonumber(id)] = name end
  end
end

-- --- JSON encoder (arrays vs objects decided by the caller) ----------------
local function escape(s)
  return (s:gsub('[%c"\\]', function(c)
    local map = { ['"'] = '\\"', ["\\"] = "\\\\", ["\n"] = "\\n", ["\r"] = "\\r", ["\t"] = "\\t" }
    return map[c] or string.format("\\u%04x", c:byte())
  end))
end

local encode
local function encodeArray(t)
  local parts = {}
  for i = 1, #t do parts[i] = encode(t[i]) end
  return "[" .. table.concat(parts, ",") .. "]"
end
local function encodeObject(t)
  local keys = {}
  for k in pairs(t) do keys[#keys + 1] = k end
  table.sort(keys)
  local parts = {}
  for _, k in ipairs(keys) do parts[#parts + 1] = '"' .. escape(tostring(k)) .. '":' .. encode(t[k]) end
  return "{" .. table.concat(parts, ",") .. "}"
end
encode = function(v)
  local t = type(v)
  if v == nil then return "null"
  elseif t == "boolean" then return tostring(v)
  elseif t == "number" then
    if v % 1 == 0 then return string.format("%d", v) end
    return tostring(v)
  elseif t == "string" then return '"' .. escape(v) .. '"'
  elseif t == "table" then
    if v.__array then
      local copy = {}
      for i = 1, #v do copy[i] = v[i] end
      return encodeArray(copy)
    end
    if #v > 0 then return encodeArray(v) end
    if next(v) == nil then return "{}" end
    return encodeObject(v)
  end
  error("cannot encode " .. t)
end
local function array(t) t = t or {}; t.__array = true; return t end

-- --- AtlasLoot module API stub --------------------------------------------

local difficultyNames = {}
local typeNames = {}
local diffSeq, typeSeq = 0, 0

local function passthroughLocale()
  return setmetatable({}, { __index = function(_, k) return k end })
end

local dataModule = {}
local registered = {}

function dataModule:AddDifficulty(name, _, _, _, _)
  diffSeq = diffSeq + 1
  local key = "__diff" .. diffSeq
  difficultyNames[key] = tostring(name)
  return key
end

local function addType(name)
  typeSeq = typeSeq + 1
  local key = "__type" .. typeSeq
  typeNames[key] = tostring(name)
  return key
end

function dataModule:AddItemTableType(name) return addType(name) end
function dataModule:AddExtraItemTableType(name) return addType(name) end
function dataModule:AddContentType(name) return addType(name) end

local dropRates = {}
local dropRateApi = {}
function dropRateApi:AddData(t)
  for npcID, items in pairs(t) do
    dropRates[npcID] = items
  end
end

-- Mirrors AtlasLootClassic/Init.lua: Forever reports as CLASSIC content, and so
-- does plain Vanilla, so `isForever` is the only axis that differs between runs.
local CLASSIC_VERSION_NUM = 1
local CURRENT_VERSION_NUM = CLASSIC_VERSION_NUM

local AtlasLoot = {
  RETAIL_VERSION_NUM = 99,
  CLASSIC_VERSION_NUM = CLASSIC_VERSION_NUM,
  BC_VERSION_NUM = 2,
  WRATH_VERSION_NUM = 3,
  CURRENT_VERSION_NUM = CURRENT_VERSION_NUM,
  CLASSIC = 1,
  BC = 2,
  WRATH = 3,
  IS = 1,
  IS_CLASSIC = true,
  IS_BC = false,
  IS_WRATH = false,
  IS_RETAIL = isForever,
  IS_FOREVER = isForever,
  Locales = passthroughLocale(),
  IngameLocales = passthroughLocale(),
  Data = { Droprate = dropRateApi },
  ItemDB = {
    Add = function(_, name)
      registered[#registered + 1] = name
      return setmetatable(dataModule, { __index = dataModule })
    end,
  },
}

-- ReturnForGameVersion(classic, bcc, wrath) — Forever and Vanilla are both CLASSIC.
function AtlasLoot.ReturnForGameVersion(classic)
  return classic
end

function AtlasLoot:GetGameVersion() return CURRENT_VERSION_NUM end

local function versionGate(pass, ret, retFalse)
  if pass then return ret == nil and true or ret end
  return retFalse
end

function AtlasLoot:GameVersion_EQ(v, ret, retFalse) return versionGate(CURRENT_VERSION_NUM == v, ret, retFalse) end
function AtlasLoot:GameVersion_NE(v, ret, retFalse) return versionGate(CURRENT_VERSION_NUM ~= v, ret, retFalse) end
function AtlasLoot:GameVersion_GT(v, ret, retFalse) return versionGate(CURRENT_VERSION_NUM > v, ret, retFalse) end
function AtlasLoot:GameVersion_LT(v, ret, retFalse) return versionGate(CURRENT_VERSION_NUM < v, ret, retFalse) end
function AtlasLoot:GameVersion_GE(v, ret, retFalse) return versionGate(CURRENT_VERSION_NUM >= v, ret, retFalse) end
function AtlasLoot:GameVersion_LE(v, ret, retFalse) return versionGate(CURRENT_VERSION_NUM <= v, ret, retFalse) end

function AtlasLoot:GetRetByFaction(horde, alliance)
  return env.UnitFactionGroup("player") == "Horde" and horde or alliance
end

function AtlasLoot:GetColoredClassNames() return passthroughLocale() end

local env = _G
env.AtlasLoot = AtlasLoot
-- data.lua falls back to `select(4, GetBuildInfo()) >= 11600` to detect Forever.
env.GetBuildInfo = function() return "1.60.1", "69977", "", isForever and 11600 or 11507 end
env.ATLASLOOT_FOREVER = isForever
env.WOW_PROJECT_ID = 2
env.WOW_PROJECT_CLASSIC = 2
env.WOW_PROJECT_MAINLINE = 1
env.RAID_CLASS_COLORS = {}
-- Real AreaTable names from the Forever build; nil for anything we do not have,
-- so a missing name surfaces rather than being invented.
env.C_Map = {
  GetAreaInfo = function(areaID) return areaNames[areaID] end,
}
env.UnitFactionGroup = function() return "Alliance" end
env.FACTION_ALLIANCE = "Alliance"
env.FACTION_HORDE = "Horde"
env.ATLASLOOT_DUNGEON_COLOR = ""
env.ATLASLOOT_RAID20_COLOR = ""
env.ATLASLOOT_RAID40_COLOR = ""
env.ATLASLOOT_IT_ALLIANCE = "Alliance"
env.ATLASLOOT_IT_HORDE = "Horde"
env.ATLASLOOT_IT_AMOUNT1 = 1
env.GetLocale = function() return "enUS" end

-- --- Load the module data -------------------------------------------------

local function loadModule(path, name)
  local chunk, err = loadfile(path)
  if not chunk then error(err) end
  return chunk(name)
end

local moduleDir = addonRoot .. "/AtlasLootClassic_DungeonsAndRaids"
loadModule(moduleDir .. "/data.lua", "AtlasLootClassic_DungeonsAndRaids")
pcall(loadModule, moduleDir .. "/droprate.lua", "AtlasLootClassic_DungeonsAndRaids")

-- --- Normalise ------------------------------------------------------------

local function firstNumber(v)
  if type(v) == "number" then return v end
  if type(v) == "table" then
    for _, x in ipairs(v) do
      if type(x) == "number" then return x end
    end
  end
  return nil
end

local instances = array()
for key, instance in pairs(dataModule) do
  if type(instance) == "table" and instance.items then
    local bosses = array()
    for _, boss in ipairs(instance.items) do
      if type(boss) == "table" then
        local difficulties = {}
        for dkey, entries in pairs(boss) do
          local dname = difficultyNames[dkey]
          if dname and type(entries) == "table" then
            local loot = array()
            for _, entry in ipairs(entries) do
              if type(entry) == "table" then
                local slot = type(entry[1]) == "number" and entry[1] or nil
                local itemID = type(entry[2]) == "number" and entry[2] or nil
                if itemID and itemID > 0 then
                  loot[#loot + 1] = { slot = slot, item_id = itemID }
                end
              end
            end
            difficulties[dname] = loot
          end
        end
        local npcID = firstNumber(boss.npcID)
        bosses[#bosses + 1] = {
          name = type(boss.name) == "string" and boss.name or nil,
          npc_id = npcID,
          atlas_map_boss_id = firstNumber(boss.AtlasMapBossID),
          extra_list = boss.ExtraList and true or false,
          difficulties = difficulties,
          drop_rates = npcID and dropRates[npcID] or nil,
        }
      end
    end
    local levelRange = nil
    if type(instance.LevelRange) == "table" then
      levelRange = array()
      for _, v in ipairs(instance.LevelRange) do levelRange[#levelRange + 1] = v end
    end
    local mapID = firstNumber(instance.MapID)
    -- The addon's MapID is an AreaTable id; resolving it against the Forever
    -- build's own AreaTable both names the instance and corroborates the id.
    local areaName = mapID and areaNames[mapID] or nil
    instances[#instances + 1] = {
      key = key,
      name = type(instance.name) == "string" and instance.name or areaName
        or (type(instance.AtlasMapID) == "string" and instance.AtlasMapID or key),
      area_name = areaName,
      content_type = typeNames[instance.ContentType],
      map_id = mapID,
      instance_id = firstNumber(instance.InstanceID),
      level_range = levelRange,
      boss_count = #bosses,
      bosses = bosses,
    }
  end
end

io.write(encode({
  is_forever = isForever,
  difficulties = difficultyNames,
  content_types = typeNames,
  modules = array(registered),
  instance_count = #instances,
  instances = instances,
}))
