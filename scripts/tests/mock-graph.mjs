import http from "node:http";
import fs from "node:fs";
let n = 0;
const log = process.argv[2];
http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    fs.appendFileSync(log, JSON.stringify({ path: req.url, auth: req.headers.authorization ? "yes" : "no", body: body ? JSON.parse(body) : null }) + "\n");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ messages: [{ id: `wamid.mock${++n}` }] }));
  });
}).listen(3199, () => console.log("mock on 3199"));
