#!/usr/bin/env node
// Light up a city: looks up coordinates on OpenStreetMap (Nominatim) and adds
// it to data/footprints.json. If the city is already there, just records another visit.
//
//   node scripts/add-city.mjs 杭州
//   node scripts/add-city.mjs 杭州 --date 2025-10 --note "西湖边散步"
//   node scripts/add-city.mjs "Kyoto" --name 京都
//   node scripts/add-city.mjs 上海 --lived
//
// Flags: --date YYYY-MM (default: this month)  --note TEXT  --name 显示名  --lived
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const DATA = fileURLToPath(new URL("../data/footprints.json", import.meta.url));

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--lived") flags.lived = true;
  else if (args[i].startsWith("--")) flags[args[i].slice(2)] = args[++i];
  else positional.push(args[i]);
}
const query = positional.join(" ");
if (!query) {
  console.error("用法: node scripts/add-city.mjs <城市> [--date YYYY-MM] [--note 备注] [--name 显示名] [--lived]");
  process.exit(1);
}
const date = flags.date ?? new Date().toISOString().slice(0, 7);
const name = flags.name ?? query;

const places = JSON.parse(await readFile(DATA, "utf8"));
let place = places.find((p) => p.name === name);

if (place) {
  console.log(`${name} 已经点亮过，追加一次到访 ${date}`);
} else {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({ q: query, format: "jsonv2", addressdetails: "1", limit: "1", "accept-language": "zh-CN" });
  // curl (not fetch) so http(s)_proxy env vars are respected.
  const body = execFileSync("curl", ["-sS", "-m", "15", "-A", "jasonsun-footprints/1.0 (personal site)", url.href], { encoding: "utf8" });
  const [hit] = JSON.parse(body);
  if (!hit) {
    console.error(`找不到 “${query}”，换个写法试试（比如加上省份或国家：“苏州 江苏”）`);
    process.exit(1);
  }
  place = {
    name,
    country: hit.address?.country ?? "",
    lat: +(+hit.lat).toFixed(4),
    lng: +(+hit.lon).toFixed(4),
    visits: [],
  };
  places.push(place);
  console.log(`新点亮: ${name} → ${hit.display_name} (${place.lat}, ${place.lng})`);
}

place.visits = [...(place.visits ?? []), date].sort();
if (flags.note) place.note = flags.note;
if (flags.lived) place.lived = true;

await writeFile(DATA, JSON.stringify(places, null, 2) + "\n");
console.log(`已写入 data/footprints.json（共 ${places.length} 座城市）`);
