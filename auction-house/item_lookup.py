import os
import requests
from dotenv import load_dotenv
from pymongo import MongoClient
from prettytable import PrettyTable

load_dotenv()

class BlizzardAPI:
    def __init__(self, region="us"):
        self.access_token = self._get_access_token()
        self.region = region

    def _get_access_token(self):
        token = os.getenv("BNET_ACCESS_TOKEN")
        if not token:
            raise Exception("Blizzard API access token not found in environment variables.")
        return token

    def get_item_data(self, item_id):
        url = f"https://{self.region}.api.blizzard.com/data/wow/item/{item_id}"
        params = {
            "namespace": "static-us",
            "locale": "en_US",
            "access_token": self.access_token,
        }
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def get_item_media(self, item_id):
        url = f"https://{self.region}.api.blizzard.com/data/wow/media/item/{item_id}"
        params = {
            "namespace": "static-us",
            "locale": "en_US",
            "access_token": self.access_token,
        }
        response = requests.get(url, params=params)
        response.raise_for_status()
        return response.json()

    def search_item_by_name(self, item_name, page=1):
        url = f"https://{self.region}.api.blizzard.com/data/wow/search/item"
        params = {
            "namespace": "static-us",
            "name.en_US": item_name,
            "orderby": "name",
            "_pageSize": 50,
            "_page": page,
            "access_token": self.access_token,
        }
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        if data["results"]:
            return data["results"]
        else:
            raise Exception("Item not found.")

class AuctionDatabase:
    def __init__(self):
        self.client = self._get_mongo_client()
        self.db = self.client["wow"]
        self.item_collection = self.db["item_data"]
        self.commodities_collection = self.db["commodities"]
        self.media_collection = self.db["item_media"]

    def _get_mongo_client(self):
        mongo_uri = os.getenv("MONGODB_URI")
        if not mongo_uri:
            raise Exception("MongoDB URI not found in environment variables.")
        return MongoClient(mongo_uri)

    def check_item_in_db(self, item_id):
        return self.item_collection.find_one({"id": item_id})

    def insert_item_to_db(self, collection, item_data):
        collection.insert_one(item_data)

    def fetch_auctions(self, item_id):
        auctions_cursor = self.commodities_collection.find({"item.id": item_id})
        return list(auctions_cursor)

class AuctionDisplay:
    @staticmethod
    def parse_gold(copper):
        gold = copper // 10000
        silver = (copper % 10000) // 100
        copper = copper % 100
        return gold, silver, copper

    @staticmethod
    def display_items(items):
        for idx, item in enumerate(items, start=1):
            print(f"{idx}. {item['data']['name']['en_US']} (ID: {item['data']['id']})")

    @staticmethod
    def get_user_selection(items):
        try:
            selected_index = int(input("Select the item number: ")) - 1
            if 0 <= selected_index < len(items):
                return items[selected_index]
            else:
                raise ValueError("Invalid selection.")
        except ValueError as e:
            raise ValueError("Invalid input. Please enter a number.") from e

    @staticmethod
    def display_auctions(auctions):
        if not auctions:
            print("No auctions found for this item.")
            return
        sorted_auctions = sorted(auctions, key=lambda x: x["unit_price"])
        table = PrettyTable()
        table.field_names = ["Quantity", "Unit Price"]
        for auction in sorted_auctions:
            gold, silver, copper = AuctionDisplay.parse_gold(auction["unit_price"])
            table.add_row([auction["quantity"], f"{gold}g {silver}s {copper}c"])
        print(table)

# Remove the main() function
