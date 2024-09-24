import matplotlib.pyplot as plt
import pandas as pd
from data import gear_score_data, custom_track_colors, colors

# Set default font and background colors
plt.rcParams["text.color"] = colors['Text']  # Set default font color
plt.rcParams["axes.facecolor"] = colors['Mantle']  # Set default background color for axes
plt.rcParams["figure.facecolor"] = colors['Base']  # Set default background color for figure
plt.rcParams["axes.edgecolor"] = colors['Text']  # Set default edge color for axes
plt.rcParams['xtick.color'] = colors['Text']  # Set default color for x-ticks
plt.rcParams['ytick.color'] = colors['Text']  # Set default color for y-ticks

# Convert the dictionary to a DataFrame
df_ordered = pd.DataFrame(gear_score_data).T.reset_index()
df_ordered.columns = ['Track', 'Starting Item Level', 'Max Item Level']

# Sort the DataFrame by the 'Starting Item Level' in ascending order and reset the index
df_ordered = df_ordered.sort_values(by='Starting Item Level').reset_index(drop=True)


# Plotting the chart with matching colors
fig, ax = plt.subplots(figsize=(6, 4))
for i, row in df_ordered.iterrows():
    color = custom_track_colors.get(row['Track'], '#000000')  # Use black as default
    ax.plot(
        [row['Starting Item Level'], row['Max Item Level']],
        [i, i],
        marker='o',
        color=color,
        label=row['Track'],
    )

# Re-apply the sorted labels and titles
ax.set_yticks(range(len(df_ordered)))
ax.set_yticklabels(df_ordered['Track'],
                   fontsize=9,
                   color=colors['Text'])
ax.set_xlabel('Item Level',
               fontsize=10, 
               color=colors['Text'])

ax.set_xlim(left=540, right=650)

# Add dotted vertical grid lines
ax.yaxis.grid(True, linestyle=":", linewidth=0.5, color=colors["Text"])


# Adding the low and high item level text only at the ends of each line
for i, row in df_ordered.iterrows():
    ax.text(
        row['Starting Item Level'] - 8,
        i,
        f"{row['Starting Item Level']}",
        va='center',
        fontsize=9,
        color=colors['Text'],
    )
    ax.text(
        row['Max Item Level'] + 2,
        i,
        f"{row['Max Item Level']}",
        va='center',
        fontsize=9,
        color=colors['Text'],
    )

# Save the chart as an image
plt.tight_layout()
plt.savefig("img/gear_upgrade_chart.png", dpi=600)
plt.close()
