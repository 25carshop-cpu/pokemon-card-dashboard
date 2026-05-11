# Pokémon Card Dashboard — TCGdex Live

แดชบอร์ดดูข้อมูลการ์ดโปเกมอน **ภาษาญี่ปุ่น** ดึงข้อมูลแบบเรียลไทม์จาก [TCGdex API](https://tcgdex.dev/) — กรองเฉพาะชุดที่ออกในปี **2023–2026**

> ✅ **ไม่ต้องใช้ API Key** · ✅ Static site เปล่าๆ (ไม่ต้องมี backend) · ✅ Deploy ที่ Vercel / Netlify / GitHub Pages ได้หมด

## Features

- ดึงรายการ Expansions อัตโนมัติจาก Series **SV** (Scarlet & Violet) + **M** (Mega) แล้วกรองปี 2023–2026
- คลิกชุดเพื่อดูการ์ดทั้งหมด พร้อมรูปจริง
- คลิกการ์ดเพื่อดูรายละเอียดเต็ม — ワザ (Attacks), 弱点 (Weakness), 抵抗 (Resistance), にげる (Retreat)
- ค้นหาการ์ดและชุดด้วยชื่อภาษาญี่ปุ่น
- Cache ใน browser localStorage 24 ชม. (ครั้งแรก ~30 ชุด ต้องดึง detail; ครั้งต่อไปเปิดเร็ว)
- ปุ่ม Refresh สำหรับล้าง cache แล้วดึงใหม่

## โครงสร้างไฟล์

```
pokemon-card-dashboard/
├── index.html      # UI + JS เรียก TCGdex API ตรงจาก browser
├── vercel.json     # Vercel static config
├── .gitignore
└── README.md
```

ไม่มี backend, ไม่มี environment variables, ไม่มี API key

## API ที่ใช้

ทุก endpoint เรียกตรงจาก browser (TCGdex รองรับ CORS):

| Endpoint | คำอธิบาย |
|---|---|
| `GET /v2/ja/series/SV` | ดึงรายชื่อชุดใน Series Scarlet & Violet |
| `GET /v2/ja/series/M` | ดึงรายชื่อชุดใน Series Mega |
| `GET /v2/ja/sets/{id}` | ดึง metadata ของชุด + การ์ดทั้งหมด (รวม releaseDate) |
| `GET /v2/ja/cards/{id}` | ดึงรายละเอียดการ์ดใบเดียว |

## Deploy

### Vercel (แนะนำ)

1. Push repo ขึ้น GitHub
2. ไปที่ [vercel.com/new](https://vercel.com/new) → Import repo
3. กด **Deploy** (ไม่ต้องตั้ง env var ใดๆ)

### GitHub Pages

```bash
# ใน repo settings → Pages → Source = main branch / root
# หรือใช้ workflow:
# .github/workflows/pages.yml
```

### Local Preview

```powershell
# วิธีง่ายที่สุด
npx serve .
# หรือ
python -m http.server 8080
```

เปิด `http://localhost:8080` ในเบราว์เซอร์

## หมายเหตุเรื่อง Pricing

TCGdex ดึงราคาจาก **TCGplayer** (USD) และ **Cardmarket** (EUR) — แต่ตลาดทั้งสองนี้ขายเฉพาะการ์ด **ภาษาอังกฤษ/EU** เป็นหลัก ดังนั้นการ์ด **ภาษาญี่ปุ่นมักไม่มีข้อมูลราคา**

ถ้าอยากได้ราคาการ์ดญี่ปุ่นจริงๆ ต้องไปดึงจากตลาดอื่น เช่น:
- **Yuyutei** (遊々亭) — ตลาดใหญ่สุดในญี่ปุ่น (ไม่มี public API)
- **Cardrush** (カードラッシュ)
- **Snkrdunk** หรือ **Mercari** — Resell platforms

## License

MIT
