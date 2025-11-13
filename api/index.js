import GhostAdminAPI from '@tryghost/admin-api';

// ⚠️ Get secrets from environment variables (safe and secure)
const ADMIN_API_URL = process.env.GHOST_ADMIN_URL;
const ADMIN_API_KEY = process.env.GHOST_ADMIN_KEY;
const PERMANENT_FEATURE_TAG = 'hash-permanent-feature'; 

const api = new GhostAdminAPI({
    url: ADMIN_API_URL,
    key: ADMIN_API_KEY,
    version: 'v6.0' // Make sure this matches your Ghost version
});

async function updateFeaturedPost() {
    // 1. Unfeature dynamic posts (excluding permanent ones)
    const filterToUnfeature = `featured:true+tag:-${PERMANENT_FEATURE_TAG}`;
    const dynamicFeaturedPosts = await api.posts.browse({
        filter: filterToUnfeature,
        limit: 'all'
    });

    for (const currentFeatured of dynamicFeaturedPosts.posts) {
        await api.posts.edit({ ...currentFeatured, featured: false });
        // console.log(`Unfeatured dynamic post: ${currentFeatured.title}`);
    }

    // 2. Get Total Count of eligible posts (excluding permanent ones)
    const filterForRandom = `status:published+tag:-${PERMANENT_FEATURE_TAG}`;
    const { meta } = await api.posts.browse({
        filter: filterForRandom,
        limit: 'all', 
        fields: 'id' 
    });
    const totalCount = meta.pagination.total;

    if (totalCount === 0) {
        throw new Error('No eligible posts found for randomization.');
    }

    // 3. Select and feature the new random post
    const randomIndex = Math.floor(Math.random() * totalCount);
    
    const [newFeaturedPost] = await api.posts.browse({
        filter: filterForRandom,
        limit: 1,
        page: randomIndex + 1
    }).then(data => data.posts);

    if (!newFeaturedPost) {
        throw new Error('Could not find post at random index.');
    }

    // 4. Feature the new post
    const updatedPost = await api.posts.edit({ ...newFeaturedPost, featured: true });
    return updatedPost.title;
}

// 5. The function handler that the serverless environment expects
export default async function handler(req, res) {
    try {
        const title = await updateFeaturedPost();
        // Return a successful HTTP response that EasyCron expects
        res.status(200).json({ 
            success: true, 
            message: `Successfully featured new post: ${title}` 
        });
    } catch (error) {
        // Return an error HTTP response if the job fails
        res.status(500).json({ 
            success: false, 
            message: `Cron job failed: ${error.message}` 
        });
    }
}