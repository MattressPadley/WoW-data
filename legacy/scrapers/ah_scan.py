from wowapi import WoWAPI
from pymongo import MongoClient
from pylog import get_logger
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    # Initialize logger
    logger = get_logger("auction_scanner",
                        local_mongo_uri="mongodb://localhost:27017",
                        local_db_name="wow",
                        local_collection_name="logs"
                        )

    try:
        api = WoWAPI()

        # Fetch WoW AH data
        commodities_data = api.get_ah_commodities_data()

        # Connect to MongoDB
        client = MongoClient("mongodb://localhost:27017")
        db = client.get_database("wow")
        collection = db.get_collection("commodities")

        existing_ids = set(collection.distinct("id"))
        new_auctions = [auction for auction in commodities_data["auctions"] if auction["id"] not in existing_ids]

        if new_auctions:
            ts_data = [WoWAPI.add_timestamp(auction) for auction in new_auctions]
            collection.insert_many(ts_data)
            logger.info(f"Added {len(ts_data)} new auctions to the database.")
        else:
            logger.info("No new auctions to add.")

    except Exception as e:
        logger.error(f"Error: {str(e)}")
