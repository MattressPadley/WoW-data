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
    'Adventurer': colors['Sapphire'],
    'Veteran': colors['Sky'],
    'Champion': colors['Teal'],
    'Hero': colors['Green'],
    'Myth': colors['Yellow'],
    'Crafted (Veteran)': colors['Red'],
    'Crafted (Hero)': colors['Mauve'],
    'Crafted (Myth)': colors['Pink']
}

gear_score_data = {
    'Adventurer': {'Starting Item Level': 224, 'Max Item Level': 237},
    'Veteran': {'Starting Item Level': 237, 'Max Item Level': 250},
    'Champion': {'Starting Item Level': 250, 'Max Item Level': 263},
    'Hero': {'Starting Item Level': 263, 'Max Item Level': 276},
    'Myth': {'Starting Item Level': 276, 'Max Item Level': 289},
    'Crafted (Veteran)': {'Starting Item Level': 233, 'Max Item Level': 246},
    'Crafted (Hero)': {'Starting Item Level': 259, 'Max Item Level': 272},
    'Crafted (Myth)': {'Starting Item Level': 272, 'Max Item Level': 285},
}

gear_source_data = {
    "Myth": {
        "Source": [
            "Mythic Raid",
            "Mythic +9 and Higher",
            "Mythic Great Vault",
        ],
        "Required Crest": "Myth Dawncrest",
    },
    "Hero": {
        "Source": [
            "Heroic Raid",
            "Mythic +4-8 Dungeons",
            "Heroic Great Vault",
            "Delves Tier 11",
        ],
        "Required Crest": "Hero Dawncrest",
    },
    "Champion": {
        "Source": [
            "Normal Raid",
            "Mythic +2-3 Dungeons",
            "Mythic Seasonal Dungeons",
            "Nightmare Prey Hunts",
            "Delves Tiers 7-8",
        ],
        "Required Crest": "Champion Dawncrest",
    },
    "Veteran": {
        "Source": [
            "Raid Finder",
            "Heroic Seasonal Dungeons",
            "Hard Prey Hunts",
            "Delves Tiers 5-6",
        ],
        "Required Crest": "Veteran Dawncrest",
    },
    "Adventurer": {
        "Source": [
            "Outdoor Events",
            "Normal Prey Hunts",
            "Delves Tiers 1-4",
        ],
        "Required Crest": "Adventurer Dawncrest",
    },
    "Crafted (Veteran)": {
        "Source": ["Spark of Radiance + Veteran Dawncrest"],
        "Required Crest": "Veteran Dawncrest",
    },
    "Crafted (Hero)": {
        "Source": ["Spark of Radiance + Hero Dawncrest"],
        "Required Crest": "Hero Dawncrest",
    },
    "Crafted (Myth)": {
        "Source": ["Spark of Radiance + Myth Dawncrest"],
        "Required Crest": "Myth Dawncrest",
    },
}

crest_source_data = {
    "Myth Dawncrest": {
        "Source": [
            "Mythic +9 and Higher",
            "Mythic Raid Bosses",
        ]
    },
    "Hero Dawncrest": {
        "Source": [
            "Mythic +4-8 Dungeons",
            "Heroic Raid Bosses",
            "Delves Tier 11",
            "Trovehunter's Bounty Tiers 8+",
        ]
    },
    "Champion Dawncrest": {
        "Source": [
            "Mythic +2-3 Dungeons",
            "Mythic Seasonal Dungeons",
            "Normal Raid Bosses",
            "Nightmare Prey Hunts",
            "Delves Tiers 7-8",
            "Trovehunter's Bounty Tiers 6-7",
        ]
    },
    "Veteran Dawncrest": {
        "Source": [
            "Heroic Seasonal Dungeons",
            "Raid Finder Bosses",
            "Hard Prey Hunts",
            "Delves Tiers 5-6",
            "Trovehunter's Bounty Tiers 4-5",
        ]
    },
    "Adventurer Dawncrest": {
        "Source": [
            "Outdoor Events",
            "Normal Prey Hunts",
            "Delves Tiers 1-4",
        ]
    },
}
