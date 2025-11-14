This code chooses random posts to be featured for each day. Perfect for image-focused Ghost websites.
Step 1. Copy the repository and upload it to a serverless site, like Vercel.
Step 2. Make 2 Environment Variables
GHOST_ADMIN_KEY [your key, which you can create in Ghost under custom integrations, goes here]
GHOST_ADMIN_URL [your Ghost URL goes here]
Step 3. Take the Vercel deploy URL, add /api, and post that to a cron website (EasyCron for example).
Step 4. Choose how often you want the featured images to change in your cron settings
Step 5. Publish the cron job and test it.
