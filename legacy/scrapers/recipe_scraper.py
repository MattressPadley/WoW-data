import logging
import json
from pymongo import MongoClient
from wowapi.WoWapi import WoWAPI
from dotenv import load_dotenv
from pylog import get_logger

load_dotenv()

# MongoDB connection setup
mongo_client = MongoClient("mongodb://localhost:27017")
db = mongo_client["wow"]
recipe_collection = db["recipes"]
profession_collection = db["professions"]

api = WoWAPI()

scraper_logger = get_logger(
    "scraper",
    console=True,
    file=False,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="Recipe Scraper",
)

api_logger = get_logger(
    "wowapi.WoWapi",
    console=False,
    file=False,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="Recipe Scraper",
)

def fetch_recipes():
    scraper_logger.info("Fetching profession data from MongoDB")
    professions = list(profession_collection.find({}))
    scraper_logger.info(f"Found {len(professions)} professions")

    for profession in professions:
        profession_name = profession.get('name', 'Unknown Profession')
        scraper_logger.info(f"Processing profession: {profession_name}")

        for category in profession.get('categories', []):
            category_name = category.get('name', 'Unknown Category')
            scraper_logger.info(f"Processing category: {category_name}")

            for recipe in category.get('recipes', []):
                recipe_id = recipe.get('id')
                if recipe_id:
                    scraper_logger.info(f"Fetching recipe: {recipe.get('name', 'Unknown Recipe')} (ID: {recipe_id})")
                    try:
                        recipe_data = api.get_recipe(recipe_id)
                        scraper_logger.debug(f"Recipe data retrieved for ID: {recipe_id}")

                        # Add profession and category information to the recipe data
                        recipe_data['profession'] = profession_name
                        recipe_data['category'] = category_name

                        result = recipe_collection.insert_one(recipe_data)
                        scraper_logger.info(f"Inserted new recipe data for ID: {recipe_id}")
                    except Exception as e:
                        scraper_logger.error(f"Error fetching or storing recipe {recipe_id}: {str(e)}")
                else:
                    scraper_logger.warning(f"No recipe ID found for recipe in category {category_name}")

    scraper_logger.info("Finished fetching and storing recipe data")

if __name__ == "__main__":
    fetch_recipes()
