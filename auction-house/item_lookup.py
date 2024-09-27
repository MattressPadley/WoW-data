import os
import json
import requests
from dotenv import load_dotenv
from pymongo import MongoClient
from prettytable import PrettyTable

load_dotenv()


def get_item_data(access_token, region, item_id):
    url = f"https://{region}.api.blizzard.com/data/wow/item/{item_id}"
    params = {
        "namespace": "static-us",
        "locale": "en_US",  # You can change this to any other supported locale
        "access_token": access_token,
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"API request failed: {response.status_code}, {response.text}")


def search_item_by_name(access_token, region, item_name, page=1):
    url = f"https://{region}.api.blizzard.com/data/wow/search/item"
    params = {
        "access_token": access_token,
        "namespace": "static-us",
        "name.en_US": item_name,
        "orderby": "name",
        "_pageSize": 10,
        "_page": page,
    }

    response = requests.get(url, params=params)

    if response.status_code == 200:
        data = response.json()
        if data["results"]:
            return data["results"]
        else:
            raise Exception("Item not found")
    else:
        raise Exception(f"API request failed: {response.status_code}, {response.text}")

def check_item_db(item_id):
    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client.get_database("wow")
    collection = db.get_collection("item_data")
    item = collection.find_one({"id": item_id})
    return item

def parse_gold(copper):
    gold = copper // 10000
    silver = (copper % 10000) // 100
    copper = copper % 100
    return gold, silver, copper

if __name__ == "__main__":

    token = os.getenv("BNET_ACCESS_TOKEN")
    input_item = input("Enter the item name to search: ")
    items = search_item_by_name(token, "us", input_item)

    # Remove the unnecessary outer loop
    for idx, item in enumerate(items, start=1):
        print(f"{idx}. {item['data']['name']['en_US']}")

    selected_index = int(input("Select the item number: ")) - 1

    if 0 <= selected_index < len(items):
        selected_item = items[selected_index]
    else:
        print("Invalid selection")
        exit()

    item_id = selected_item["data"]["id"]

    # Check if the item is already in the database
    if not check_item_db(item_id):
        item_data = get_item_data(token, "us", item_id)
        client = MongoClient(os.getenv("MONGODB_URI"))
        db = client.get_database("wow")
        collection = db.get_collection("item_data")
        collection.insert_one(item_data)
        print("Item data added to the database.")
    else:
        print("Item data already exists in the database.")

    client = MongoClient(os.getenv("MONGODB_URI"))
    db = client.get_database("wow")
    collection = db.get_collection("commodities")

    # Convert the cursor to a list
    auctions_cursor = collection.find({"item.id": item_id})
    auctions = list(auctions_cursor)

    # Sort auctions by unit_price in descending order
    sorted_auctions = sorted(auctions, key=lambda x: x['unit_price'], reverse=False)

    # Create a PrettyTable object
    table = PrettyTable()
    table.field_names = ["Quantity", "Unit Price"]

    # Add rows to the table
    for auction in sorted_auctions:
        parsed_price = parse_gold(auction["unit_price"])
        table.add_row([
                       auction["quantity"], 
                        f"{parsed_price[0]}g {parsed_price[1]}s {parsed_price[2]}c"])

    # Print the table
    print(table)
