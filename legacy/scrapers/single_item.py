import logging
from wowapi.WoWapi import WoWAPI
from pymongo import MongoClient
from dotenv import load_dotenv
from pylog import get_logger

# Load environment variables
load_dotenv()

# MongoDB connection setup
mongo_client = MongoClient("mongodb://localhost:27017")
db = mongo_client["wow"]
item_collection = db["items"]

# Logger setup
logger = get_logger(
    "single_item",
    console=True,
    file=False,
    log_level=logging.INFO,
    app_name="Single Item Adder",
)

# Initialize WoWAPI
api = WoWAPI()

def search_and_add_item(item_name):
    try:
        # Search for items by name
        search_results = api.search_items(item_name)
        if 'results' not in search_results or not search_results['results']:
            logger.info("No items found for the given name.")
            return

        # Display top 10 results
        top_results = search_results['results'][:10]
        for idx, item in enumerate(top_results, start=1):
            item_data = item['data']
            item_id = item_data.get('id')
            item_name = item_data.get('name', {}).get('en_US', 'Unknown Item')
            logger.info(f"{idx}. {item_name} (ID: {item_id})")

        # Prompt user to select an item
        choice = int(input("Enter the number of the item you want to add to the database (1-10): "))
        if 1 <= choice <= len(top_results):
            selected_item = top_results[choice - 1]['data']
            item_id = selected_item.get('id')
            existing_item = item_collection.find_one({'id': item_id})
            if existing_item:
                logger.info(f"Item {item_id} ({selected_item.get('name', {}).get('en_US', 'Unknown')}) already exists in the database.")
            else:
                item_collection.insert_one(selected_item)
                logger.info(f"Inserted item {item_id} ({selected_item.get('name', {}).get('en_US', 'Unknown')}) into the database.")
        else:
            logger.info("Invalid choice. Please run the script again and select a valid option.")
    except Exception as e:
        logger.error(f"An error occurred: {str(e)}")

if __name__ == "__main__":
    item_name = input("Enter the name of the item you want to search for: ")
    search_and_add_item(item_name)
