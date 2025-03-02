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
    'Normal Dungeon': colors['Lavender'],
    'Explorer': colors['Blue'],
    'Adventurer': colors['Sapphire'],
    'Veteran': colors['Sky'],
    'Champion': colors['Teal'],
    'Hero': colors['Green'],
    'Myth': colors['Yellow'],
    'Base Spark Crafted': colors['Maroon'],
    'Crafted (Weathered)': colors['Red'],
    'Crafted (Runed)': colors['Mauve'],
    'Crafted (Gilded)': colors['Pink']
}

gear_score_data = {
    'Normal Dungeon': {'Starting Item Level': 629, 'Max Item Level': 645}, 
    'Explorer': {'Starting Item Level': 597, 'Max Item Level': 619}, 
    'Adventurer': {'Starting Item Level': 610, 'Max Item Level': 632}, 
    'Veteran': {'Starting Item Level': 623, 'Max Item Level': 645}, 
    'Champion': {'Starting Item Level': 636, 'Max Item Level': 658}, 
    'Hero': {'Starting Item Level': 649, 'Max Item Level': 665}, 
    'Myth': {'Starting Item Level': 662, 'Max Item Level': 678}, 
    'Base Spark Crafted': {'Starting Item Level': 623, 'Max Item Level': 636}, 
    'Crafted (Weathered)': {'Starting Item Level': 616, 'Max Item Level': 629}, 
    'Crafted (Runed)': {'Starting Item Level': 645, 'Max Item Level': 658}, 
    'Crafted (Gilded)': {'Starting Item Level': 662, 'Max Item Level': 675} 
}

gear_source_data = {
    "Myth": {
        "Source": ["Mythic Raid", "Mythic +8-12 Dungeons", "Mythic Great Vault"],
        "Required Crest": "Gilded Crest",
    },
    "Hero": {
        "Source": [
            "Heroic Raid",
            "Mythic +5-7 Dungeons",
            "Heroic Great Vault",
            "Very Rare Dungeon Drops"
        ],
        "Required Crest": "Runed Crest\nGilded Crest",
    },
    "Champion": {
        "Source": [
            "Normal Raid",
            "Mythic +2-4 Dungeons",
            "Normal Great Vault",
            "Mythic Dungeons",
        ],
        "Required Crest": "Carved Crest\nRuned Crest",
    },
    "Veteran": {
        "Source": [
            "LFR Raid",
            "Heroic Dungeons",
            "Weathered Crest Drops",
        ],
        "Required Crest": "Weathered Crest\nCarved Crest",
    },
    "Adventurer": {
        "Source": [
            "Delve Tiers 1-4",
            "Explorer Track 5-8"
        ],
        "Required Crest": "Weathered Crest",
    },
    "Explorer": {
        "Source": [
            "Delve Tiers 1-4",
            "Explorer Track 1-4"
        ],
        "Required Crest": "Weathered Crest",
    },
    "Crafted (Runed)": {
        "Source": ["Enchanted Runed"],
        "Required Crest": "Runed Crest",
    },
    "Crafted (Weathered)": {
        "Source": ["Enchanted Weathered"],
        "Required Crest": "Weathered Crest",
    },
    "Crafted (Gilded)": {
        "Source": ["Enchanted Gilded"],
        "Required Crest": "Gilded Crest",
    },
}

crest_source_data = {
    "Gilded Crest": {
        "Source": [
            "Mythic +7-12 Dungeons",
            "Mythic Raid Bosses",
            "Heroic Raid Bosses 1-7",
            "Bountiful Delves Tier 11"
        ]
    },
    "Runed Crest": {
        "Source": [
            "Mythic +2-6 Dungeons",
            "Heroic Raid Bosses 1-7",
            "Normal Raid Bosses 7-8",
            "Bountiful Delves Tiers 8-10"
        ]
    },
    "Carved Crest": {
        "Source": [
            "Mythic 0 Dungeons",
            "Normal Raid Bosses 1-7",
            "LFR Raid Bosses 7-8",
            "Bountiful Delves Tiers 6-7"
        ]
    },
    "Weathered Crest": {
        "Source": [
            "LFR Raid Bosses 1-8",
            "Heroic Dungeons",
            "Bountiful Delves Tiers 1-5"
        ]
    }
}
