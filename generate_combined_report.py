from PIL import Image
from data import colors


def pad_image_to_height(image, target_height, background_color=(255, 255, 255)):
    """
    Pads an image to the target height with the specified background color, centering the image vertically.

    :param image: PIL Image object to be padded.
    :param target_height: The desired height after padding.
    :param background_color: Tuple specifying the RGB background color.
    :return: Padded PIL Image object.
    """
    new_width = image.width
    new_image = Image.new("RGB", (new_width, target_height), background_color)
    y_offset = (target_height - image.height) // 2
    new_image.paste(image, (0, y_offset))
    return new_image


def combine_images(
    image1_path,
    image2_path,
    output_path,
    orientation="horizontal",
    background_color=(255, 255, 255),
):
    """
    Combines two images either vertically or horizontally, with center alignment and customizable background color.

    :param image1_path: Path to the first image.
    :param image2_path: Path to the second image.
    :param output_path: Path where the combined image will be saved.
    :param orientation: 'vertical' or 'horizontal' orientation.
    :param background_color: Tuple specifying the RGB background color.
    """
    # Open the images
    image1 = Image.open(image1_path)
    image2 = Image.open(image2_path)

    # Convert images to the same mode if necessary
    if image1.mode != image2.mode:
        image2 = image2.convert(image1.mode)

    if orientation == "horizontal":
        # Calculate the maximum height
        max_height = max(image1.height, image2.height)

        # Pad images to have the same height and center them vertically
        image1_padded = pad_image_to_height(image1, max_height, background_color)
        image2_padded = pad_image_to_height(image2, max_height, background_color)

        # Calculate the total width
        total_width = image1_padded.width + image2_padded.width

        # Create a new image with the combined size
        new_image = Image.new(image1.mode, (total_width, max_height), background_color)

        # Paste images side by side
        new_image.paste(image1_padded, (0, 0))
        new_image.paste(image2_padded, (image1_padded.width, 0))

    elif orientation == "vertical":
        # Calculate the maximum width
        max_width = max(image1.width, image2.width)

        # Pad images to have the same width and center them horizontally
        image1_padded = pad_image_to_width(image1, max_width, background_color)
        image2_padded = pad_image_to_width(image2, max_width, background_color)

        # Calculate the total height
        total_height = image1_padded.height + image2_padded.height

        # Create a new image with the combined size
        new_image = Image.new(image1.mode, (max_width, total_height), background_color)

        # Paste images one below the other
        new_image.paste(image1_padded, (0, 0))
        new_image.paste(image2_padded, (0, image1_padded.height))

    else:
        raise ValueError("Orientation must be 'vertical' or 'horizontal'")

    # Save the combined image
    new_image.save(output_path)
    print(f"Combined image saved to {output_path}")


def pad_image_to_width(image, target_width, background_color=(255, 255, 255)):
    """
    Pads an image to the target width with the specified background color, centering the image horizontally.

    :param image: PIL Image object to be padded.
    :param target_width: The desired width after padding.
    :param background_color: Tuple specifying the RGB background color.
    :return: Padded PIL Image object.
    """
    new_height = image.height
    new_image = Image.new("RGB", (target_width, new_height), background_color)
    x_offset = (target_width - image.width) // 2
    new_image.paste(image, (x_offset, 0))
    return new_image


# Example usage
if __name__ == '__main__':
    combine_images(
        "gear_upgrade_chart.png",
        "gear_source_table.png",
        "combined_report.png",
        orientation="horizontal",
        background_color=colors["Base"],
    )
