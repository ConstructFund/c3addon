import puppeteer from "puppeteer";
const html = `<form id="f" action="about:blank"><input type="submit" id="b"
  onclick="return confirm('sure?')" value="Delete"></form>
  <script>document.getElementById('f').addEventListener('submit',e=>{e.preventDefault();document.title='SUBMITTED';});</script>`;
const url = "data:text/html," + encodeURIComponent(html);
const withTimeout = (p, ms) => Promise.race([p.then(() => "done"), new Promise(r => setTimeout(() => r("HUNG"), ms))]);

for (const mode of ["no listener", "accept"]) {
  const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  const p = await b.newPage();
  if (mode === "accept") p.on("dialog", (d) => d.accept());
  await p.goto(url);
  const outcome = await withTimeout(p.click("#b").catch(e => e.message), 4000);
  await new Promise((r) => setTimeout(r, 400));
  const submitted = await p.title().catch(() => "?");
  console.log(`${mode.padEnd(12)} -> click: ${String(outcome).padEnd(6)} | submitted: ${submitted === "SUBMITTED"}`);
  await b.close();
}
process.exit(0);
