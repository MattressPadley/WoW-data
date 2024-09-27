import os
import sys
import requests
from dotenv import load_dotenv
from pymongo import MongoClient
from prettytable import PrettyTable

load_dotenv()


def get_mongo_client():
    """Create and return a MongoDB client."""
    mongo_uri = os.getenv("MONGODB_URI")
    if not mongo_uri:
        raise Exception("MongoDB URI not found in environment variables.")
    return MongoClient(mongo_uri)


def get_access_token():
    """Retrieve the Blizzard API access token from environment variables."""
    token = os.getenv("BNET_ACCESS_TOKEN")
    if not token:
        raise Exception("Blizzard API access token not found in environment variables.")
    return token


def get_item_data(access_token, region, item_id):
    """Fetch item data from the Blizzard API."""
    url = f"https://{region}.api.blizzard.com/data/wow/item/{item_id}"
    params = {
        "namespace": "static-us",
        "locale": "en_US",
        "access_token": access_token,
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    return response.json()

def get_item_media(access_token, region, item_id):
    """Fetch item media data from the Blizzard API."""
    url = f"https://{region}.api.blizzard.com/data/wow/media/item/{item_id}"
    params = {
        "namespace": "static-us",
        "locale": "en_US",
        "access_token": access_token,
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    return response.json()

def search_item_by_name(access_token, region, item_name, page=1):
    """Search for items by name using the Blizzard API."""
    url = f"https://{region}.api.blizzard.com/data/wow/search/item"
    params = {
        "namespace": "static-us",
        "name.en_US": item_name,
        "orderby": "name",
        "_pageSize": 50,
        "_page": page,
        "access_token": access_token,
    }
    response = requests.get(url, params=params)
    response.raise_for_status()
    data = response.json()
    if data["results"]:
        return data["results"]
    else:
        raise Exception("Item not found.")


def check_item_in_db(collection, item_id):
    """Check if an item exists in the database."""
    return collection.find_one({"id": item_id})


def insert_item_to_db(collection, item_data):
    """Insert item data into the database."""
    collection.insert_one(item_data)


def parse_gold(copper):
    """Convert copper value to gold, silver, and copper."""
    gold = copper // 10000
    silver = (copper % 10000) // 100
    copper = copper % 100
    return gold, silver, copper


def display_items(items):
    """Display a list of items for the user to select."""
    for idx, item in enumerate(items, start=1):
        print(f"{idx}. {item['data']['name']['en_US']} (ID: {item['data']['id']})")


def get_user_selection(items):
    """Prompt the user to select an item from the list."""
    try:
        selected_index = int(input("Select the item number: ")) - 1
        if 0 <= selected_index < len(items):
            return items[selected_index]
        else:
            print("Invalid selection.")
            sys.exit(1)
    except ValueError:
        print("Invalid input. Please enter a number.")
        sys.exit(1)


def fetch_auctions(collection, item_id):
    """Fetch auctions for a given item ID from the database."""
    auctions_cursor = collection.find({"item.id": item_id})
    return list(auctions_cursor)


def display_auctions(auctions):
    """Display auctions in a table format."""
    if not auctions:
        print("No auctions found for this item.")
        return
    sorted_auctions = sorted(auctions, key=lambda x: x["unit_price"])
    table = PrettyTable()
    table.field_names = ["Quantity", "Unit Price"]
    for auction in sorted_auctions:
        gold, silver, copper = parse_gold(auction["unit_price"])
        table.add_row([auction["quantity"], f"{gold}g {silver}s {copper}c"])
    print(table)


def main():
    try:
        access_token = get_access_token()
        region = "us"

        input_item = input("Enter the item name to search: ")
        items = search_item_by_name(access_token, region, input_item)

        display_items(items)
        selected_item = get_user_selection(items)
        item_id = selected_item["data"]["id"]

        # Initialize MongoDB client and collections
        client = get_mongo_client()
        db = client["wow"]
        item_collection = db["item_data"]
        commodities_collection = db["commodities"]
        media_collection = db["item_media"]

        # Check if the item is already in the database
        if not check_item_in_db(item_collection, item_id):
            item_data = get_item_data(access_token, region, item_id)
            insert_item_to_db(item_collection, item_data)
            item_media = get_item_media(access_token, region, item_id)
            insert_item_to_db(media_collection, item_media)

            print("Item data added to the database.")
        else:
            print("Item data already exists in the database.")

        auctions = fetch_auctions(commodities_collection, item_id)
        display_auctions(auctions)

    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
