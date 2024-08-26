import puppeteer from 'puppeteer';
import { hasArgument } from "./arguments.js";

const browserConfig = {
    headless       : hasArgument('headless'),
    devtools       : hasArgument('debug'),
    defaultViewport: null,
    args           : [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--start-maximized'
    ],
    ignoreDefaultArgs: [
        "--disable-extensions"
    ]
};

async function createBrowserInstance() {
    return await puppeteer.launch(browserConfig);
}

export default createBrowserInstance;
