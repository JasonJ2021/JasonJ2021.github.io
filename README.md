# Jason Sun's site

Tokyo's orange highlight covers the 23 special wards only. The local file
`data/tokyo-23-wards.geojson` is derived from
[dataofjapan/land's tokyo.topojson](https://github.com/dataofjapan/land/blob/master/tokyo.topojson),
using only the `Tokubu` features. Source: Global Map Japan, Geospatial Information
Authority of Japan (GSI). This is a simplified, historical boundary for a travel
map; it excludes the Tama area and the outlying islands. Tokyo's local boundary
takes precedence over previously cached geocoding results.

纯静态网站，无需构建，直接部署到 GitHub Pages / Vercel / Cloudflare Pages 都行。

```
index.html               主页（个人信息、链接、足迹预览、Fun pages）
assets/style.css         全站样式；配色都在顶部的 CSS 变量里（--accent 等）
assets/site.js           明暗主题切换 + 状态栏上海时间
assets/footmap.js        地图公共代码（主页预览和足迹页共用）
assets/fonts, vendor/    本地字体和 Leaflet（不依赖外部 CDN）
footprints/              足迹地图页
data/footprints.json     ← 足迹数据，只需要改这个
scripts/add-city.mjs     自动查坐标并添加城市
```

## 本地预览

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

（不要直接双击 html 打开，浏览器会拦截读取 json。）

## 点亮一座城市

**方法一：脚本（推荐，自动查经纬度）**

```bash
node scripts/add-city.mjs 杭州                        # 记为本月到访
node scripts/add-city.mjs 杭州 --date 2024-03 --note "西湖"
node scripts/add-city.mjs Kyoto --name 京都            # 用英文查，用中文显示
node scripts/add-city.mjs 上海 --lived                 # 常住城市，会有呼吸灯效果
```

同一个城市再跑一次 = 多记一次到访，地图上会更亮。

**方法二：手改 `data/footprints.json`**

```json
{
  "name": "成都",
  "country": "中国",
  "lat": 30.5728,
  "lng": 104.0668,
  "visits": ["2024-07", "2025-01"],
  "lived": false,
  "note": "可选备注"
}
```

- `visits`：每次到访一条 `YYYY-MM`，数量决定亮度；年份筛选也靠它
- `lived`、`note` 可省略

> 当前数据为实际到访记录；`visits` 中的空字符串表示日期未知。

## Publish to GitHub Pages

Run from any directory:

```bash
bash /Users/jason/code/self-project/site/scripts/publish-pages.sh
```

The script uses Git and GitHub CLI (`gh`), opens GitHub login if needed, creates
`JasonJ2021/jasonj2021.github.io` as a public repository if it does not exist,
enables Pages through GitHub Actions, uploads the website, and waits for the
deployment result. A newly initialized local repository adopts the existing
remote history while keeping the current website files. If local commits already
exist and the remote contains history missing locally, it stops. It never uses a
force push. If an existing repository is private, it stops without changing its
visibility.

Expected URL after a successful deployment: https://jasonj2021.github.io/

The workflow in `.github/workflows/pages.yml` publishes only `index.html`,
`.nojekyll`, `assets/`, `data/`, and `footprints/`. Later updates deploy when
pushed to `main`:

```bash
git add data/footprints.json
git commit -m "Update travel history"
git push
```
