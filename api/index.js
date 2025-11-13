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
    // 1. Unfeature dynamic posts (excluding permanent ones)
    const filterToUnfeature = `featured:true+tag:-${PERMANENT_FEATURE_TAG}`;
    
    // Standardize API call 1
    let postsToUnfeature = [];
    try {
        const dynamicFeaturedResponse = await api.posts.browse({
            filter: filterToUnfeature,
            limit: 'all'
        });
        postsToUnfeature = dynamicFeaturedResponse.posts || []; 
    } catch (e) {
        console.error('Error fetching dynamic featured posts:', e.message);
        // Continue, as this is non-critical if the post doesn't exist
    }

    for (const currentFeatured of postsToUnfeature) {
        await api.posts.edit({ ...currentFeatured, featured: false });
    }

    // 2. Get ALL eligible Post IDs and select one randomly in the script.
    const filterForRandom = `status:published+tag:-${PERMANENT_FEATURE_TAG}`;
    let eligiblePosts = [];
    
    // Standardize API call 2 (Fetching ALL eligible post IDs)
    try {
        const response = await api.posts.browse({
            filter: filterForRandom,
            limit: 'all', // Request all posts
            fields: 'id' // Only request the ID field to be efficient
        });
        
        // This array will contain only objects with { id: '...' }
        eligiblePosts = response.posts || []; 
    } catch (e) {
        throw new Error(`Failed to retrieve eligible post IDs from Ghost: ${e.message}`);
    }

    if (eligiblePosts.length === 0) {
        throw new Error('No eligible posts found for randomization after retrieving IDs.');
    }
    
    const totalCount = eligiblePosts.length;
    
    // 3. Select a new random post ID locally
    const randomIndex = Math.floor(Math.random() * totalCount);
    const newFeaturedPostId = eligiblePosts[randomIndex].id;

    // 4. Fetch the full data for the selected post (this call is guaranteed to work)
    let newFeaturedPost;
    try {
        newFeaturedPost = await api.posts.read({ id: newFeaturedPostId });
    } catch (e) {
        throw new Error(`Failed to fetch full data for random post ID ${newFeaturedPostId}: ${e.message}`);
    }

    if (!newFeaturedPost) {
        // This check should never fail now, but it's kept for safety.
        throw new Error('Could not find post at random index for featuring.'); 
    }

    // 5. Feature the new post
    const updatedPost = await api.posts.edit({ ...newFeaturedPost, featured: true });
    return updatedPost.title;
}

// ... (The module.exports handler remains the same below this function)

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
