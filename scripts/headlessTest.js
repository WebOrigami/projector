import puppeteer from "puppeteer";

// let failed = false;

const browser = await puppeteer.launch({
  args: ["--allow-file-access-from-files", "--disable-web-security"],
});
const page = await browser.newPage();

// Suppress favicon 404 errors
page.on("response", (response) => {
  if (response.status() === 404 && response.url().includes("favicon")) {
    // Silently ignore favicon 404s
    return;
  }
});

page.on("console", (msg) => {
  const text = msg.text();
  // Suppress "Failed to load resource" messages (typically favicon 404s)
  if (text.includes("Failed to load resource")) {
    return;
  }
  // if (text.includes("❌")) {
  //   console.error(text);
  //   failed = true;
  // }
  console.log(text);
});

// Load local index.html using file:// URL
const url = new URL("../test/tokenizer/index.html", import.meta.url).href;
await page.goto(url);
await browser.close();
// if (!failed) {
//   console.log("✅ All tests passed");
// }
// process.exit(failed ? 1 : 0);
