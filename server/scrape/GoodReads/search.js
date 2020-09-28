const scrapeIt = require("scrape-it");
const { db } = require("../../firebase/db.js");
const { getDayDiff } = require("../../utils/dates");

// https://pptr.dev/#?product=Puppeteer&version=v5.3.1&show=api-pageselector-1

const getQuotesFromPage = async (url) =>
  await scrapeIt(url, {
    quotes: {
      listItem: ".quote",
      data: {
        text: {
          selector: ".quoteText",
          convert: (x) => x.trim().split("\n")[0],
        },
        author: {
          selector: ".authorOrTitle:first-of-type",
          convert: (x) => x.trim().split("\n")[0],
        },
        source: {
          selector: ".authorOrTitle:last-of-type",
          convert: (x) => x.trim().split("\n")[0],
        },
      },
    },
  });

const terms = ["Benjamin P Hardy", "Grant Cardone"];

(async () => {
  const searches = db.collection("searches");

  terms.map(async (term) => {
    const doc = searches.doc(term);

    const termData = (await (await doc.get()).data()) || {};
    if (termData.updated) {
      console.log(`term ${term} already searched`);
      return;
      // TODO: once per week per phrase
      // TODO: handle later overwriting of quotes
      if (getDayDiff(new Date(), termData.updated) <= 7) {
        return;
      }
    }

    console.log(`searching ${term}`);

    const baseUrl = "https://www.goodreads.com/quotes/search?commit=Search";

    const quotes = db.collection("quotes");

    let allPagesParsed = false;
    let page = 1;

    do {
      const url = `${baseUrl}&page=${page}&q=${term.replace(" ", "+")}`;
      console.log(`searching page ${page} of ${term}`);

      // check to see if we've scrolled too many pages.
      await scrapeIt(url, {
        noResults: {
          selector: ".mediumText",
          convert: (x) => {
            if (x.includes("no results")) {
              allPagesParsed = true;
            }
          },
        },
      });

      if (allPagesParsed) {
        // end do while early if not triggered
        return;
      }

      const theseQuotes = await getQuotesFromPage(url);
      // TODO: get where check duplicates???
      const batch = db.batch();
      theseQuotes.data.quotes.map((quote) =>
        batch.set(quotes.doc(), { quote, updated: new Date() })
      );
      await batch.commit();

      doc.set({
        updated: new Date(),
      });

      page++;
    } while (!allPagesParsed);
  });
})();
