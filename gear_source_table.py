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

# Calculate maximum character length in each column
max_char_per_col = []
for col in df.columns:
    max_len = (
        df[col].apply(lambda x: max([len(line) for line in str(x).split("\n")])).max()
    )
    max_char_per_col.append(max_len)

# Set proportional column widths based on max character lengths
total_chars = sum(max_char_per_col)
col_widths = [max_len / total_chars for max_len in max_char_per_col]

# Adjust the figure width accordingly
fig_width = total_chars * 0.09  # Adjust the multiplier as needed
fig_height = len(df) * 0.5
fig, ax = plt.subplots(figsize=(fig_width, fig_height))
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
table.set_fontsize(10)

# Adjust column widths
for i, width in enumerate(col_widths):
    for key, cell in table.get_celld().items():
        if key[1] == i:
            cell.set_width(width)

# Get max number of lines in any cell per row to adjust row heights
max_lines_per_row = []
for index, row in df.iterrows():
    max_lines = max(len(str(cell).split("\n")) for cell in row)
    max_lines_per_row.append(max_lines)

# Set cell properties
for (row, col), cell in table.get_celld().items():
    # Remove extra padding
    cell.PAD = 0.1
    if row == 0:
        # Header row
        cell.set_text_props(
            fontfamily=header_font,
            color=header_text_color,
            weight="bold",
            ha="left",
            va="center",
            linespacing=1,
        )
        cell.set_facecolor(header_background_color)
        cell.set_edgecolor("none")
    else:
        # Data cells
        cell.set_text_props(
            fontfamily=header_font,
            color=row_text_color,
            ha="left",
            va="top",
            linespacing=1,
        )
        # Get the track name for this row
        track_name = df.iloc[row - 1]["Track"]
        # Set background color based on track
        background_color = custom_track_colors.get(track_name, "#FFFFFF")
        cell.set_facecolor(background_color)
        cell.set_edgecolor("none")
        # Adjust row height based on content
        max_lines = max_lines_per_row[row - 1]
        # Adjust the height per line; tweak the multiplier if necessary
        # cell.set_height(0.05 * max_lines + 0.05)

# Remove any white border or extra space around the table
plt.subplots_adjust(left=0, right=1, top=1, bottom=0)

# Save the figure without any padding
plt.savefig("gear_source_table.png", dpi=600, bbox_inches="tight", pad_inches=0)
plt.close()
