import logging
import time
from wowapi.WoWapi import WoWAPI
from dotenv import load_dotenv
from pylog import get_logger
from pymongo import MongoClient
from tqdm import tqdm

# MongoDB connection setup
mongo_client = MongoClient("mongodb://localhost:27017")
db = mongo_client["wow"]
recipe_collection = db["recipes"]
item_collection = db["reagents"]
slot_type_cache_collection = db["slot_type_cache"]
category_cache_collection = db["category_cache"]

# New collection for missed items
missed_items_collection = db["missed_items"]

load_dotenv()

api_logger = get_logger(
    "wowapi.WoWapi",
    console=False,
    file=True,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="Item Scraper",
)

scraper_logger = get_logger(
    "scraper",
    console=False,
    file=True,
    mongo_uri="mongodb://localhost:27018",
    mongo_db_name="logs",
    mongo_collection_name="testing",
    log_level=logging.DEBUG,
    app_name="Item Scraper",
)

api = WoWAPI()

def rate_limit():
    time.sleep(0.1)  # Sleep for 100ms between API calls

def controlled_pause(message):
    # input(f"{message}  Press Enter to continue...")
    pass

def fetch_item_data(item_id):
    try:
        rate_limit()
        item_data = api.get_item_data(item_id)
        scraper_logger.debug(f"Item data retrieved for ID: {item_id}, Name: {item_data.get('name', 'Unknown')}")
        controlled_pause(f"Fetched item data for ID: {item_id}, Name: {item_data.get('name', 'Unknown')}")
        return item_data
    except Exception as e:
        scraper_logger.error(f"Error fetching item {item_id}: {str(e)}")
        controlled_pause(f"Error fetching item {item_id}: {str(e)}")
        return None

def process_recipes():
    scraper_logger.info("Starting to process recipes and fetch item data")

    recipes = list(recipe_collection.find({}))
    total_recipes = len(recipes)

    scraper_logger.info(f"Found {total_recipes} recipes to process")
    controlled_pause(f"Found {total_recipes} recipes to process")

    with tqdm(total=total_recipes, desc="Processing Recipes") as pbar:
        for recipe in recipes:
            recipe_name = recipe.get('name', 'Unknown Recipe')
            recipe_id = recipe.get('id', 'Unknown ID')
            scraper_logger.info(f"Processing recipe: {recipe_name} (ID: {recipe_id})")
            controlled_pause(f"Processing recipe: {recipe_name} (ID: {recipe_id})")

            # Process reagents
            if 'reagents' in recipe:
                scraper_logger.info(f"Processing {len(recipe['reagents'])} reagents for recipe: {recipe_name}")
                controlled_pause(f"Processing {len(recipe['reagents'])} reagents for recipe: {recipe_name}")
                for reagent in recipe['reagents']:
                    item_id = reagent['reagent'].get('id')
                    item_name = reagent['reagent'].get('name', 'Unknown Reagent')
                    if item_id:
                        scraper_logger.debug(f"Processing reagent: {item_name} (ID: {item_id})")
                        controlled_pause(f"Processing reagent: {item_name} (ID: {item_id})")
                        process_item(item_id)

            # Process modified crafting slots
            if 'modified_crafting_slots' in recipe:
                scraper_logger.info(f"Processing {len(recipe['modified_crafting_slots'])} modified crafting slots for recipe: {recipe_name}")
                controlled_pause(f"Processing {len(recipe['modified_crafting_slots'])} modified crafting slots for recipe: {recipe_name}")
                for slot in recipe['modified_crafting_slots']:
                    slot_type_id = slot['slot_type'].get('id')
                    slot_type_name = slot['slot_type'].get('name', 'Unknown Slot Type')
                    if slot_type_id:
                        scraper_logger.debug(f"Processing modified crafting slot: {slot_type_name} (ID: {slot_type_id})")
                        controlled_pause(f"Processing modified crafting slot: {slot_type_name} (ID: {slot_type_id})")
                        process_modified_crafting_slot(slot_type_id)

            pbar.update(1)

def process_item(item_id):
    existing_item = item_collection.find_one({'id': item_id})
    if existing_item:
        scraper_logger.info(f"Item {item_id} ({existing_item.get('name', 'Unknown')}) already exists in the database")
        controlled_pause(f"Item {item_id} ({existing_item.get('name', 'Unknown')}) already exists in the database")
    else:
        item_data = fetch_item_data(item_id)
        if item_data:
            item_collection.insert_one(item_data)
            scraper_logger.info(f"Inserted new item data for ID: {item_id}, Name: {item_data.get('name', 'Unknown')}")
            controlled_pause(f"Inserted new item data for ID: {item_id}, Name: {item_data.get('name', 'Unknown')}")

def process_modified_crafting_slot(slot_type_id):
    cached_slot_type = slot_type_cache_collection.find_one({'id': slot_type_id})
    if cached_slot_type:
        scraper_logger.debug(f"Using cached data for slot type ID: {slot_type_id}, Description: {cached_slot_type['data'].get('description', 'Unknown')}")
        controlled_pause(f"Using cached data for slot type ID: {slot_type_id}, Description: {cached_slot_type['data'].get('description', 'Unknown')}")
        slot_type_data = cached_slot_type['data']
    else:
        try:
            rate_limit()
            slot_type_data = api.get_modified_crafting_reagent_slot_type(slot_type_id)
            scraper_logger.debug(f"Slot type data retrieved for ID: {slot_type_id}, Description: {slot_type_data.get('description', 'Unknown')}")
            controlled_pause(f"Slot type data retrieved for ID: {slot_type_id}, Description: {slot_type_data.get('description', 'Unknown')}")
            slot_type_cache_collection.insert_one({'id': slot_type_id, 'data': slot_type_data})
        except Exception as e:
            scraper_logger.error(f"Error processing modified crafting slot {slot_type_id}: {str(e)}")
            controlled_pause(f"Error processing modified crafting slot {slot_type_id}: {str(e)}")
            return

    slot_type_name = slot_type_data.get('description', '')

    if 'compatible_categories' in slot_type_data:
        scraper_logger.info(f"Processing {len(slot_type_data['compatible_categories'])} compatible categories for slot type: {slot_type_name}")
        controlled_pause(f"Processing {len(slot_type_data['compatible_categories'])} compatible categories for slot type: {slot_type_name}")
        for category in slot_type_data['compatible_categories']:
            category_id = category.get('id')
            category_name = category.get('name', 'Unknown Category')
            if category_id:
                process_modified_crafting_category(category_id, category_name, slot_type_name)

def process_modified_crafting_category(category_id, category_name, slot_type_name):
    # Check if the category is already marked as missed
    if missed_items_collection.find_one({'category_id': category_id}):
        scraper_logger.info(f"Skipping category {category_id} as it is marked as missed.")
        return

    scraper_logger.debug(f"Processing category: {category_name} (ID: {category_id}) for slot type: {slot_type_name}")
    controlled_pause(f"Processing category: {category_name} (ID: {category_id}) for slot type: {slot_type_name}")

    # Check if we have any items with this category in our database
    existing_item_count = item_collection.count_documents({
        'modified_crafting.category.id': category_id
    })

    if existing_item_count > 0:
        scraper_logger.info(f"Found {existing_item_count} items in database for category {category_id}. Skipping API search.")
        controlled_pause(f"Found {existing_item_count} items in database for category {category_id}. Skipping API search.")
        return  # Skip further processing for this category

    scraper_logger.info(f"No items found in database for category {category_id}. Searching via API for slot type: {slot_type_name}")
    controlled_pause(f"No items found in database for category {category_id}. Searching via API for slot type: {slot_type_name}")

    # If no items found in our database, then search using the API
    rate_limit()
    search_results = api.search_items(slot_type_name)
    items_to_process = []

    if 'results' in search_results:
        # Filter the search results to only include items matching the category
        items_to_process = [
            item['data'] for item in search_results['results']
            if item['data'].get('modified_crafting', {}).get('category', {}).get('id') == category_id
        ]
        scraper_logger.info(f"Found {len(items_to_process)} items matching category {category_id} out of {len(search_results['results'])} search results")
        controlled_pause(f"Found {len(items_to_process)} items matching category {category_id} out of {len(search_results['results'])} search results")

    # If no items found with slot_type_name, try searching with category_name
    if not items_to_process:
        scraper_logger.info(f"No items found for slot type: {slot_type_name}. Trying search with category name: {category_name}")
        controlled_pause(f"No items found for slot type: {slot_type_name}. Trying search with category name: {category_name}")
        rate_limit()
        search_results = api.search_items(category_name)
        if 'results' in search_results:
            items_to_process = [
                item['data'] for item in search_results['results']
                if item['data'].get('modified_crafting', {}).get('category', {}).get('id') == category_id
            ]
            scraper_logger.info(f"Found {len(items_to_process)} items matching category {category_id} out of {len(search_results['results'])} search results using category name")
            controlled_pause(f"Found {len(items_to_process)} items matching category {category_id} out of {len(search_results['results'])} search results using category name")

    if not items_to_process:
        # Log the missing category
        scraper_logger.error(f"No items found for category {category_id}. Logging as missed.")
        missed_items_collection.insert_one({'category_id': category_id, 'category_name': category_name, 'slot_type_name': slot_type_name})
        return

    total_items = len(items_to_process)
    scraper_logger.info(f"Processing {total_items} items for category {category_id}, slot type: {slot_type_name}")
    controlled_pause(f"Processing {total_items} items for category {category_id}, slot type: {slot_type_name}")
    with tqdm(total=total_items, desc=f"Processing Items in {slot_type_name}", leave=False) as pbar:
        for item in items_to_process:
            item_id = item.get('id')
            item_name = item.get('name', {})
            if isinstance(item_name, dict):
                item_name = item_name.get('en_US', 'Unknown Item')
            elif isinstance(item_name, str):
                item_name = item_name
            else:
                item_name = 'Unknown Item'

            if item_id:
                existing_item = item_collection.find_one({'id': item_id})
                if existing_item:
                    scraper_logger.debug(f"Item {item_id} ({item_name}) already exists in the database")
                    controlled_pause(f"Item {item_id} ({item_name}) already exists in the database")
                else:
                    scraper_logger.debug(f"Processing item: {item_name} (ID: {item_id})")
                    controlled_pause(f"Processing item: {item_name} (ID: {item_id})")
                    process_item(item_id)
            pbar.update(1)

    scraper_logger.info(f"Processed modified crafting category: {category_id} (Slot Type: {slot_type_name}, Category Name: {category_name})")
    controlled_pause(f"Processed modified crafting category: {category_id} (Slot Type: {slot_type_name}, Category Name: {category_name})")

if __name__ == "__main__":
    process_recipes()
