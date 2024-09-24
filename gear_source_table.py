import pandas as pd
from data import gear_source_data, custom_track_colors, colors
import pandas as pd
import dataframe_image as dfi

# Define styles for the column headers
header_font = "Arial"
header_text_color = colors['Text']
header_background_color = colors['Base']
row_text_color = colors['Base']

# Create lists for the DataFrame
tracks = []
sources = []
required_crests = []

# Populate lists
for track, info in gear_source_data.items():
    tracks.append(track)
    # Join sources with line breaks
    source_str = "\n".join(info["Source"])
    sources.append(source_str)
    required_crests.append(info["Required Crest"])

# Create DataFrame
df = pd.DataFrame(
    {"Track": tracks, "Source": sources, "Required Crest": required_crests}
)


# Function to apply background color and text color based on 'Track'
def highlight_row(row):
    background_color = custom_track_colors.get(row["Track"], "#FFFFFF")
    return [
        f"background-color: {background_color}; color: {row_text_color}" for _ in row
    ]


# Apply styles to the DataFrame
styled_df = df.style.apply(highlight_row, axis=1)

# Remove the index (row numbers)
styled_df = styled_df.hide(axis="index")

# Left-align the column headers
styled_df = styled_df.set_table_styles(
    [
        {
            "selector": "th",
            "props": [
                ("text-align", "left"),
                ("font-family", header_font),
                ("color", header_text_color),
                ("background-color", header_background_color),
                ("border", "none"),
            ],
        },
        {
            "selector": "body",
            "props": [
                ("background-color", header_background_color),
                ("color", header_background_color),
            ],
        }
    ]
)

# Set CSS properties to handle line breaks
styled_df = styled_df.set_properties(
    **{
        "white-space": "pre-wrap",
        "text-align": "left",
        "vertical-align": "top",
        "border": "none",
    }
)

# Save the styled DataFrame as a PNG image
dfi.export(
    styled_df, 
    "gear_source_table.png", 
    dpi=600
    )
