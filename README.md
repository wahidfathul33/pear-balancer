This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

### Run with Herd

- Create a new site in Herd and point it to this folder.
- Make sure the site domain in Herd points to port `7123`.
- Set the project to use the local Node version installed on your machine.
- Run `npm install` once if dependencies have not been installed yet.
- Start the app with `npm run dev`.
- If `http://generate-pear.test` still shows 404, restart the Herd site after the dev server is running.
- The app binds to `0.0.0.0:7123`, so Herd can proxy it correctly.

Open [http://localhost:7123](http://localhost:7123) with your browser to see the result.

#### Stop the server

If the terminal that started the server is still open, press `Ctrl+C`.

If the server is running in the background, find the process listening on port `7123`:

```bash
lsof -nP -iTCP:7123 -sTCP:LISTEN
```

Stop it using the PID shown in the output:

```bash
kill <PID>
```

Run the `lsof` command again to confirm the port is no longer in use. The Herd proxy remains configured, but the site will be unavailable until the Next.js server is started again.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
