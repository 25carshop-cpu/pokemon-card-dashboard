# Pokémon Card Dashboard — Scrydex Live

แดชบอร์ดดูข้อมูลการ์ดโปเกมอน **ภาษาญี่ปุ่น** ดึงข้อมูลแบบเรียลไทม์จาก [Scrydex API](https://scrydex.com/docs/pokemon/api-reference) — กรองเฉพาะชุดที่ออกในปี **2023–2026**

## Features

- ดึงรายการ Expansions จาก Scrydex (กรองอัตโนมัติ ปี 2023–2026)
- เลือกชุดเพื่อดูการ์ดทั้งหมดในชุดนั้น แสดงชื่อทั้งญี่ปุ่นและคำแปลอังกฤษ
- ค้นหาด้วยชื่อ JP/EN, rarity, series
- ฟิลเตอร์ตามประเภทพลังงาน (草/炎/水/雷/超...)
- คลิกการ์ดเพื่อดูรายละเอียดเต็ม — ワザ (Attacks), 弱点 (Weakness), にげる (Retreat), Market Pricing
- Cache 2 ชั้น (Vercel Edge + browser localStorage) เพื่อประหยัด API credits
- ปุ่ม Refresh สำหรับล้าง cache แล้วดึงข้อมูลใหม่

## โครงสร้างไฟล์

```
pokemon-card-dashboard/
├── index.html              # UI ทั้งหมด (HTML + CSS + JS)
├── api/
│   ├── expansions.js       # GET /api/expansions  → list + filter 2023-2026
│   ├── cards.js            # GET /api/cards?exp=  → cards in expansion
│   └── card.js             # GET /api/card?id=    → single card + pricing
├── vercel.json             # Vercel config
├── .env.local.example      # template สำหรับ local dev
├── .gitignore
└── README.md
```

## ตั้งค่าก่อนใช้งาน

ต้องมี **Scrydex API Key + Team ID** ก่อน — สมัครและดึงค่าได้ที่ [scrydex.com/login](https://scrydex.com/login)
1. Login → เข้า Scrydex Account Hub
2. สร้าง Team → ได้ **Team ID**
3. Subscribe แพลน → กด Generate **API Key**

### Deploy บน Vercel (แนะนำ)

1. Push repo ขึ้น GitHub
2. ไปที่ [vercel.com/new](https://vercel.com/new) → Import repo
3. ก่อนกด Deploy → **Settings → Environment Variables** ใส่:
   ```
   SCRYDEX_API_KEY = <api key ของคุณ>
   SCRYDEX_TEAM_ID = <team id ของคุณ>
   ```
4. กด Deploy
5. ถ้าเพิ่ม env vars หลัง deploy แล้ว ต้อง **Redeploy** ครั้งหนึ่งเพื่อให้มีผล

### Local Development

```bash
# 1. คัดลอก template เป็นไฟล์จริง (ไม่ commit)
cp .env.local.example .env.local

# 2. แก้ไฟล์ .env.local ใส่ key จริง

# 3. รัน dev server (ต้องมี Vercel CLI)
npx vercel dev
# เปิดที่ http://localhost:3000
```

> **หมายเหตุ:** ต้องใช้ `vercel dev` ไม่สามารถใช้ `python -m http.server` ได้แล้ว เพราะมี Serverless Functions ใน `/api`

## API Endpoints (Internal Proxy)

ทุก endpoint รันบน Vercel Serverless Function — เก็บ API Key ไว้ฝั่ง server เท่านั้น

| Endpoint | คำอธิบาย | Cache |
|---|---|---|
| `GET /api/expansions` | ดึง expansions ปี 2023-2026 (ภาษา JP) | 1 ชม. |
| `GET /api/cards?exp=<id>` | ดึงการ์ดในชุด | 1 ชม. |
| `GET /api/card?id=<id>` | ดึงการ์ดใบเดียว + ราคา | 30 นาที |

## Cache Strategy

- **Vercel Edge Cache** — `s-maxage` + `stale-while-revalidate` ที่ HTTP header
- **Browser localStorage** — เก็บ JSON response ในเครื่อง user (TTL ตามแต่ละ endpoint)
- **Lazy pricing** — ดึงราคาเฉพาะตอนเปิด modal เพื่อไม่กิน API credit เกินจำเป็น
- ปุ่ม **↻ Refresh** ในแถบ toolbar ล้าง localStorage cache ทั้งหมด

## Troubleshooting

### `missing_credentials`
- ลืมใส่ env vars ใน Vercel หรือ `.env.local`
- ใส่แล้วแต่ลืม Redeploy บน Vercel

### `upstream_error 401`
- API Key หรือ Team ID ผิด ตรวจสอบที่ Scrydex Account Hub

### `upstream_error 429`
- ใช้เกิน quota ของแผน — รอ reset หรือ upgrade แผน

## License

MIT
