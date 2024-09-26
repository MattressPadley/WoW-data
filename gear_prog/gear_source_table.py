import pandas as pd
import matplotlib.pyplot as plt
from data import gear_source_data, custom_track_colors, colors


# Define styles for the column headers
header_font = "Ubuntu Nerd Font"
header_text_color = colors["Text"]
header_background_color = colors["Base"]
row_text_color = colors["Base"]

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

# Adjust the figure width accordingly
fig, ax = plt.subplots(figsize=(5, 6))
ax.axis("off")

# Create table with adjusted bounding box to fit the table snugly
table = ax.table(
    cellText=df.values,
    colLabels=df.columns,
    cellLoc="left",
    loc="left",
    bbox=[0, 0, 1, 1],  # Adjusts the table to fill the axes
)

# Set font sizes
table.auto_set_font_size(False)
table.set_fontsize(9)
table.auto_set_column_width([0,1,2,3])

# Get max number of lines in any cell per row to adjust row heights
max_lines_per_row = []
for index, row in df.iterrows():
    max_lines = max(len(str(cell).split("\n")) for cell in row)
    max_lines_per_row.append(max_lines)

# Set cell properties
for (row, col), cell in table.get_celld().items():
    # Remove extra padding 
    cell.PAD = 0.05
    if row == 0:
        # Header row
        cell.set_height(0.1)
        cell.set_text_props(
            fontfamily=header_font,
            fontsize=12,
            color=header_text_color,
            weight="bold",
            ha="left",
            va="center",
        )
        cell.set_facecolor(header_background_color)
        cell.set_edgecolor("none")
    else:
        max_lines = max_lines_per_row[row - 1]
        ch = 0.05 * max_lines
        cell.set_height(ch)
        cell.set_text_props(
            fontfamily=header_font,
            color=row_text_color,
            ha="left",
            va="center",
        )
        # Get the track name for this row
        track_name = df.iloc[row - 1]["Track"]
        # Set background color based on track
        background_color = custom_track_colors.get(track_name, "#FFFFFF")
        cell.set_facecolor(background_color)
        cell.set_edgecolor("none")


# Remove any white border or extra space around the table
plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

# Save the figure without any padding
plt.savefig("img/gear_source_table.png", dpi=600, bbox_inches="tight", pad_inches=0)
plt.close()
