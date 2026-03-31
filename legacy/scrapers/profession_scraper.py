import logging
from pymongo import MongoClient

# MongoDB connection setup
mongo_client = MongoClient("mongodb://localhost:27017")
db = mongo_client["wow"]
profession_collection = db["professions"]
recipe_collection = db["recipes"]

from wowapi.WoWapi import WoWAPI
from dotenv import load_dotenv
from pylog import get_logger

load_dotenv()

api_logger = get_logger(
    "wowapi.WoWapi",
    console=False,
    file=False,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="Scraper",
)

scraper_logger = get_logger(
    "scraper",
    console=True,
    file=False,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="Scraper",
)

api = WoWAPI()

scraper_logger.info("Fetching profession index")
try:
    profession_index = api.get_professions_index()
    scraper_logger.debug(f"Profession index retrieved")
except Exception as e:
    scraper_logger.error(f"Error fetching profession index: {str(e)}")

# Extract profession IDs from the profession index
profession_ids = [profession['id'] for profession in profession_index['professions']]

scraper_logger.info(f"Extracted {len(profession_ids)} profession IDs")
scraper_logger.debug(f"Profession IDs: {profession_ids}")

# Dictionary to store profession IDs and their Khaz Algar skill tier IDs
profession_skill_tiers = {}

for profession_id in profession_ids:
    scraper_logger.info(f"Fetching details for profession ID: {profession_id}")
    try:
        profession_details = api.get_profession(profession_id)
        scraper_logger.debug(f"Details retrieved for profession ID: {profession_id}")

        # Look for the Khaz Algar skill tier
        khaz_algar_tier = next((tier for tier in profession_details.get('skill_tiers', [])
                                if 'Khaz Algar' in tier['name']), None)

        if khaz_algar_tier:
            profession_skill_tiers[profession_id] = khaz_algar_tier['id']
            scraper_logger.info(f"Khaz Algar skill tier ID for profession {profession_id}: {khaz_algar_tier['id']}")
        else:
            scraper_logger.warning(f"No Khaz Algar skill tier found for profession {profession_id}")

    except Exception as e:
        scraper_logger.error(f"Error fetching details for profession {profession_id}: {str(e)}")

scraper_logger.info(f"Collected Khaz Algar skill tier IDs for {len(profession_skill_tiers)} professions")
scraper_logger.debug(f"Profession Khaz Algar skill tiers: {profession_skill_tiers}")

for profession_id, skill_tier_id in profession_skill_tiers.items():
    scraper_logger.info(f"Fetching skill tier {skill_tier_id} for profession {profession_id}")
    try:
        skill_tier_data = api.get_profession_skill_tier(profession_id, skill_tier_id)
        scraper_logger.debug(f"Skill tier data retrieved for profession {profession_id}")

        result = profession_collection.insert_one(skill_tier_data)
        scraper_logger.info(f"Inserted new skill tier data for profession {profession_id}")

    except Exception as e:
        scraper_logger.error(f"Error fetching or storing skill tier {skill_tier_id} for profession {profession_id}: {str(e)}")

scraper_logger.info("Finished fetching and storing skill tier data")
