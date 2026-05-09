# Deploying Furr Seasons to Railway

## One-time setup (~10 minutes)

### 1. Create accounts (free)
- github.com — create an account
- railway.app — sign up with GitHub

### 2. Push code to GitHub
- On github.com: New repository → name it "furr-seasons" → Create
- Upload all these files to it (drag and drop works)

### 3. Deploy on Railway
- railway.app → New Project → Deploy from GitHub repo
- Select "furr-seasons"
- Railway auto-detects Node.js and deploys

### 4. Set environment variables (CRITICAL)
In Railway dashboard → your project → Variables, add these:

| Variable | Value |
|---|---|
| NODE_ENV | production |
| SESSION_SECRET | (run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))") |
| ADMIN_USERNAME | admin |
| ADMIN_PASSWORD_HASH | (generate — see below) |
| ALLOWED_ORIGIN | https://YOUR-APP.up.railway.app |

### 5. Generate your password hash
On your computer (with Node installed):
```
node -e "const b=require('bcryptjs'); console.log(b.hashSync('YourNewPassword', 12))"
```
Paste the output as ADMIN_PASSWORD_HASH.

### 6. Get your URL
Railway → your project → Settings → Domains → Generate Domain
Your app is live at that URL. Open it, log in.

## After deployment
- The database lives on Railway's disk
- All devices (phone, laptop, staff phones) use the same URL
- Data is shared and always in sync
- To update: push new code to GitHub → Railway auto-redeploys

## Changing capacity later
Edit public/js/api.js → line: const MAX_CAPACITY = 20;
Change the number, push to GitHub.
