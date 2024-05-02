require('dotenv').config();
const { writeFileSync, readFileSync } = require('fs');
const puppeteer = require('puppeteer');
const jsdom = require('jsdom');
const nodeFetch = require('node-fetch');
const { getZipCode, getNeighbourhoodData, convertResidentsToPercentage} = require('./utils/utils');

const WIDTH = 1920;
const HEIGHT = 1080;

const data = readFileSync('db.json', { encoding:'utf8', flag: 'r' });
const pastResults = new Set(JSON.parse(data) || []);
console.log('pastResults:', pastResults);
const newResults = new Set();
const houses = [];
const { CHAT_ID, BOT_API } = process.env;

const urls = [
    'https://www.funda.nl/en/zoeken/huur/?selected_area=%5B%22amsterdam,15km%22%5D&price=%22-2000%22&rooms=%222-%22&publication_date=%221%22'
];

const runTask = async () => {
    for (const url of urls) {
        await runPuppeteer(url);
    }

    console.log('newResults:', newResults);

    if (newResults.size > 0) {
        writeFileSync('db.json', JSON.stringify(Array.from([
            ...newResults,
            ...pastResults,
        ])));

        console.log('sending messages to Telegram');
        const date = (new Date()).toISOString().split('T')[0];
        houses.forEach(({
            path
        }) => {
            let text = `${date}\n[funda](${path})\n[map](${path}/#kaart)`

            nodeFetch(`https://api.telegram.org/bot${BOT_API}/sendMessage`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text,
                    chat_id : CHAT_ID,
                    parse_mode : 'markdown',
                }),
            });
        });
    }
};

const runPuppeteer = async (url) => {
    console.log('opening headless browser');
    const browser = await puppeteer.launch({
        headless: true,
        args: [`--window-size=${WIDTH},${HEIGHT}`],
        defaultViewport: {
            width: WIDTH,
            height: HEIGHT,
        },
    });

    const page = await browser.newPage();
    // https://stackoverflow.com/a/51732046/4307769 https://stackoverflow.com/a/68780400/4307769
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36');

    console.log('going to funda');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const htmlString = await page.content();
    const dom = new jsdom.JSDOM(htmlString);


    console.log('parsing funda.nl data');
    const result = dom.window.document.querySelectorAll('.search-result');
    for (const element of result) {
        const urlPath = element?.querySelectorAll('a')?.[0]?.href;
        const headerSubtitle = element?.querySelector('.search-result__header-subtitle');
        const subtitleText = headerSubtitle?.innerHTML?.trim();

        let path = urlPath;
        if (!path.includes('https://www.funda.nl')) {
            path = `https://www.funda.nl${urlPath}`;
        }

        path = path.replace('?navigateSource=resultlist', '');
        if (path && !pastResults.has(path) && !newResults.has(path)) {
            let extraDetails = {};

            newResults.add(path);
            houses.push({
                ...extraDetails,
                path,
            });
        }
    }

    console.log('closing browser');
    await browser.close();
};

if (CHAT_ID && BOT_API) {
    runTask();
} else {
    console.log('Missing Telegram API keys!');
}
