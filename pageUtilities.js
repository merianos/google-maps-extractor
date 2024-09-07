/**
 * Responsible to test if the current page is a Terms & Conditions page.
 *
 * @param page
 * @param selector
 * @returns {Promise<boolean>}
 */
export async function isTermsPage(page, selector) {
    try {
        return await page.$(selector) !== null;
    } catch (error) {
        console.error('Error checking terms page:', error);
        return false;
    }
}

/**
 * If the current page is a Terms & Conditions page, then press the decline button.
 *
 * @param page
 * @param selector
 * @returns {Promise<boolean>}
 */
export async function declineTermsAndConditions(page, selector) {
    try {
        // Check if we're on the terms page
        const onTermsPage = await isTermsPage(page, selector);

        if (!onTermsPage) {
            return false;
        }

        // If the specified selector exists, click on it (accept/decline terms)
        await page.click(selector);

        // Wait for navigation after clicking the terms button
        await page.waitForNavigation();

        return true;
    } catch (error) {
        console.error('Error accepting terms:', error);
        return false;
    }
}

/**
 * Let the puppeteer sleep for `ms` time.
 * @param {Number} ms The milliseconds to sleep.
 *
 * @returns {Promise<unknown>}
 */
export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Generates a random number between min (inclusive) and max (exclusive).
 *
 * @param {number} min - The minimum value (inclusive).
 * @param {number} max - The maximum value (exclusive).
 * @returns {number} - A random number between min and max.
 */
export const getRandomNumber = (min, max) => Math.random() * (max - min) + min;

/**
 * Checks if a given point is inside a polygon using the Ray-Casting algorithm.
 *
 * @param {Object} point - The point to check, with properties lat and lng.
 * @param {Array} polygon - An array of points defining the polygon, each with lat and lng properties.
 * @returns {boolean} - True if the point is inside the polygon, otherwise false.
 *
 * Polygon Example:
 * const geoFencedArea = [
 *     { lat: 39.820857, lng: 19.627665},
 *     { lat: 39.835630, lng: 19.849053},
 *     { lat: 39.783562, lng: 19.973320},
 *     { lat: 39.716250, lng: 19.944415},
 *     { lat: 39.673232, lng: 19.917887},
 *     { lat: 39.606102, lng: 19.971497},
 *     { lat: 39.353304, lng: 20.192041},
 *     { lat: 39.342491, lng: 20.050158},
 *     { lat: 39.530120, lng: 19.699349},
 *     { lat: 39.763492, lng: 19.618359},
 *     { lat: 39.820857, lng: 19.627665},
 * ];
 */
export const isPointInPolygon = (point, polygon) => {
    const { lat, lng } = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat, yi = polygon[i].lng;
        const xj = polygon[j].lat, yj = polygon[j].lng;

        const intersect = ((yi > lng) !== (yj > lng)) &&
            (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
        if (intersect) {
            inside = !inside;
        }
    }

    return inside;
}

/**
 * Responsible to auto-scroll to the bottom of the search results in the Google Maps Search page and
 * extract the places Links that consists part of the geo-fenced areas.
 *
 * @param {CdpPage} page THe browser page.
 * @param {Array} geoFencedAreas Array contains the Geo-Fences from all the places.
 * @returns {Promise<*>}
 */
export const scrapSearchResults = async (page, geoFencedAreas) => {
    let lastHeight = await page.evaluate(
        () => {
            const element = document.querySelector(`[role="feed"]`);

            if (!element) {
                return 0;
            }

            return element.scrollHeight;
        }
    );

    const scroll = async () => {
        while (true) {
            await page.evaluate(
                () => {
                    const element = document.querySelector(`[role="feed"]`);

                    if (element) {
                        element.scrollTo(0, element.scrollHeight);
                    }
                }
            );
            // await page.evaluate('window.scrollTo(0, document.body.scrollHeight)');
            await page.waitForNetworkIdle();
            await sleep(getRandomNumber(150, 700));

            let newHeight = await page.evaluate(
                () => {
                    const element = document.querySelector(`[role="feed"]`);

                    if (!element) {
                        return 0;
                    }

                    return element.scrollHeight;
                }
            );

            if (newHeight === lastHeight) {
                break;
            }

            lastHeight = newHeight;
        }

        // This method is responsible to return all the places Link URLs from the search results feed.
        let data = await page.evaluate(
            () => {
                const places = Array.from(
                    document
                        .querySelectorAll(
                            '[role="feed"] a[href*="/maps/place/"]'
                        )
                );

                return places.map(place => place.getAttribute("href"));
            }
        );

        // This method is responsible to remove the found places that are outside the geo-fenced area.
        data = data.filter(
            url => {
                const regex = /(\d{1,2}\.\d+)(,|(!4d))(\d+\.\d+)(!|,)\d+/gm;
                let m;
                let lat = null;
                let lng = null;

                while ((m = regex.exec(url)) !== null) {
                    // This is necessary to avoid infinite loops with zero-width matches
                    if (m.index === regex.lastIndex) {
                        regex.lastIndex++;
                    }

                    lat = m[1];
                    lng = m[4];
                    break;
                }

                let foundInGeoFencedAreas = false;

                for (let fencedArea of geoFencedAreas) {
                    foundInGeoFencedAreas = isPointInPolygon({ lat, lng }, fencedArea);

                    if (foundInGeoFencedAreas) {
                        break;
                    }
                }

                return foundInGeoFencedAreas;
            }
        );

        return data;
    }

    return await scroll();
}

/**
 * Responsible to auto-scroll to the bottom of the image gallery in the Google Maps Place Images page and
 * extract the places images URLs.
 *
 * @param {CdpPage} page THe browser page.
 * @returns {Promise<*>}
 */
export const scrapPlaceImages = async (page) => {
    let lastHeight = await page.evaluate(
        () => {
            const element = document.querySelector(`#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde`);

            if (!element) {
                return 0;
            }

            return element.scrollHeight;
        }
    );

    const scroll = async () => {
        while (true) {
            await page.evaluate(
                () => {
                    const element = document.querySelector(`#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde`);
                    element.style.scrollBehavior = 'smooth';

                    if (element) {
                        element.scrollTo(0, element.scrollHeight);
                    }
                }
            );
            await page.waitForNetworkIdle();
            await sleep(getRandomNumber(150, 700));

            let newHeight = await page.evaluate(
                () => {
                    const element = document.querySelector(`#QA0Szd > div > div > div.w6VYqd > div:nth-child(2) > div > div.e07Vkf.kA9KIf > div > div > div.m6QErb.DxyBCb.kA9KIf.dS8AEf.XiKgde`);

                    if (!element) {
                        return 0;
                    }

                    return element.scrollHeight;
                }
            );

            if (newHeight === lastHeight) {
                break;
            }

            lastHeight = newHeight;
        }

        // This method is responsible to return all the places Link URLs from the search results feed.
        let data = await page.evaluate(
            () => {
                const imageUrls = Array.from(document.querySelectorAll('a.OKAoZd .U39Pmb[role="img"]'));

                return imageUrls
                    .map(
                        image => {
                            const regex = /url\("([^"]+)"\)/gm;
                            const subst = `$1`;
                            const bgImage = image.style.backgroundImage;

                            return bgImage.replace(regex, subst);
                        }
                    );
            }
        );

        return data;
    }

    return await scroll();
}
