import { hashSHA256 }   from "./hashUtilities.js";
import { CategoryUrls } from "./models/categoryUrls.js";
import { PlaceUrls }    from "./models/placeUrls.js";
import { hasOption }    from "./arguments.js";

const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(
    'app_db',
    'root',
    'root',
    {
        host   : 'localhost',
        port: '3307',
        dialect: 'mysql',
        logging: hasOption('verbose') || hasOption('v') ? console.log : false,
    }
);

const categoryUrls = CategoryUrls(sequelize, DataTypes);
const placeUrls = PlaceUrls(sequelize, DataTypes);

/**
 * Responsible to initialize the Database.
 *
 * @returns {Promise<void>}
 */
export async function initializeDatabase() {
    try {
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        // Synchronize all defined models to the database
        await sequelize.sync();
        console.log("All models were synchronized successfully.");
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

/**
 * Responsible to truncate the category URLs table.
 *
 * @returns {Promise<void>}
 */
export async function truncateCategoryUrls() {
    await categoryUrls.destroy(
        {
            truncate: true
        }
    );
}

/**
 * Responsible to insert a new records in the Category URLs table if not exists yet.
 *
 * @param {string} url The URL to insert
 * @param {string} area The area name
 * @param {string} category The category name
 * @param {number} lat The lat of the URL
 * @param {number} lng The lng of the URL
 * @param {boolean} scrapped If the URL is already scrapped or not. Default false.
 * @returns {Promise<void>}
 */
export async function insertCategoryUrlIfNotExists({ url, area, category, lat, lng, scrapped = false }) {
    const hash = hashSHA256(url);
    const defaults = {
        hash,
        url,
        area,
        category,
        lat,
        lng,
        scrapped
    };

    try {
        const [ instance, created ] = await categoryUrls.findOrCreate(
            {
                where: {
                    hash
                },
                defaults
            }
        );

        if (!created) {
            console.log('Search URL record already exists.');
        }
    } catch (error) {
        console.error('Error inserting search URL:', error, JSON.stringify(defaults));
        process.exit();
    }
}

/**
 * Get a random record from the Category URLs table that isn't scrapped yet.
 *
 * @returns {Promise<*|null>}
 */
export async function getRandomEntryThatIsNotScrapped() {
    const entry = await categoryUrls.findOne(
        {
            where: {
                scrapped: false
            },
            order: sequelize.random()
        }
    );
    return entry?.dataValues || null; // Return null if no entry is found
}

/**
 * Responsible to insert a new records in the Place URLs table if not exists yet.
 *
 * @param {string} url The URL to insert
 * @param {string} area The area name
 * @param {string} category The category name
 * @param {number} lat The lat of the URL
 * @param {number} lng The lng of the URL
 * @param {boolean} scrapped If the URL is already scrapped or not. Default false.
 * @returns {Promise<boolean>}
 */
export async function insertPlaceUrlIfNotExists({ url, area, category, lat, lng, scrapped = false }) {
    const hash = hashSHA256(url);
    const defaults = {
        hash,
        url,
        area,
        category,
        lat,
        lng,
        scrapped
    };

    try {
        const [ instance, created ] = await placeUrls.findOrCreate(
            {
                where: {
                    hash
                },
                defaults
            }
        );

        return created;
        // if (!created) {
        //     console.log('Place record already exists.');
        // }
    } catch (error) {
        console.error('Error inserting place URL:', error, JSON.stringify(defaults));

        return false;
    }
}

/**
 * Responsible to change the status of Category URL record to scrapped.
 *
 * @param {string} id The record ID.
 *
 * @returns {Promise<boolean>}
 */
export async function markCategoryUrlsAsScrapped(id) {
    const [ updatedRows ] = await categoryUrls.update(
        { scrapped: true },
        { where: { id } }
    );

    return updatedRows > 0; // Return true if a record was updated, otherwise false
}

export class DbTransaction {
    constructor() {
        this.transaction = null;
    }

    async startTransaction() {
        this.transaction = await sequelize.transaction();
    }

    async commitTransaction() {
        if ( this.transaction ) {
            await this.transaction.commit();
            this.transaction = null;
        }
    }

    async rollbackTransaction() {
        if ( this.transaction ) {
            await this.transaction.rollback();
            this.transaction = null;
        }
    }
}
