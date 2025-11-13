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

    // 2. Get Total Count of eligible posts
const filterForRandom = `status:published+tag:-${PERMANENT_FEATURE_TAG}`;
let totalCount = 0;

// Standardize API call 2 (Fetching Total Count)
try {
    const response = await api.posts.browse({
        filter: filterForRandom,
        limit: 1, // Only need one result, but the meta property returns the total count
        fields: 'id'
    });
    
    // Use optional chaining for safe access
    totalCount = response.meta?.pagination?.total || 0; 
} catch (e) {
    // If this fails, something is fundamentally wrong with the Ghost API connection
    throw new Error(`Failed to retrieve total post count from Ghost: ${e.message}`);
}

    // 3. Select and feature the new random post
    const randomIndex = Math.floor(Math.random() * totalCount);
    
    // Standardize API call 3
    let newFeaturedPost;
    try {
        const data = await api.posts.browse({
            filter: filterForRandom,
            limit: 1,
            page: randomIndex + 1
        });
        newFeaturedPost = data.posts && data.posts.length > 0 ? data.posts[0] : null;
    } catch (e) {
        throw new Error(`Failed to fetch random post: ${e.message}`);
    }

    if (!newFeaturedPost) {
        throw new Error('Could not find post at random index for featuring.');
    }

    // 4. Feature the new post
    const updatedPost = await api.posts.edit({ ...newFeaturedPost, featured: true });
    return updatedPost.title;
}
// ... (The rest of the script remains the same below this function)

// 5. The function handler that the serverless environment expects
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
