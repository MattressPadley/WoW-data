colors = {
    'Rosewater': '#f5e0dc',
    'Flamingo': '#f2cdcd',
    'Pink': '#f5c2e7',
    'Mauve': '#cba6f7',
    'Red': '#f38ba8',
    'Maroon': '#eba0ac',
    'Peach': '#fab387',
    'Yellow': '#f9e2af',
    'Green': '#a6e3a1',
    'Teal': '#94e2d5',
    'Sky': '#89dceb',
    'Sapphire': '#74c7ec',
    'Blue': '#89b4fa',
    'Lavender': '#b4befe',
    'Text': '#cdd6f4',
    'Subtext1': '#bac2de',
    'Subtext0': '#a6adc8',
    'Overlay2': '#9399b2',
    'Overlay1': '#7f849c',
    'Overlay0': '#6c7086',
    'Surface2': '#585b70',
    'Surface1': '#45475a',
    'Surface0': '#313244',
    'Base': '#1e1e2e',
    'Mantle': '#181825',
    'Crust': '#11111b'
}

custom_track_colors = {
    'Normal Dungeon': colors['Blue'],
    'Explorer': colors['Sapphire'],
    'Adventurer': colors['Sky'],
    'Veteran': colors['Teal'],
    'Champion': colors['Green'],
    'Hero': colors['Yellow'],
    'Myth': colors['Peach'],
    'Base Spark Crafted': colors['Maroon'],
    'Crafted (Weathered)': colors['Red'],
    'Crafted (Runed)': colors['Mauve'],
    'Crafted (Gilded)': colors['Pink']
}

gear_score_data = {
    'Normal Dungeon': {'Starting Item Level': 554, 'Max Item Level': 554},
    'Explorer': {'Starting Item Level': 558, 'Max Item Level': 580},
    'Adventurer': {'Starting Item Level': 571, 'Max Item Level': 593},
    'Veteran': {'Starting Item Level': 584, 'Max Item Level': 606},
    'Champion': {'Starting Item Level': 597, 'Max Item Level': 619},
    'Hero': {'Starting Item Level': 610, 'Max Item Level': 626},
    'Myth': {'Starting Item Level': 623, 'Max Item Level': 639},
    'Base Spark Crafted': {'Starting Item Level': 593, 'Max Item Level': 606},
    'Crafted (Weathered)': {'Starting Item Level': 577, 'Max Item Level': 590},
    'Crafted (Runed)': {'Starting Item Level': 606, 'Max Item Level': 619},
    'Crafted (Gilded)': {'Starting Item Level': 623, 'Max Item Level': 636},
    'PvP (Honor)': {'Starting Item Level': 558, 'Max Item Level': 580},

}

gear_source_data = {
    "Myth": {
        "Source": ["Mythic Raid", "Mythic 10 Great Vault"],
        "Required Crest": "Gilded Crest",
    },
    "Hero": {
        "Source": [
            "Delver's Bounty Map Tier 8",
            "Delve Tiers 7-11 Great Vault",
            "Mythic Keystone 7-10",
            "Mythic Keystone 9-10 Great Vault",
            "Heroic Raid",
        ],
        "Required Crest": "Ruined Crest\nGilded Crest",
    },
    "Champion": {
        "Source": [
            "World Bosses",
            "Delve Tiers 7-11",
            "Delve Tiers 4-6 Great Vault",
            "Mythic Dungeons",
            "Mythic Keystone 2-6",
            "Normal Raid",
            "Mythic 0-6 Great Vault",
            "PvP (Conquest)",
        ],
        "Required Crest": "Carved Crest\nRuned Crest",
    },
    "Veteran": {
        "Source": [
            "Delve Tiers 5-6",
            "Delve Tiers 1-3 Great Vault",
            "Heroic Dungeons",
            "Heroic Dungeons LFR Raid Bosses",
            "Heroic BG Great Vault",
        ],
        "Required Crest": "Weathered Crest\nCarved Crest",
    },
    "Adventurer": {
        "Source": ["World Quests", 
                   "Delve Tiers 3-4", 
                   "Heroic Dungeons", 
                   "PvP (World Quests)"],
        "Required Crest": "Weathered Crest",
    },
    "Explorer": {
        "Source": ["Delve Tiers 1-2", 
                   "Outdoor Activities",
                   "PvP (Honor)"],
        "Required Crest": "Weathered Crest",
    },
    "Crafted (Runed)": {
        "Source": ["Crafting Orders"],
        "Required Crest": "Runed Crest",
    },
    "Crafted (Weathered)": {
        "Source": ["Crafting Orders"],
        "Required Crest": "Weathered Crest",
    },
    "Crafted (Gilded)": {
        "Source": ["Crafting Orders"],
        "Required Crest": "Gilded Crest",
    },
}
