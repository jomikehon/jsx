# 🌿 나의 하루 일기 - Cloudflare Pages 배포 가이드

## 로컬 개발

```bash
npm install
npm run dev       # http://localhost:5173
```

## Cloudflare Pages 배포 방법

### 방법 1: GitHub 연동 (추천)

1. 이 폴더를 GitHub에 push
   ```bash
   git init
   git add .
   git commit -m "first commit"
   git remote add origin https://github.com/your/repo.git
   git push -u origin main
   ```

2. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages** → **Create a project**

3. GitHub 연동 후 레포 선택

4. 빌드 설정:
   | 항목 | 값 |
   |------|-----|
   | Framework preset | `Vite` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |

5. **Save and Deploy** 클릭 → 자동 배포 완료!

### 방법 2: Wrangler CLI (직접 배포)

```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist --project-name my-daily-blog
```

## 빌드 결과물

```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   └── index-[hash].css
└── _redirects        ← SPA 라우팅 처리
```

## 기술 스택

- **React 18** + **Vite 6**
- **localStorage** - 브라우저 로컬 저장소 (서버 불필요)
- **Cloudflare Pages** - 무료 정적 호스팅

## 주의사항

- 데이터는 브라우저 localStorage에 저장됩니다
- 다른 기기에서는 데이터가 공유되지 않습니다
- 브라우저 데이터 초기화 시 일기가 삭제될 수 있습니다
