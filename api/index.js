const GhostAdminAPI = require('@tryghost/admin-api');

// ⚠️ Get secrets from environment variables (safe and secure)
const ADMIN_API_URL = process.env.GHOST_ADMIN_URL;
const ADMIN_API_KEY = process.env.GHOST_ADMIN_KEY;
const PERMANENT_FEATURE_TAG = 'hash-permanent-feature'; 

const api = new GhostAdminAPI({
    url: ADMIN_API_URL,
    key: ADMIN_API_KEY,
    version: 'v6.0' // Make sure this matches your Ghost version
});

// ... (The rest of the script remains the same above this function)

async function updateFeaturedPost() {
    // We are keeping this logic simple and robust, fetching just one post at a time.

    // 1. Unfeature dynamic posts (excluding permanent ones)
    const filterToUnfeature = `featured:true+tag:-${PERMANENT_FEATURE_TAG}+visibility:public`;
    
    let postsToUnfeature = [];
    try {
        const dynamicFeaturedResponse = await api.posts.browse({
            filter: filterToUnfeature,
            limit: 'all'
        });
        postsToUnfeature = dynamicFeaturedResponse.posts || []; 
    } catch (e) {
        console.error('Error fetching dynamic featured posts for unfeaturing:', e.message);
    }

    for (const currentFeatured of postsToUnfeature) {
        await api.posts.edit({ ...currentFeatured, featured: false });
    }

    // 2. Select the FIRST eligible post (simplest test for success)
    const filterForRandom = `status:published+tag:-${PERMANENT_FEATURE_TAG}+visibility:public`;
    
    let newFeaturedPost;
    try {
        // Request just ONE post from the first page of the filtered set
        const data = await api.posts.browse({
            filter: filterForRandom,
            limit: 1, // Only get the very first post
            page: 1, // From the first page
            order: 'published_at DESC' // Order by newest first
        });
        
        // Safety check
        newFeaturedPost = data.posts && data.posts.length > 0 ? data.posts[0] : null;

    } catch (e) {
        throw new Error(`Failed to fetch a random post: ${e.message}`);
    }

    if (!newFeaturedPost) {
        // If this still fails, the problem is a severe misconfiguration in Ghost permissions.
        throw new Error('Could not find post at random index for featuring. Please verify Ghost permissions.');
    }

    // 3. Feature the new post
    const updatedPost = await api.posts.edit({ ...newFeaturedPost, featured: true });
    return updatedPost.title;
}

// 6. The function handler that the serverless environment expects
module.exports = async (req, res) => {
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
