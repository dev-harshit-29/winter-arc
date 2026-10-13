# Winter Arc

Professional fitness tracking dashboard with authenticated MongoDB persistence.

## Run locally

1. Install Node.js 18 or newer.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` to your MongoDB Atlas connection string and replace `JWT_SECRET` with a long random value.
4. Install dependencies and start the application:

```bash
npm install
npm start
```

Open `http://localhost:8000`. Create an account using **Create account** before entering
tracker data. Registration writes the user document immediately; tracker changes are then
saved to that user's MongoDB document. MongoDB creates the `winter_arc` database and `users`
collection on application startup.

If startup reports `querySrv ECONNREFUSED`, the local DNS server is refusing MongoDB's SRV
lookup. The Atlas URI in this project uses the correct hostname from the screenshot:
`cluster0.i2pd30l.mongodb.net` (lowercase `l`). Change the active network adapter DNS to
`1.1.1.1` or `8.8.8.8`, reconnect to Wi-Fi, and restart the server. You can confirm the
record with `Resolve-DnsName -Server 8.8.8.8 -Type SRV _mongodb._tcp.cluster0.i2pd30l.mongodb.net`.
Also verify that your current IP is allowed in **Security > Network Access**.

## Production checklist

- Rotate the database password if it has been shared outside your deployment environment.
- Restrict MongoDB Atlas network access to the application server.
- Use a secret manager for `MONGODB_URI` and `JWT_SECRET`.
- Deploy behind HTTPS and set a production `PORT`.

The dashboard supports dark, light, and glass themes from the palette control in the header.

## GitHub Pages preview

GitHub Pages can host the static dashboard preview using the included
`.github/workflows/pages.yml` workflow:

1. Create a GitHub repository and push this project to the `main` branch.
2. In the repository, open **Settings > Pages**.
3. Set **Source** to **GitHub Actions**.
4. Push to `main` or manually run **Deploy Winter Arc to GitHub Pages** from the Actions tab.
5. Open the Pages URL shown by the workflow.

GitHub Pages only serves static files. It cannot run `server.js`, Netlify Functions, or connect
directly to MongoDB. Therefore the Pages URL is a UI preview; registration, login, and tracker
sync require the API deployment described in the Netlify section below. Do not put
`MONGODB_URI` or `JWT_SECRET` in GitHub Pages or frontend code.

## Deploy to Netlify

This repository includes a Netlify Function for the Express API and routing in
`netlify.toml`.

1. Push the project to GitHub. `.env` and `node_modules` are excluded by `.gitignore`.
2. In Netlify, choose **Add new site > Import an existing project** and select the repository.
3. Use the repository root as the base directory. The included configuration publishes the
   frontend and discovers `netlify/functions`.
4. Add these Netlify environment variables:

```text
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<long-random-production-secret>
NODE_VERSION=20
```

5. In MongoDB Atlas, allow the deployed function to connect under **Security > Network Access**.
6. Deploy and verify `https://your-site.netlify.app/api/health`.

Netlify serves `index.html` and routes `/api/*` to the serverless Express function. MongoDB
Atlas remains the persistent database; user documents are stored in the `winter_arc.users`
collection.