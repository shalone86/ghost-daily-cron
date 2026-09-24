This code chooses random posts to be featured for each day. Perfect for image-focused Ghost websites.
Step 1. Copy the repository and upload it to a serverless site, like Vercel.
Step 2. Make 2 Environment Variables
GHOST_ADMIN_KEY [your key, which you can create in Ghost under custom integrations, goes here]
GHOST_ADMIN_URL [your Ghost URL goes here]
Step 3. Take the Vercel deploy URL, add /api, and post that to a cron website (EasyCron for example).
Step 4. Choose how often you want the featured images to change in your cron settings
Step 5. Publish the cron job and test it.

Weekly newsletter (api/newsletter.js)
Post /api/newsletter to your cron service once a week. Each run emails one featured image plus a 2-by-2 grid of 4 more, preferring images no earlier newsletter has featured. Free members see an invitation to give; paid members see a thank-you.
To preview without emailing anyone, open /api/newsletter?draft=1. It leaves a draft in Ghost that you can open and send yourself as a test email, then delete.
The function may run for up to 60 seconds (set in vercel.json). If a newsletter already went out in the last 3 days, the run is skipped, so a cron retry can't send twice.
