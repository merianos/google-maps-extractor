import createBrowserInstance                                                                 from "./browserManager.js";
import {
    declineTermsAndConditions,
    getRandomNumber,
    isPointInPolygon,
    scrapSearchResults,
    sleep
}                                                                                            from "./pageUtilities.js";
import AppConfig                                                                             from "./appconfig.js";
import {
    getTileGrid
}                                                                                            from "./geolocationUtilities.js";
import CategoriesManager
                                                                                             from "./categoriesManager.js";
import {
    DbTransaction,
    getRandomEntryThatIsNotScrapped,
    initializeDatabase,
    insertCategoryUrlIfNotExists,
    insertPlaceUrlIfNotExists,
    markCategoryUrlsAsScrapped,
    truncateCategoryUrls
}                                                                                            from "./db.js";
import { hasArgument }                                                                       from "./arguments.js";
import chalk                                                                                 from 'chalk';
import { getDeliveryServices, getNestedValue, optimizePlaceImageURL, optimizeStreetViewURL } from "./placeUtilities.js";

// Read App Configuration and set scrap tiles sizes
const appConfig = new AppConfig('./appconfig.json');
const areas = await appConfig.getActiveAreas();
const categoryManager = new CategoriesManager('./categories.json');
const categories = await categoryManager.getCategories();

switch (true) {
    case hasArgument('load-urls'):
        const urlObjects = [];
        await initializeDatabase();

        if (hasArgument('truncate-categories')) {
            await truncateCategoryUrls();
        }

        areas
            .forEach(
                area => {
                    const tilesToScan = getTileGrid(
                        area.geoFencing,
                        area.mapConfig.divideLat,
                        area.mapConfig.divideLng
                    );

                    tilesToScan
                        .forEach(
                            tile => {
                                categories
                                    .forEach(
                                        category => {
                                            const cat = encodeURIComponent(category.Category);
                                            const url = `https://www.google.com/maps/search/${cat}/@${tile.lat},${tile.lng},${area.mapConfig.zoomLevel}z?entry=ttu`;

                                            urlObjects.push(
                                                {
                                                    url,
                                                    area    : area.name,
                                                    category: category.Category,
                                                    lat     : tile.lat,
                                                    lng     : tile.lng
                                                }
                                            );
                                        }
                                    );
                            }
                        );
                }
            );

        for (let entry of urlObjects) {
            await insertCategoryUrlIfNotExists(entry);
        }

        break;

    case hasArgument('fetch-places-urls'):
        await initializeDatabase();
        let urlEntry = null;

        // const rejectResources = req => {
        //     if ( req.resourceType() === 'image' ) {
        //         const img =
        // 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='; const
        // buffer = Buffer.from(img, 'base64');  req.respond( { status: 200, contentType: 'image/png', body: buffer }
        // ); } else { req.continue(); } }

        const browser = await createBrowserInstance();
        let pages = await browser.pages();
        let page = null;
        const geoFencedAreas = await appConfig.getGeoFenceDataFromAreaName();
        const transactionManager = new DbTransaction();
        let counter = 0;

        do {
            ++counter;

            if (counter > getRandomNumber(100, 150)) {
                const sleepDuration = getRandomNumber(125312, 304150);
                const message = `\n\n
                    ${chalk.white.bgBlue(`Scrapper will sleep for ${chalk.red(sleepDuration / 1000 / 60)} minutes because already scrapper ${chalk.red(
                    counter)} URLs.`)}
                    \n\n
                `;

                console.log(message);
                await sleep(sleepDuration);
                counter = 0;
            }

            // Returning null if no more records exists to scrap.
            urlEntry = await getRandomEntryThatIsNotScrapped();

            let prettyURL = 'N/A';
            if (urlEntry?.url) {
                prettyURL = decodeURIComponent(urlEntry.url);
            }

            console.log(chalk.yellow(`Next URL: ${chalk.cyan(prettyURL)}`));

            if (null === urlEntry) {
                break;
            }

            try {
                // try {
                //     page.off('request', rejectResources);
                // } catch(e) {}
                page = await browser.newPage();

                // Allow the page requests to be intercepted.
                // await page.setRequestInterception(true);
                // page.on('request', rejectResources);

                pages = await browser.pages();
                await Promise.all(
                    pages.map(p => (p !== page ? p.close() : Promise.resolve())),
                );

                await sleep(getRandomNumber(230, 731));
                await page.goto(urlEntry.url);
                await declineTermsAndConditions(page, 'button[jsname="tWT92d"][jscontroller="soHxf"]');

                await page.waitForNetworkIdle(
                    {
                        concurrency: 1000,
                        idleTime   : 300
                    }
                );
            } catch (e) {
                // page.off('request', rejectResources);
                pages = await browser.pages();
                page = await browser.newPage();
                // await page.setRequestInterception(true);
                // page.on('request', rejectResources);

                await Promise.all(
                    pages.map(p => (p !== page ? p.close() : Promise.resolve())),
                );

                console.error(`\n\nERROR: ${e.message}\n\n`);
                continue;
            }

            let isPlace = false;
            try {
                isPlace = await page.evaluate(
                    () => {
                        const regex = /maps\/place\/[^\/]+\/@\d{1,2}\.\d+,\d{1,2}\.\d+,\d+z\//gm;

                        return null !== regex.exec(window.location.href);
                    }
                );
            } catch (e) {
                console.error(`\n\nERROR isPlace Check: ${e.message}\n\n`);
                continue;
            }

            try {
                await transactionManager.startTransaction();

                if (isPlace) {
                    // Insert place URL in the DB
                    let redirectedPlaceURL = await page.evaluate(
                        () => {
                            const regex = /maps\/place\/[^\/]+\/@\d{1,2}\.\d+,\d{1,2}\.\d+,\d+z\//gm;

                            return window.location.href;
                        }
                    );

                    const regex = /(\d{1,2}\.\d+)(,|(!4d))(\d+\.\d+)!\d+/gm;
                    let m;
                    let lat = null;
                    let lng = null;

                    while ((m = regex.exec(redirectedPlaceURL)) !== null) {
                        // This is necessary to avoid infinite loops with zero-width matches
                        if (m.index === regex.lastIndex) {
                            regex.lastIndex++;
                        }

                        lat = m[1];
                        lng = m[4];
                    }

                    let insertedUrls = 0;
                    let existingUrls = 0;

                    const insertStatus = await insertPlaceUrlIfNotExists(
                        {
                            url     : redirectedPlaceURL,
                            area    : urlEntry.area,
                            category: urlEntry.category,
                            lat     : lat,
                            lng     : lng,
                            scrapped: false
                        }
                    );

                    insertStatus ? insertedUrls++ : existingUrls++;

                    console.log(`Found URLs: ${chalk.blue(1)} Inserted URLs: ${chalk.green(insertedUrls)} Existing URLs: ${chalk.red(
                        existingUrls)} Category: ${chalk.yellow(urlEntry.category)}`);
                } else {
                    const foundUrls = await scrapSearchResults(page, geoFencedAreas);
                    const totalUrls = foundUrls.length;
                    let insertedUrls = 0;
                    let existingUrls = 0;

                    for (let url of foundUrls) {
                        const insertStatus = await insertPlaceUrlIfNotExists(
                            {
                                url     : url,
                                area    : urlEntry.area,
                                category: urlEntry.category,
                                lat     : urlEntry.lat,
                                lng     : urlEntry.lng,
                                scrapped: false
                            }
                        );

                        insertStatus ? insertedUrls++ : existingUrls++;
                    }

                    console.log(`Found URLs: ${chalk.blue(totalUrls)} Inserted URLs: ${chalk.green(insertedUrls)} Existing URLs: ${chalk.red(
                        existingUrls)} Category: ${chalk.yellow(urlEntry.category)}`);
                }

                await markCategoryUrlsAsScrapped(urlEntry.id);

                await transactionManager.commitTransaction();
            } catch (e) {
                console.error(`Something went wrong with the ${urlEntry.url} and cannot be scrapped`);
                await transactionManager.rollbackTransaction();
                continue;
            }

        } while (null !== urlEntry);

        await page.close();
        process.exit(0);

        break;

    case hasArgument('fetch-places-data'):
        // let placeURL =
        // 'https://www.google.com/maps/place/%CE%91%CE%A4%CE%9C/@39.67129,19.7368145,17z/data=!3m1!4b1!4m6!3m5!1s0x135b5094c2ab2d01:0x75b7de5a7c580424!8m2!3d39.67129!4d19.7368145!16s%2Fg%2F11fyzbnknl?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDgyOC4wIKXMDSoASAFQAw%3D%3D';
        let placeURL = 'https://www.google.com/maps/place/%CE%A3%CF%84%CE%B7+%CE%A3%CE%AD%CF%83%CE%BF%CF%85%CE%BB%CE%B1+Souvlaki+bar+%2F+Sti+Sesoula+Souvlaki+bar/@39.6049844,19.8945215,17z/data=!3m1!4b1!4m6!3m5!1s0x135b5e8c22b1834f:0x89d4d7f7670e4f8f!8m2!3d39.6049844!4d19.8945215!16s%2Fg%2F11c604rh02?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDgyOC4wIKXMDSoASAFQAw%3D%3D';

        const browserInstance = await createBrowserInstance();
        let instancePages = await browserInstance.pages();
        let instancePage = null;
        instancePage = await browserInstance.newPage();

        await Promise.all(instancePages.map(p => (p !== instancePage ? p.close() : Promise.resolve())));

        await sleep(getRandomNumber(230, 731));
        await instancePage.goto(placeURL);
        await declineTermsAndConditions(instancePage, 'button[jsname="tWT92d"][jscontroller="soHxf"]');

        await instancePage.waitForNetworkIdle(
            {
                concurrency: 1000,
                idleTime   : 300
            }
        );

        const data = await instancePage.evaluate(
            () => {
                function getData(path = null) {
                    const data = JSON
                        .parse(
                            window
                                .APP_INITIALIZATION_STATE[3][6]
                                .substring(
                                    window
                                        .APP_INITIALIZATION_STATE[3][6].indexOf("[null,")
                                )
                        );

                    if (null === path) {
                        return data;
                    }

                    const keys = path.split('.');
                    return keys.reduce((acc, key) => acc && acc[key], data);
                }

                return getData();
            }
        );

        if (null === data) {
            console.log("Data Not Exists");
        }

        const placeLocation = {
            lat: getNestedValue(data, '$.[6].[9].[2]'),
            lng: getNestedValue(data, '$.[6].[9].[3]')
        }

        let belongsToGeofencing = false;

        for (let area of areas) {
            if (
                isPointInPolygon(
                    placeLocation,
                    area.geoFencing
                )
            ) {
                belongsToGeofencing = true;
                break;
            }
        }

        if (belongsToGeofencing) {
            // The place located inside the given area, thus can be processed for database insertion
            const placeData = {
                lat             : placeLocation.lat,
                lng             : placeLocation.lng,
                name            : getNestedValue(data, '$.[6].[99].[0].[0].[1].[2].[1].[13].[0]'),
                subTitle        : getNestedValue(data, '$.[6].[99].[0].[0].[1].[2].[1].[11]'),
                address         : getNestedValue(data, '$.[6].[39]'),
                addressLocatedAt: getNestedValue(data, '$.[6].[134].[0].[0].[0].[0]'),
                reviewsTotal    : getNestedValue(data, '$.[6].[4].[8]'),
                reviewsAverage  : getNestedValue(data, '$.[6].[4].[7]'),
                timezone        : getNestedValue(data, '$.[6].[30]'),
                streetView      : optimizeStreetViewURL(getNestedValue(data, '$.[6].[37].[0].[0].[6].[0]')),
                placeImage      : optimizePlaceImageURL(getNestedValue(data, '$.[6].[37].[0].[1].[6].[0]')),
                placeCoverImage : optimizePlaceImageURL(getNestedValue(data, '$.[6].[51].[0].[0].[6].[0]')),
                googleMapURL    : getNestedValue(data, '$.[6].[42]'),
                reservationText : getNestedValue(data, '$.[6].[46].[0].[1]'),
                reservationURL  : getNestedValue(data, '$.[6].[46].[0].[0]'),
                websiteText     : getNestedValue(data, '$.[6].[7].[1]'),
                websiteURL      : getNestedValue(data, '$.[6].[7].[0]'),
                menuText        : getNestedValue(data, '$.[6].[38].[1]'),
                menuURL         : getNestedValue(data, '$.[6].[38].[0]'),
                deliveryServices: getDeliveryServices(getNestedValue(data, '$.[6].[75].[0].[1].[2]')),
                phoneNumber     : getNestedValue(data, '$.[6].[178].[0].[3]'),
                plusCode        : getNestedValue(data, '$.[6].[183].[2].[2].[0]'),
            };

            console.log(placeData);
        }

        process.exit(0);

        break;
}
