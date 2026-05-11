# Pokémon Card Dashboard — TCGdex + CardTrader

แดชบอร์ดดูข้อมูลการ์ดโปเกมอน **ภาษาญี่ปุ่น** ปี **2023–2026**
- 📚 **Card data:** [TCGdex API](https://tcgdex.dev/) — ฟรี ไม่ต้องใช้ key
- 💰 **Pricing data:** [CardTrader API](https://www.cardtrader.com/) — ตลาด resell ยุโรป (มีการ์ด JP)

## Features

- ดึง Expansions อัตโนมัติจาก Series Scarlet & Violet + Mega → กรองปี 2023–2026
- คลิกการ์ด → ดูรายละเอียด + **ราคาจริงจาก CardTrader** (Lowest, Average, Median, Highest)
- แสดง 5 listings ที่ถูกที่สุด พร้อม condition, seller, ประเทศ
- ค้นหาการ์ดและชุดด้วยชื่อภาษาญี่ปุ่น
- Cache ทุกชั้น (browser localStorage + Vercel Edge) — ประหยัด API quota

## โครงสร้างไฟล์

```
pokemon-card-dashboard/
├── index.html       # UI + เรียก TCGdex โดยตรง + เรียก /api/price
├── api/
│   └── price.js     # Vercel serverless proxy → CardTrader API
├── vercel.json
├── .gitignore
└── README.md
```

## ตั้งค่าก่อนใช้งาน

### 1. ขอ CardTrader API Token (ฟรี)

1. ไปที่ https://www.cardtrader.com/ → Login / Sign up
2. ไปที่ **Settings → API** หรือ https://www.cardtrader.com/users/api_apps
3. กด **Create new app** → ตั้งชื่อ → Generate
4. Copy **JWT token** (ขึ้นต้นด้วย `eyJ...`)

> ⚠️ Token นี้เปรียบเสมือนรหัสผ่าน — เก็บไว้ใน Vercel Environment Variables เท่านั้น **ห้ามใส่ในโค้ด**

### 1.5. (ทางเลือก) ขอ Google Cloud Vision API Key — สำหรับ "📷 Scan Card"

1. ไปที่ https://console.cloud.google.com → สร้าง project ใหม่ (ฟรี)
2. เปิด API: https://console.cloud.google.com/apis/library/vision.googleapis.com → กด **Enable**
3. ไปที่ https://console.cloud.google.com/apis/credentials → **Create credentials → API key**
4. Copy key (ขึ้นต้น `AIza...`)
5. (แนะนำ) จำกัดสิทธิ์ key ให้ใช้ได้แค่ Vision API
6. **Free tier:** 1,000 TEXT_DETECTION calls / เดือน (เพียงพอใช้ส่วนตัว)

### 2. Deploy บน Vercel

1. Push repo ขึ้น GitHub
2. ไปที่ [vercel.com/new](https://vercel.com/new) → Import repo
3. ก่อนกด Deploy → **Settings → Environment Variables** ใส่:

   | Name | Value | Required |
   |---|---|---|
   | `CARDTRADER_TOKEN` | (JWT token จาก CardTrader) | ✅ pricing |
   | `GOOGLE_VISION_API_KEY` | (Google Cloud API key) | ⚪ optional, สำหรับ scan |

4. กด Deploy
5. ถ้าใส่ env หลัง deploy แล้ว → กด **Redeploy** เพื่อให้มีผล

### 3. Local Development

```powershell
# 1. คัดลอก template
copy .env.local.example .env.local

# 2. แก้ .env.local ใส่ token
# CARDTRADER_TOKEN=eyJ...

# 3. รัน
npx vercel dev
# เปิด http://localhost:3000
```

## API Endpoints

| Endpoint | คำอธิบาย | Cache |
|---|---|---|
| `GET /api/price?expansion_code=sv10&collector_number=039` | ดึงราคาจาก CardTrader | 10 นาที |
| `POST /api/ocr` (body: `{ image: <base64> }`) | OCR ภาพการ์ด via Google Vision → ใช้ใน "📷 Scan Card to Add" | — |

**Response shape:**
```json
{
  "expansion": { "id": 4036, "name": "The Glory of Team Rocket", "code": "sv10" },
  "results": [{
    "blueprint_id": 326681,
    "name_en": "Team Rocket's Mewtwo ex",
    "version": "Ultra Rare | 039/098",
    "stats": {
      "currency": "USD",
      "symbol": "$",
      "count": 12,
      "lowest": 0.45,
      "average": 0.62,
      "median": 0.58,
      "highest": 1.20
    },
    "sample_listings": [{
      "price": 0.45,
      "formatted": "$0.45",
      "condition": "Near Mint",
      "seller": "Arcana",
      "country": "IT"
    }]
  }]
}
```

## ข้อจำกัด / สิ่งที่ควรรู้

| เรื่อง | รายละเอียด |
|---|---|
| ภาษาที่ filter | เฉพาะ `pokemon_language: "jp"` (ตัด listing ที่เป็น EN/KR/CN ออก) |
| ความครอบคลุม | ขึ้นกับว่าใน CardTrader มี seller ขายการ์ดใบนั้นหรือเปล่า — บางใบอาจไม่มี |
| สกุลเงิน | ส่วนใหญ่ EUR หรือ USD (ขึ้นกับ seller) |
| ราคาตลาดญี่ปุ่นแท้ๆ | ✗ — CardTrader คือตลาดยุโรป ราคาจะแพงกว่าที่ Yuyutei เพราะค่าส่ง+ภาษี |

## Troubleshooting

| Error | วิธีแก้ |
|---|---|
| `missing_credentials` | ลืมใส่ `CARDTRADER_TOKEN` ใน Vercel env vars |
| `expansion_not_found` | CardTrader ยังไม่มีชุดนี้ในระบบ (ปกติช้ากว่า TCGdex 2-4 สัปดาห์) |
| `CardTrader 401` | Token หมดอายุ หรือผิด — สร้างใหม่ที่ Settings → API |
| `CardTrader 429` | ถูก rate limit — รอ 1 นาที |

## License

MIT
