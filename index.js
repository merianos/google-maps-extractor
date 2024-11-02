import createBrowserInstance from "./browserManager.js";
import {
    declineTermsAndConditions,
    getRandomNumber,
    isPointInPolygon, scrapPlaceImages,
    scrapSearchResults,
    sleep
}                            from "./pageUtilities.js";
import AppConfig             from "./appconfig.js";
import {
    getTileGrid
}                            from "./geolocationUtilities.js";
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
}                            from "./db.js";
import { hasArgument }       from "./arguments.js";
import chalk                 from 'chalk';
import {
    extractBusStopData,
    getDeliveryServices,
    getNestedValue,
    optimizePlaceImageURL, optimizePlaceLogo,
    optimizeStreetViewURL, processEntranceTicketServices, processFeatures, processTicketServices,
    processWorkingHours
}                            from "./placeUtilities.js";

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
        // 'https://www.google.com/maps/place/GRILL+HOUSE+RESTAURANT/@39.7031815,19.8412684,17z/data=!4m7!3m6!1s0x135b5bc3e97fe85b:0xa53400b3d3c5c08a!8m2!3d39.7031815!4d19.8412684!10e1!16s%2Fg%2F11tfn2bkrc?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDkwNC4wIKXMDSoASAFQAw%3D%3D';
        // let placeURL =
        // 'https://www.google.com/maps/place/%CE%A8%CE%B7%CF%83%CF%84%CE%B1%CF%81%CE%B9%CE%AC+Grill+House/data=!4m7!3m6!1s0x135ca755ba1e7365:0x40de5413df5a60ba!8m2!3d39.5469094!4d19.850167!16s%2Fg%2F11f0l20wyx!19sChIJZXMeulWnXBMRumBa3xNU3kA?authuser=0&hl=el&rclk=1';
        // let placeURL =
        // 'https://www.google.com/maps/place/%CE%A3%CF%84%CE%B7+%CE%A3%CE%AD%CF%83%CE%BF%CF%85%CE%BB%CE%B1+Souvlaki+bar+%2F+Sti+Sesoula+Souvlaki+bar/@39.6049844,19.8945215,17z/data=!3m1!4b1!4m6!3m5!1s0x135b5e8c22b1834f:0x89d4d7f7670e4f8f!8m2!3d39.6049844!4d19.8945215!16s%2Fg%2F11c604rh02?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDgyOC4wIKXMDSoASAFQAw%3D%3D';
        // let placeURL =
        // 'https://www.google.com/maps/place/%CE%94%CE%B7%CE%BC%CE%BF%CF%84%CE%B9%CE%BA%CE%BF+%CE%A3%CF%87%CE%BF%CE%BB%CE%B5%CE%AF%CE%BF+%CE%A0%CE%B1%CE%BB%CE%B9%CE%AC%CF%82+%CE%A0%CE%BF%CE%BB%CE%B7%CF%82/@39.6230573,19.9211727,19z/data=!3m1!4b1!4m6!3m5!1s0x135b5d001ed873ad:0x542f334ced4dca17!8m2!3d39.6230563!4d19.9218164!16s%2Fg%2F11vs0w0wbp?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDkwNC4wIKXMDSoASAFQAw%3D%3D';
        // let placeURL =
        // 'https://www.google.com/maps/place/Pelekas+Beach+Grill+Bar/@39.5853787,19.817,17z/data=!3m1!4b1!4m6!3m5!1s0x135b59c99d3c1229:0xf91dd7ae5b98b803!8m2!3d39.5853787!4d19.817!16s%2Fg%2F11h578xt59?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDkwNC4wIKXMDSoASAFQAw%3D%3D'
        // let placeURL =
        // `https://www.google.com/maps/place/IL+FORNO+PIZZA+BAR+RESTAURANT/data=!4m7!3m6!1s0x135b5f935fa2e46f:0x957e165db0c86cb0!8m2!3d39.5925269!4d19.8924838!16s%2Fg%2F11ft2014q4!19sChIJb-SiX5NfWxMRsGzIsF0WfpU?authuser=0&hl=el&rclk=1`; let placeURL = `https://www.google.com/maps/place/%22Villa+veneto%22+luxury+holidays/data=!4m10!3m9!1s0x135b4fdbd4fc9ca1:0x2ea0a85735fc3cdb!5m2!4m1!1i2!8m2!3d39.7918201!4d19.6927387!16s%2Fg%2F11nx0pfhpv!19sChIJoZz81NtPWxMR2zz8NVeooC4?authuser=0&hl=el&rclk=1`; let placeURL = 'https://www.google.com/maps/place/Paxos+Water+Escape/@39.154026,20.2224427,18z/data=!4m6!3m5!1s0x135c8d1d09d9229f:0x10e33879ffc640e0!8m2!3d39.197415!4d20.1859044!16s%2Fg%2F1q5bm7q7t?entry=ttu&g_ep=EgoyMDI0MDgyOC4wIKXMDSoASAFQAw%3D%3D'; let placeURL = 'https://www.google.com/maps/place/%CE%A8%CE%91%CE%98%CE%91/@39.5953641,19.8902451,17z/data=!4m6!3m5!1s0x135b5ef18375d219:0xb10bce2ff83f155d!8m2!3d39.59536!4d19.89282!16s%2Fg%2F11tp2fxdfr?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MDkxMS4wIKXMDSoASAFQAw%3D%3D'; let placeURL = 'https://www.google.com/maps/place/%CE%91%CF%81%CF%87%CE%B1%CE%B9%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CE%BA%CF%8C+%CE%9C%CE%BF%CF%85%CF%83%CE%B5%CE%AF%CE%BF+%CE%9A%CE%AD%CF%81%CE%BA%CF%85%CF%81%CE%B1%CF%82/data=!4m7!3m6!1s0x135b5ddefa99cfb3:0x27b805d757b55897!8m2!3d39.6189037!4d19.9219862!16s%2Fm%2F02r6j6k!19sChIJs8-Z-t5dWxMRl1i1V9cFuCc?authuser=0&hl=el&rclk=1' let placeURL = 'https://www.google.com/maps/place/Corfu+Aquarium/@39.6717144,19.7011367,17z/data=!3m1!4b1!4m6!3m5!1s0x135b51231f5a111b:0x70f1ebe92e6b1d0e!8m2!3d39.6717144!4d19.7011367!16s%2Fg%2F1q5blqxwp?authuser=0&hl=el&entry=ttu&g_ep=EgoyMDI0MTAwOS4wIKXMDSoASAFQAw%3D%3D'; let placeURL = 'https://www.google.com/maps/place/%22Il+Portico+Verde%22+sweet+Villa+with+pool+in+Corfu+island/data=!4m9!3m8!5m2!4m1!1i2!8m2!3d39.4243736!4d20.0547256!16s%2Fg%2F11y4h2l65q!17BQ0FF?authuser=0&hl=el&rclk=1';
        let placeURL = 'https://www.google.com/maps/place/%CE%9A%CE%91%CE%9B%CE%A5%CE%A8%CE%A9+%CE%93%CE%9F%CE%A5%CE%92%CE%99%CE%91+%CE%94%CE%99%CE%91%CE%9C%CE%95%CE%A1%CE%99%CE%A3%CE%9C%CE%91%CE%A4%CE%91/data=!4m7!3m6!1s0x135b5b9203a2c9f5:0x8d1154b4c7b201fd!8m2!3d39.6489508!4d19.8457031!16s%2Fg%2F1tljnvdk!19sChIJ9cmiA5JbWxMR_QGyx7RUEY0?authuser=0&hl=el&rclk=1';

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
                    if (!window?.APP_INITIALIZATION_STATE?.[3]?.[6]) {
                        return null;
                    }

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

        // Use Place ID to make sure the place not exists in the DB
        const placeID = getNestedValue(data, '$.[6].[78]');

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
                placeID            : placeID,
                lat                : placeLocation.lat,
                lng                : placeLocation.lng,
                name               : getNestedValue(data, '$.[6].[11]'),
                subTitle           : getNestedValue(data, '$.[6].[101]'),
                description        : getNestedValue(data, '$.[6].[154].[0].[0]'),
                featuresDescription: getNestedValue(data, '$.[6].[32].[2].[7].[1].[0].[1]') ??
                    getNestedValue(data, '$.[6].[32].[2].[7].[0]')?.join('\n\n') ?? '',
                // Note, although the image URL exists, for some logos, the Google returns a 404 error when fetching
                // the image URL.
                logo                       : optimizePlaceLogo(getNestedValue(data, '$.[6].[157]')),
                address                    : {
                    display    : getNestedValue(data, '$.[6].[39]'),
                    floorNumber: getNestedValue(data, '$.[6].[183].[0].[0].[1].[1].[0]'),
                    street     : getNestedValue(data, '$.[6].[183].[1].[1]'),
                    city       : getNestedValue(data, '$.[6].[183].[1].[3]'),
                    zip        : getNestedValue(data, '$.[6].[183].[1].[4]'),
                    country    : getNestedValue(data, '$.[6].[183].[1].[6]'),
                    plusCode   : getNestedValue(data, '$.[6].[183].[2].[2].[0]'),
                },
                placeMoreInfo              : {
                    description   : getNestedValue(data, "$.[6].[44].[2].[0].[0]"),
                    infoSourceURL : getNestedValue(data, '$.[6].[44].[2].[1].[1].[0]'),
                    infoSourceName: getNestedValue(data, '$.[6].[44].[2].[1].[1].[1]')
                },
                placeGoogleSearch          : getNestedValue(data, '$.[6].[126].[4]'),
                LocatedDetails             : getNestedValue(data, '$.[6].[134].[0].[0].[0].[0]'),
                reviewsTotal               : getNestedValue(data, '$.[6].[4].[8]'),
                reviewsAverage             : getNestedValue(data, '$.[6].[4].[7]'),
                reviewsOneStar             : getNestedValue(data, '$.[6].[175].[3].[0]'),
                reviewsTwoStar             : getNestedValue(data, '$.[6].[175].[3].[1]'),
                reviewsThreeStar           : getNestedValue(data, '$.[6].[175].[3].[2]'),
                reviewsFourStar            : getNestedValue(data, '$.[6].[175].[3].[3]'),
                reviewsFiveStar            : getNestedValue(data, '$.[6].[175].[3].[4]'),
                timezone                   : getNestedValue(data, '$.[6].[30]'),
                streetView                 : optimizeStreetViewURL(getNestedValue(data, '$.[6].[37].[0].[0].[6].[0]')),
                placeImage                 : optimizePlaceImageURL(getNestedValue(data, '$.[6].[37].[0].[1].[6].[0]')),
                placeCoverImage            : optimizeStreetViewURL(optimizePlaceImageURL(getNestedValue(
                    data,
                    '$.[6].[51].[0].[0].[6].[0]'
                ))),
                googleMapURL               : getNestedValue(data, '$.[6].[42]'),
                reservationText            : getNestedValue(data, '$.[6].[46].[0].[1]'),
                reservationURL             : getNestedValue(data, '$.[6].[46].[0].[0]'),
                websiteText                : getNestedValue(data, '$.[6].[7].[1]'),
                websiteURL                 : getNestedValue(data, '$.[6].[7].[0]'),
                menuText                   : getNestedValue(data, '$.[6].[38].[1]'),
                menuURL                    : getNestedValue(data, '$.[6].[38].[0]'),
                deliveryServices           : getDeliveryServices(getNestedValue(data, '$.[6].[75].[0].[1].[2]')),
                phoneNumber                : getNestedValue(data, '$.[6].[178].[0].[3]'),
                workingHours               : processWorkingHours(getNestedValue(data, '$.[6].[34].[1]')),
                features                   : processFeatures(getNestedValue(data, '$.[6].[100].[1]')),
                priceRangeDescription      : getNestedValue(data, '$.[6].[4].[10]'),
                priceRangeValue            : getNestedValue(data, '$.[6].[4].[2]'),
                categories                 : getNestedValue(data, '$.[6].[13]'),
                placeInformationDescription: getNestedValue(data, '$.[6].[32].[1].[1]'),
                placeEvaluation            : {
                    rating               : null,
                    evaluationTitle      : null,
                    evaluationDescription: null,
                    activitiesRating     : null,
                    transportRating      : null,
                    airportAccessRating  : null,
                    activities           : [],
                    airports             : [],
                    transport            : []
                },
                placeTicket                : {
                    disclaimerRules: getNestedValue(data, '$.[6].[236].[2]'),
                    agenciesList   : processTicketServices(getNestedValue(data, '$.[6].[236].[1]'))
                },
                entranceTickets            : {
                    disclaimerRules: getNestedValue(data, '$.[6].[191].[12]'),
                    agenciesList   : processEntranceTicketServices(getNestedValue(data, '$.[6].[191].[11]'))
                },
                transportInfo              : extractBusStopData(getNestedValue(data, '$.[6].[62]')),
                carChargingPointInfo       : {
                    type         : getNestedValue(data, '$.[6].[140].[1].[0].[2].[0].[0]'),
                    kilowatt     : getNestedValue(data, '$.[6].[140].[1].[0].[2].[0].[6]'),
                    chargingSpeed: getNestedValue(data, '$.[6].[140].[1].[0].[2].[0].[9].[0]'),
                    chargersCount: getNestedValue(data, '$.[6].[140].[1].[0].[2].[0].[4]')
                }
                // placeTrafficData     : getNestedValue(data, '$.[6].[84]') // I comment out this feature because for
                // the moment isn't good for implementation.
            };

            placeData.temporaryClosed = await instancePage
                .evaluate(
                    () => {
                        const getElementByXpath = path => document
                            .evaluate(
                                path,
                                document,
                                null,
                                XPathResult.FIRST_ORDERED_NODE_TYPE,
                                null
                            ).singleNodeValue;
                        const element = getElementByXpath(`//span[contains(@class, 'aSftqf') and text() = 'Προσωρινά κλειστό']`);

                        return 'object' === typeof element && 'HTMLSpanElement' === (element?.constructor?.name ?? '')
                    }
                );
            placeData.permanentlyClosed = await instancePage
                .evaluate(
                    () => {
                        const getElementByXpath = path => document
                            .evaluate(
                                path,
                                document,
                                null,
                                XPathResult.FIRST_ORDERED_NODE_TYPE,
                                null
                            ).singleNodeValue;
                        const element = getElementByXpath(`//span[contains(@class, 'aSftqf') and text() = 'Οριστικά κλειστό']`);

                        return 'object' === typeof element && 'HTMLSpanElement' === (element?.constructor?.name ?? '')
                    }
                );
            placeData.placeEvaluation = await instancePage
                .evaluate(
                    async () => {
                        const rating = document.querySelector('.l4WCCd .gm2-headline-3')?.innerText ?? null;
                        const evaluationTitle = document.querySelector('.SsuqXb .deGzub')?.innerText ?? null;
                        const evaluationDescription = document.querySelector('.MmD1mb')?.innerText ?? null;

                        document.querySelector(
                            'button.B1G3lf[aria-label="Περισσότερες πληροφορίες σχετικά με τη βαθμολογία τοποθεσίας"]')
                                ?.click();

                        const sleep = ms => new Promise(r => setTimeout(r, ms));
                        await sleep(150);

                        const activitiesRating = document
                            .querySelector('.SERCub.lightbox .ZAtz8b:nth-child(1) .lcx6Dc')
                            ?.innerText
                            ?.replace(/\/\d+/, '')
                            ?.replace(',', '.') ?? null;
                        const transportRating = document
                            .querySelector('.SERCub.lightbox .ZAtz8b:nth-child(2) .lcx6Dc')
                            ?.innerText
                            ?.replace(/\/\d+/, '')
                            ?.replace(',', '.') ?? null;
                        const airportAccessRating = document
                            .querySelector('.SERCub.lightbox .ZAtz8b:nth-child(3) .lcx6Dc')
                            ?.innerText
                            ?.replace(/\/\d+/, '')
                            ?.replace(',', '.') ?? null;

                        // Function to observe DOM and wait for the tabpanel to be inserted or updated
                        const waitForTabPanel = async tabPanelSelector => {
                            return new Promise(
                                resolve => {
                                    // Create a MutationObserver to detect the addition or update of the tabpanel
                                    const observer = new MutationObserver(
                                        (mutationsList, observer) => {
                                            for (const mutation of mutationsList) {
                                                if (mutation.type === 'childList' || mutation.type === 'attributes') {
                                                    const tabpanel = document.querySelector(tabPanelSelector);

                                                    if (tabpanel) {
                                                        // Stop observing once the tabpanel is found
                                                        observer.disconnect();
                                                        // Resolve the promise with the tabpanel element
                                                        resolve(tabpanel);
                                                    }
                                                }
                                            }
                                        }
                                    );

                                    // Start observing the body for child elements or attribute changes
                                    observer.observe(
                                        document.body,
                                        {
                                            childList : true,
                                            subtree   : true,
                                            attributes: true
                                        }
                                    );
                                }
                            );
                        };

                        // Function to collect the child button data from the tabpanel
                        const collectButtonData = (tabpanel, label) => {
                            // Select all buttons inside the tabpanel
                            const buttons = tabpanel.querySelectorAll('button');

                            return Array
                                .from(buttons)
                                .map(
                                    button => {
                                        let title = '';
                                        let description = '';
                                        let distanceAndDuration = [];
                                        let timeEntries = null;

                                        switch (label) {
                                            case 'Δραστηριότητες':
                                                title = button.getAttribute('aria-label');
                                                description = button.querySelector('div.SZaKQc')?.innerText ?? null;
                                                break;
                                            case 'Συγκοινωνία':
                                                title = button.getAttribute('aria-label');
                                                timeEntries = button.querySelectorAll('div.mjnC7e span.m7V6Wc');

                                                if (0 < timeEntries.length) {
                                                    for (const entry of timeEntries) {
                                                        const label = entry.querySelector('span[role="img"]');
                                                        const time = entry.querySelector('span:not([role="img"])');

                                                        distanceAndDuration.push(
                                                            {
                                                                type    : label.getAttribute('aria-label'),
                                                                duration: time.innerText
                                                            }
                                                        );
                                                    }
                                                }

                                                break;
                                            case 'Αεροδρόμια':
                                                title = button.getAttribute('aria-label');
                                                timeEntries = button.querySelectorAll('div.mjnC7e span.m7V6Wc');

                                                if (0 < timeEntries.length) {
                                                    for (const entry of timeEntries) {
                                                        const label = entry.querySelector('span[role="img"]');
                                                        const time = entry.querySelector('span:not([role="img"])');

                                                        distanceAndDuration.push(
                                                            {
                                                                type    : label.getAttribute('aria-label'),
                                                                duration: time.innerText
                                                            }
                                                        );
                                                    }
                                                }

                                                break;
                                        }

                                        return {
                                            title,
                                            description,
                                            distanceAndDuration
                                        };
                                    }
                                );
                        };

                        // Function to handle button clicks and fetch the tabpanel data
                        const handleButtonClick = async (button, tabpanelSelector, label) => {
                            // Trigger the click event on the button
                            setTimeout(
                                () => button.click(),
                                1000
                            );

                            // Wait for the tabpanel to be inserted or updated
                            const tabpanel = await waitForTabPanel(tabpanelSelector);

                            // Once the tabpanel exists or is updated, collect the buttons' data
                            return collectButtonData(tabpanel, label);
                        };

                        // Function to process the buttons sequentially
                        const processButtonsSequentially = async () => {
                            const buttons = document
                                .querySelectorAll(
                                    '.m6QErb.Pf6ghf.XiKgde.ecceSd.tLjsW.UhIuC > div button'
                                );
                            const fetchedData = {
                                activities    : null,
                                transportation: null,
                                airports      : null,
                            }

                            for (const button of buttons) {
                                const label = button.getAttribute('aria-label');
                                const tabpanelSelector = '.m6QErb.XiKgde.QjC7t[role="tabpanel"]';

                                switch (label) {
                                    case 'Δραστηριότητες':
                                        fetchedData.activities = await handleButtonClick(
                                            button,
                                            `${tabpanelSelector}[aria-label="Αποτελέσματα για Δραστηριότητες"]`,
                                            label
                                        );
                                        break;
                                    case 'Συγκοινωνία':
                                        fetchedData.transportation = await handleButtonClick(
                                            button,
                                            `${tabpanelSelector}[aria-label="Αποτελέσματα για Συγκοινωνία"]`,
                                            label
                                        );
                                        break;
                                    case 'Αεροδρόμια':
                                        fetchedData.airports = await handleButtonClick(
                                            button,
                                            `${tabpanelSelector}[aria-label="Αποτελέσματα για Αεροδρόμια"]`,
                                            label
                                        );
                                        break;
                                }
                            }

                            return fetchedData;
                        };

                        // Initialize the button click handling after DOM is fully loaded
                        const fetchedData = await processButtonsSequentially();

                        return {
                            rating,
                            evaluationTitle,
                            evaluationDescription,
                            activitiesRating   : null !== activitiesRating ? parseFloat(activitiesRating) : null,
                            transportRating    : null !== transportRating ? parseFloat(transportRating) : null,
                            airportAccessRating: null !== airportAccessRating ? parseFloat(airportAccessRating) : null,
                            activities         : fetchedData.activities,
                            airports           : fetchedData.airports,
                            transportation     : fetchedData.transportation
                        }
                    }
                );
            placeData.basicFeatures = await instancePage
                .evaluate(
                    async () => {
                        const features = [];

                        document.querySelectorAll('.tAiQdd .lMbq3e ul li.AIsQOd span.c1HoAd').forEach(
                            entry => {
                                const text = entry.innerText.replace(/^[^\d]+/, '').split(' ');
                                features.push(
                                    {
                                        quantity: text[0],
                                        label   : text[1]
                                    }
                                );
                            }
                        );

                        return features;
                    }
                )

            const streetViewButton = await instancePage.$('button.dQDAle[aria-label="Street view"]');

            if (streetViewButton) {
                await instancePage.click('button.dQDAle[aria-label="Street view"]');
                await instancePage.waitForNetworkIdle(
                    {
                        concurrency: 1000,
                        idleTime   : 300
                    }
                );

                placeData.streetViewURL = await instancePage.evaluate(() => window.location.href);
                await sleep(getRandomNumber(150, 700));

                const streetViewCloseButton = await instancePage.$('button.b3vVFf[aria-label="Κλείσιμο"]');
                if (streetViewCloseButton) {
                    await instancePage.click('button.b3vVFf[aria-label="Κλείσιμο"]');
                    await instancePage.waitForNetworkIdle(
                        {
                            concurrency: 1000,
                            idleTime   : 300
                        }
                    );
                }
                await sleep(getRandomNumber(350, 900));
            }

            const galleryButton = await instancePage.$(
                'button.aoRNLd.kn2E5e.NMjTrf.lvtCsd'
            );

            if (galleryButton) {
                await galleryButton.click();
                await instancePage.waitForNetworkIdle(
                    {
                        concurrency: 1000,
                        idleTime   : 300
                    }
                );

                let imageURLs = await scrapPlaceImages(instancePage);
                placeData.images = imageURLs
                    .map(
                        image => {
                            return optimizeStreetViewURL(
                                optimizePlaceImageURL(
                                    image
                                )
                            );
                        }
                    );

                const galleryBackButton = await instancePage.$('button.hYBOP.FeXq4d');
                if (galleryBackButton) {
                    await instancePage.click('button.hYBOP.FeXq4d');

                    await instancePage.waitForNetworkIdle(
                        {
                            concurrency: 1000,
                            idleTime   : 300
                        }
                    );
                }
            }

            console.dir(placeData);
        }

        process.exit(0);

        break;
}
